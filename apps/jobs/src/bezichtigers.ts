// Bezichtigersleads (ADR-019): bezichtigingen spiegelen en namen ophalen, gedeeld door de dagelijkse sync en de job die
// een verzoek uit het portaal verwerkt (issue #51). In de log staan alleen id's van tenant en run, aantallen en een HTTP-status.
import {
  bezichtigersZonderNaam, maakDb, metTenant, moduleAan, rondBezichtigerSyncAf, startBezichtigerSync, vervangBezichtigingen, zetBezichtigerNamen, zoekTenantOpId,
  type Db, type Tenant,
} from "@makelaarscockpit/db";
import { bezichtigingenVanaf, naarBezichtiging, type BezichtigingUitRealworks } from "@makelaarscockpit/domain";
import { RealworksFout, haalAgendapunten, haalMedewerkers, haalRelatieNaam, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
import { leesSecret } from "./azure";
import { verwerkWachtrij, type Uitkomst } from "./wachtrij";

/** Realworks-tokens van één tenant uit Key Vault, per API één keer opgehaald. */
export function realworksOpties(tenantSleutel: string): RealworksOpties {
  const tokens = new Map<RealworksApi, Promise<string>>();
  return { token: (api) => tokens.get(api) ?? tokens.set(api, leesSecret(`tenant-${tenantSleutel}-realworks-token-${api}`)).get(api)! };
}

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * Leest de hele agenda (de Agenda-API kent geen filters) en vervangt de gespiegelde bezichtigingen. Andere agendapunten
 * worden niet bewaard. Een lege agenda is een storing, geen opdracht om alles te wissen.
 */
export async function spiegelBezichtigingen(db: Db, tenant: Tenant, opties: RealworksOpties): Promise<{ bezichtigingen: number; bezichtigers: number }> {
  if (!tenant.afdelingscode) throw new Error("tenant zonder afdelingscode");
  const medewerkerIds = new Set((await haalMedewerkers(opties)).map((m) => m.realworksId));
  const vanaf = bezichtigingenVanaf(vandaagInNederland());
  const bezichtigingen: BezichtigingUitRealworks[] = [];
  let agendapunten = 0;
  for await (const blok of haalAgendapunten(opties, tenant.afdelingscode)) {
    agendapunten += blok.agendapunten.length;
    for (const a of blok.agendapunten) {
      const b = naarBezichtiging(a, medewerkerIds, vanaf);
      if (b) bezichtigingen.push(b);
    }
  }
  if (agendapunten === 0) throw new Error("Realworks gaf een lege agenda");
  const stand = await metTenant(db, tenant.id, (tx) => vervangBezichtigingen(tx, tenant.id, bezichtigingen));
  console.log(`bezichtigers: ${agendapunten} agendapunten gelezen; ${stand.bezichtigingen} bezichtigingen van ${stand.bezichtigers} bezichtigers; ${stand.verwijderd} verdwenen bezichtigingen verwijderd`);
  return { bezichtigingen: stand.bezichtigingen, bezichtigers: stand.bezichtigers };
}

const NAMEN_TEGELIJK = 5;
const NAMEN_TIJDSBUDGET_MS = 5 * 60 * 1000;

/**
 * Haalt de naam op van bezichtigers die er nog geen hebben (ADR-019), een paar tegelijk en binnen een tijdsbudget; wat
 * overblijft, volgt bij de volgende run. In de log staan alleen aantallen en een HTTP-status, nooit een naam of relatie-id.
 */
export async function bezichtigerNamenOphalen(db: Db, tenant: Tenant, opties: RealworksOpties): Promise<{ opgehaald: number; open: number }> {
  const ids = await metTenant(db, tenant.id, (tx) => bezichtigersZonderNaam(tx, tenant.id, 10_000));
  let codes = [tenant.bedrijfscode, tenant.afdelingscode].filter((c): c is string => Boolean(c));
  if (ids.length === 0 || codes.length === 0) {
    console.log(`bezichtigers: ${ids.length} namen op te halen${codes.length === 0 ? " (tenant zonder bedrijfscode, overgeslagen)" : ""}`);
    return { opgehaald: 0, open: ids.length };
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
  return { opgehaald, open: ids.length - opgehaald };
}

type SyncBericht = { tenantId: string; syncId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leesSyncBericht(body: unknown): SyncBericht | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).length !== 2) return null;
  const { tenantId, syncId } = b;
  return [tenantId, syncId].every((v) => typeof v === "string" && UUID.test(v)) ? ({ tenantId, syncId } as SyncBericht) : null;
}

/**
 * Verwerkt één verzoek uit het portaal. De tenant komt uit het bericht; elke databasehandeling loopt via metTenant.
 * Een mislukte run wordt niet opnieuw geprobeerd: de medewerker ziet de status en kan zelf opnieuw synchroniseren.
 */
export async function verwerkSyncVerzoek(db: Db, bericht: SyncBericht): Promise<Uitkomst> {
  const tenant = await zoekTenantOpId(db, bericht.tenantId);
  if (!tenant || !(await metTenant(db, tenant.id, (tx) => moduleAan(tx, tenant.id, "bezichtigers")))) {
    console.warn(`bezichtigers: verzoek ${bericht.syncId} overgeslagen (tenant onbekend of module uit)`);
    return "overgeslagen";
  }
  if (!(await metTenant(db, tenant.id, (tx) => startBezichtigerSync(tx, tenant.id, bericht.syncId)))) {
    console.warn(`bezichtigers: verzoek ${bericht.syncId} overgeslagen (aanvraag bestaat niet of is al afgerond)`);
    return "overgeslagen";
  }
  try {
    const opties = realworksOpties(tenant.sleutel);
    const stand = await spiegelBezichtigingen(db, tenant, opties);
    const namen = await bezichtigerNamenOphalen(db, tenant, opties);
    await metTenant(db, tenant.id, (tx) => rondBezichtigerSyncAf(tx, tenant.id, bericht.syncId, { status: "klaar", ...stand, namenOpgehaald: namen.opgehaald, namenOpen: namen.open }));
    console.log(`bezichtigers: verzoek ${bericht.syncId} klaar voor tenant ${tenant.id}`);
    return "verwerkt";
  } catch (fout) {
    const foutcode = fout instanceof RealworksFout ? `realworks-${fout.status}` : "onverwacht";
    await metTenant(db, tenant.id, (tx) => rondBezichtigerSyncAf(tx, tenant.id, bericht.syncId, { status: "mislukt", foutcode }));
    console.error(`bezichtigers: verzoek ${bericht.syncId} mislukt (${foutcode}) voor tenant ${tenant.id}`);
    return "mislukt";
  }
}

/** Job op de queue bezichtigers-sync: verwerkt de verzoeken uit het portaal. */
export async function syncBezichtigers(): Promise<void> {
  const db = maakDb();
  try {
    const aantal = await verwerkWachtrij("bezichtigers-sync", leesSyncBericht, (bericht) => verwerkSyncVerzoek(db, bericht));
    console.log(`bezichtigers: ${aantal} verzoek(en) behandeld`);
  } finally {
    await db.end();
  }
}
