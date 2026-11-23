// Spiegelt medewerkers en het actuele Wonen-aanbod van één tenant uit Realworks (issue #4, ADR-005) en legt verkochte
// objecten vast als verkoopregels (ADR-010). Realworks toont een woning alleen tot die in het archief gaat, dus deze job
// draait dagelijks. Ruwe antwoorden gaan naar de blob-container raw-realworks; in de log staan alleen aantallen en statussen.
import {
  WONING_AGENDATYPES, bezichtigersZonderNaam, koppelGewonnen, leesBekendePlaatsen, leesMakelaarCodes, maakDb, metTenant, moduleAan, telSpiegel, upsertKoppelingVerkopen,
  upsertMedewerkers, upsertObjecten, upsertWaardebepalingen, vervangAgendapunten, vervangBezichtigingen, verwijderVervallenKoppelingVerkopen, werkWoningenBij,
  zetBezichtigerNamen, zoekTenant, type Tenant,
} from "@makelaarscockpit/db";
import {
  naarBezichtiging, naarWaardebepaling, objectNaarVerkoop,
  type AgendapuntGegevens, type BezichtigingUitRealworks, type ObjectGegevens, type VerkoopUitRealworks, type WaardebepalingUitRealworks,
} from "@makelaarscockpit/domain";
import { RealworksFout, haalAgendapunten, haalMedewerkers, haalRelatieNaam, haalWonenObjecten, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
import { leesSecret, omgeving, schrijfBlob, verwijderBlobsMetPrefix } from "./azure";
import { schoonIntakeOp } from "./intake/opschonen";

export async function syncRealworks(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const tokens = new Map<RealworksApi, Promise<string>>();
  const opties: RealworksOpties = {
    token: (api) => tokens.get(api) ?? tokens.set(api, leesSecret(`tenant-${tenantSleutel}-realworks-token-${api}`)).get(api)!,
  };
  const nu = new Date().toISOString();
  const map = `${tenantSleutel}/${nu.slice(0, 10)}/${nu.slice(11, 19).replaceAll(":", "")}`;

  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);

    const medewerkers = await haalMedewerkers(opties);
    await metTenant(db, tenant.id, (tx) => upsertMedewerkers(tx, tenant.id, medewerkers));
    console.log(`medewerkers gespiegeld: ${medewerkers.length}`);

    let pagina = 0;
    const objecten: ObjectGegevens[] = [];
    for await (const blok of haalWonenObjecten(opties)) {
      pagina += 1;
      await schrijfBlob("raw-realworks", `${map}-wonen-${String(pagina).padStart(3, "0")}.json`, JSON.stringify(blok.ruw));
      await metTenant(db, tenant.id, (tx) => upsertObjecten(tx, tenant.id, blok.objecten));
      objecten.push(...blok.objecten);
      console.log(`wonen pagina ${pagina}: ${blok.objecten.length} objecten (totaal volgens Realworks: ${blok.totaal ?? "onbekend"})`);
    }

    const stand = await metTenant(db, tenant.id, (tx) => telSpiegel(tx, tenant.id));
    console.log(`opgehaald: ${objecten.length} objecten; in de database: ${stand.objecten} objecten, ${stand.medewerkers} medewerkers`);
    console.log(`objecten per status: ${JSON.stringify(stand.perStatus)}`);

    await verkopenVastleggen(db, tenant.id, tenant.koppelingVerkopenVanaf, objecten);
    // Bezichtigersleads (ADR-019): alleen als de module voor deze tenant aan staat.
    const leadsAan = await metTenant(db, tenant.id, (tx) => moduleAan(tx, tenant.id, "bezichtigers"));
    const medewerkerIds = new Set(medewerkers.map((m) => m.realworksId));
    await agendaSpiegelen(db, tenant.id, tenant.afdelingscode, opties, map, leadsAan ? medewerkerIds : null);
    if (leadsAan) await bezichtigerNamenOphalen(db, tenant, opties);

    // Na het bijwerken van het bord: intakedossiers opschonen na verkoop of verwijderen na intrekken (ADR-015).
    const intake = await schoonIntakeOp(db, tenant.id, vandaagInNederland(), (prefix) => verwijderBlobsMetPrefix("intake", prefix));
    console.log(`intake: ${intake.opgeschoond} dossier(s) opgeschoond, ${intake.verwijderd} verwijderd`);
  } finally {
    await db.end();
  }
}

/** Verkochte objecten met een transactiedatum vanaf de startdatum van de koppeling worden verkoopregels (ADR-010). */
async function verkopenVastleggen(db: ReturnType<typeof maakDb>, tenantId: string, verkopenVanaf: string | null, objecten: ObjectGegevens[]): Promise<void> {
  if (verkopenVanaf === null) {
    console.log("verkopen uit de koppeling: uit (geen startdatum voor deze tenant)");
    return;
  }
  await metTenant(db, tenantId, async (tx) => {
    const makelaars = await leesMakelaarCodes(tx, tenantId);
    const verkopen = objecten
      .map((o) => objectNaarVerkoop(o, makelaars, { verkopenVanaf }))
      .filter((v): v is VerkoopUitRealworks => v !== null);
    const zonderMakelaar = verkopen.filter((v) => v.makelaar === "Onbekend").length;
    const uitkomst = await upsertKoppelingVerkopen(tx, tenantId, verkopen);
    const vervallen = await verwijderVervallenKoppelingVerkopen(tx, tenantId);
    console.log(
      `verkopen uit de koppeling (vanaf ${verkopenVanaf}): ${verkopen.length} verkocht, ${uitkomst.nieuw} nieuw, ${uitkomst.bijgewerkt} bijgewerkt, ` +
        `${uitkomst.zonderObject} zonder object, ${zonderMakelaar} zonder bekende makelaar; vervallen: ${vervallen.verwijderd} verwijderd, ${vervallen.bewaard} bewaard (al ingevuld)`,
    );
  });
}

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * De agenda (issue #9 en #10). De Agenda-API kent geen filters, dus de hele agenda komt langs. Bewaard worden alleen
 * waardebepalingen en de afspraken die bij een woning horen (verkoopgesprek, foto's, tekenafspraak, ...), zonder notities.
 * Daarna wordt het bord "Woningen in verkoop" bijgewerkt. Alleen waardebepalingen gaan als ruw antwoord naar de blob.
 * Met medewerkerIds (module bezichtigers aan, ADR-019) worden ook bezichtigingen met een gekoppelde klant gespiegeld.
 */
async function agendaSpiegelen(
  db: ReturnType<typeof maakDb>, tenantId: string, afdelingscode: string | null, opties: RealworksOpties, map: string, medewerkerIds: ReadonlySet<number> | null,
): Promise<void> {
  if (!afdelingscode) {
    console.log("agenda: overgeslagen (tenant zonder afdelingscode)");
    return;
  }
  const waardebepalingen: WaardebepalingUitRealworks[] = [];
  const woningAfspraken: AgendapuntGegevens[] = [];
  const bezichtigingen: BezichtigingUitRealworks[] = [];
  const ruw: unknown[] = [];
  let paginas = 0;
  let agendapunten = 0;
  for await (const blok of haalAgendapunten(opties, afdelingscode)) {
    paginas += 1;
    agendapunten += blok.agendapunten.length;
    blok.agendapunten.forEach((a, i) => {
      const w = naarWaardebepaling(a);
      if (w) {
        waardebepalingen.push(w);
        ruw.push(blok.ruw[i]);
      }
      if (a.agendatype && WONING_AGENDATYPES.has(a.agendatype)) woningAfspraken.push(a);
      const b = medewerkerIds && naarBezichtiging(a, medewerkerIds);
      if (b) bezichtigingen.push(b);
    });
  }
  await schrijfBlob("raw-realworks", `${map}-agenda-waardebepalingen.json`, JSON.stringify(ruw));
  const uitkomst = await metTenant(db, tenantId, async (tx) => {
    const plaatsen = await leesBekendePlaatsen(tx, tenantId);
    const stand = await upsertWaardebepalingen(tx, tenantId, waardebepalingen, plaatsen);
    const gewonnen = await koppelGewonnen(tx, tenantId);
    return { ...stand, gewonnen };
  });
  console.log(
    `agenda: ${paginas} pagina's, ${agendapunten} agendapunten, ${waardebepalingen.length} waardebepalingen; ${uitkomst.nieuw} nieuw, ${uitkomst.bijgewerkt} bijgewerkt, ${uitkomst.gewonnen} nieuw gekoppeld aan een woning (gewonnen)`,
  );
  const bord = await metTenant(db, tenantId, async (tx) => {
    const bewaard = await vervangAgendapunten(tx, tenantId, woningAfspraken);
    const telling = await werkWoningenBij(tx, tenantId, vandaagInNederland(), await leesBekendePlaatsen(tx, tenantId));
    return { bewaard, telling };
  });
  console.log(`woningen in verkoop: ${bord.bewaard} afspraken bij woningen bewaard; op het bord: ${JSON.stringify(bord.telling)}`);

  // Een lege agenda is een storing, geen opdracht om alle bezichtigingen te wissen.
  if (medewerkerIds && agendapunten > 0) {
    const leads = await metTenant(db, tenantId, (tx) => vervangBezichtigingen(tx, tenantId, bezichtigingen));
    console.log(`bezichtigers: ${leads.bezichtigingen} bezichtigingen van ${leads.bezichtigers} bezichtigers; ${leads.verwijderd} verdwenen bezichtigingen verwijderd`);
  }
}

const NAMEN_TEGELIJK = 5;
const NAMEN_TIJDSBUDGET_MS = 5 * 60 * 1000;

/**
 * Haalt de naam op van bezichtigers die er nog geen hebben (ADR-019), een paar tegelijk en binnen een tijdsbudget; wat
 * overblijft, volgt bij de volgende run. In de log staan alleen aantallen en een HTTP-status, nooit een naam of relatie-id.
 */
async function bezichtigerNamenOphalen(db: ReturnType<typeof maakDb>, tenant: Tenant, opties: RealworksOpties): Promise<void> {
  const ids = await metTenant(db, tenant.id, (tx) => bezichtigersZonderNaam(tx, tenant.id, 10_000));
  let codes = [tenant.bedrijfscode, tenant.afdelingscode].filter((c): c is string => Boolean(c));
  if (ids.length === 0 || codes.length === 0) {
    console.log(`bezichtigers: ${ids.length} namen op te halen${codes.length === 0 ? " (tenant zonder bedrijfscode, overgeslagen)" : ""}`);
    return;
  }
  // Een verkeerde code geeft 400 of 404. Daarom proberen we bij zo'n antwoord ook de andere code; de code die werkt, komt vooraan.
  const naamVan = async (relatieId: number) => {
    let laatste: RealworksFout | null = null;
    for (const code of [...codes]) {
      try {
        const uitkomst = await haalRelatieNaam(opties, relatieId, code);
        if (!uitkomst.gevonden) continue;
        if (codes[0] !== code) codes = [code, ...codes.filter((c) => c !== code)];
        return uitkomst;
      } catch (fout) {
        if (!(fout instanceof RealworksFout) || fout.status !== 400) throw fout;
        laatste = fout;
      }
    }
    if (laatste) throw laatste;
    return { gevonden: false } as const;
  };
  const start = Date.now();
  let opgehaald = 0;
  let onbekend = 0;
  let gestopt: string | null = null;
  for (let i = 0; i < ids.length && !gestopt; i += NAMEN_TEGELIJK) {
    if (Date.now() - start > NAMEN_TIJDSBUDGET_MS) {
      gestopt = "tijdsbudget op";
      break;
    }
    const uitkomsten = await Promise.allSettled(ids.slice(i, i + NAMEN_TEGELIJK).map(async (relatieId) => ({ relatieId, uitkomst: await naamVan(relatieId) })));
    const namen = uitkomsten.flatMap((u) => (u.status === "fulfilled" ? [{ relatieId: u.value.relatieId, naam: u.value.uitkomst.gevonden ? u.value.uitkomst.naam : null }] : []));
    await metTenant(db, tenant.id, (tx) => zetBezichtigerNamen(tx, tenant.id, namen));
    opgehaald += namen.length;
    onbekend += uitkomsten.filter((u) => u.status === "fulfilled" && !u.value.uitkomst.gevonden).length;
    const mislukt = uitkomsten.find((u) => u.status === "rejected");
    if (mislukt) gestopt = mislukt.reason instanceof RealworksFout ? `Realworks gaf status ${mislukt.reason.status}` : "onverwachte fout";
  }
  console.log(`bezichtigers: ${opgehaald} van ${ids.length} namen opgehaald (${onbekend} relaties niet meer in Realworks)${gestopt ? `; gestopt: ${gestopt}, de rest volgt bij de volgende run` : ""}`);
}
