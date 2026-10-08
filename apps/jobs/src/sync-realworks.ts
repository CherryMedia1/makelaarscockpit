// Spiegelt medewerkers en het actuele Wonen-aanbod van één tenant uit Realworks (issue #4, ADR-005) en legt verkochte
// objecten vast als verkoopregels (ADR-010). Realworks toont een woning alleen tot die in het archief gaat, dus deze job
// draait dagelijks. Ruwe antwoorden gaan naar de blob-container raw-realworks; in de log staan alleen aantallen en statussen.
import {
  WONING_AGENDATYPES, koppelGewonnen, leesBekendePlaatsen, leesMakelaarCodes, maakDb, metTenant, telSpiegel, upsertKoppelingVerkopen, upsertMedewerkers,
  upsertObjecten, upsertWaardebepalingen, vervangAgendapunten, verwijderVervallenKoppelingVerkopen, werkWoningenBij, zoekTenant,
} from "@makelaarscockpit/db";
import {
  naarWaardebepaling, objectNaarVerkoop,
  type AgendapuntGegevens, type ObjectGegevens, type VerkoopUitRealworks, type WaardebepalingUitRealworks,
} from "@makelaarscockpit/domain";
import { haalAgendapunten, haalMedewerkers, haalWonenObjecten, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
import { leesSecret, omgeving, schrijfBlob } from "./azure";

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
    await agendaSpiegelen(db, tenant.id, tenant.afdelingscode, opties, map);
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
 */
async function agendaSpiegelen(db: ReturnType<typeof maakDb>, tenantId: string, afdelingscode: string | null, opties: RealworksOpties, map: string): Promise<void> {
  if (!afdelingscode) {
    console.log("agenda: overgeslagen (tenant zonder afdelingscode)");
    return;
  }
  const waardebepalingen: WaardebepalingUitRealworks[] = [];
  const woningAfspraken: AgendapuntGegevens[] = [];
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
}
