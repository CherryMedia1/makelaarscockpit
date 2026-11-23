// Bezichtigersleads (ADR-019): bezichtigingen spiegelen en namen ophalen, gedeeld door de dagelijkse sync en de job die
// een verzoek uit het portaal verwerkt (issue #51). In de log staan alleen id's van tenant en run, aantallen en een HTTP-status.
import {
  bezichtigersZonderNaam, maakDb, metTenant, moduleAan, rondBezichtigerSyncAf, startBezichtigerSync, vervangBezichtigingen, zetBezichtigerNamen, zoekTenantOpId,
  type Db, type Tenant,
} from "@makelaarscockpit/db";
import { bezichtigingenVanaf, naarBezichtiging, type BezichtigingUitRealworks } from "@makelaarscockpit/domain";
import { RealworksFout, haalAgendapunten, haalMedewerkers, haalRelatieNaam, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
import { leesSecret } from "./azure";
import { haalNamenOp } from "./namen-ophalen";
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

/**
 * Haalt de naam op van bezichtigers die er nog geen hebben (ADR-019); wat overblijft, volgt bij de volgende run. Het
 * gedrag bij fouten en limieten staat in namen-ophalen.ts. In de log staan alleen aantallen en een HTTP-status.
 */
export async function bezichtigerNamenOphalen(db: Db, tenant: Tenant, opties: RealworksOpties): Promise<{ opgehaald: number; open: number }> {
  const ids = await metTenant(db, tenant.id, (tx) => bezichtigersZonderNaam(tx, tenant.id, 10_000));
  let codes = [tenant.bedrijfscode, tenant.afdelingscode].filter((c): c is string => Boolean(c));
  if (ids.length === 0 || codes.length === 0) {
    console.log(`bezichtigers: ${ids.length} namen op te halen${codes.length === 0 ? " (tenant zonder bedrijfscode, overgeslagen)" : ""}`);
    return { opgehaald: 0, open: ids.length };
  }
  // Een verkeerde code geeft 400, 403 of 404. Daarom proberen we bij zo'n antwoord ook de andere code; de code die werkt, komt vooraan.
  const haalNaam = async (relatieId: number) => {
    let geweigerd: RealworksFout | null = null;
    let nietGevonden = false;
    for (const code of [...codes]) {
      try {
        const uitkomst = await haalRelatieNaam(opties, relatieId, code);
        if (!uitkomst.gevonden) {
          nietGevonden = true;
          continue;
        }
        if (codes[0] !== code) codes = [code, ...codes.filter((c) => c !== code)];
        return uitkomst;
      } catch (fout) {
        if (!(fout instanceof RealworksFout) || (fout.status !== 400 && fout.status !== 403)) throw fout;
        geweigerd = fout;
      }
    }
    if (geweigerd && !nietGevonden) throw geweigerd;
    return { gevonden: false } as const;
  };
  const r = await haalNamenOp(ids, { haalNaam, bewaar: (namen) => metTenant(db, tenant.id, (tx) => zetBezichtigerNamen(tx, tenant.id, namen)) });
  console.log(
    `bezichtigers: ${r.opgehaald} van ${ids.length} namen opgehaald; ${r.onbekend} relaties niet in Realworks, ${r.geweigerd} geweigerd, ${r.open} nog open` +
      (r.gestopt ? `; gestopt: ${r.gestopt}` : ""),
  );
  return { opgehaald: r.opgehaald, open: r.open };
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
