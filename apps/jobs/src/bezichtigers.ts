// Bezichtigersleads (ADR-019): bezichtigingen spiegelen en namen ophalen, gedeeld door de dagelijkse sync en de job die
// een verzoek uit het portaal verwerkt (issue #51). In de log staan alleen id's van tenant en run, aantallen en een HTTP-status.
import {
  bezichtigersZonderNaam, leadsVoorContact, maakDb, metTenant, moduleAan, rondBezichtigerSyncAf, startBezichtigerSync, vervangBezichtigingen, zetBezichtigerNamen,
  zetLeadContact, zoekTenantOpId,
  type Db, type Tenant,
} from "@makelaarscockpit/db";
import { bezichtigingenVanaf, naarBezichtiging, type BezichtigingUitRealworks } from "@makelaarscockpit/domain";
import { RealworksFout, haalAgendapunten, haalMedewerkers, haalRelatieContact, haalRelatieNaam, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
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
 * Welke code de Relatie-API als bedrijfscode verwacht, staat niet vast: een verkeerde code geeft 400, 403 of 404.
 * Daarom proberen we bij zo'n antwoord ook de andere code; de code die werkt, komt vooraan.
 */
function metBedrijfscode(tenant: Tenant) {
  let codes = [tenant.bedrijfscode, tenant.afdelingscode].filter((c): c is string => Boolean(c));
  return {
    heeftCode: () => codes.length > 0,
    async probeer<T extends { gevonden: boolean }>(haal: (code: string) => Promise<T>): Promise<T | { gevonden: false }> {
      let geweigerd: RealworksFout | null = null;
      let nietGevonden = false;
      for (const code of [...codes]) {
        try {
          const uitkomst = await haal(code);
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
      return { gevonden: false };
    },
  };
}

/**
 * Haalt de naam op van bezichtigers die er nog geen hebben (ADR-019); wat overblijft, volgt bij de volgende run. Het
 * gedrag bij fouten en limieten staat in namen-ophalen.ts. In de log staan alleen aantallen en een HTTP-status.
 */
export async function bezichtigerNamenOphalen(db: Db, tenant: Tenant, opties: RealworksOpties): Promise<{ opgehaald: number; open: number }> {
  const ids = await metTenant(db, tenant.id, (tx) => bezichtigersZonderNaam(tx, tenant.id, 10_000));
  const code = metBedrijfscode(tenant);
  if (ids.length === 0 || !code.heeftCode()) {
    console.log(`bezichtigers: ${ids.length} namen op te halen${code.heeftCode() ? "" : " (tenant zonder bedrijfscode, overgeslagen)"}`);
    return { opgehaald: 0, open: ids.length };
  }
  const haalNaam = (relatieId: number) => code.probeer((c) => haalRelatieNaam(opties, relatieId, c));
  const r = await haalNamenOp(ids, { haalNaam, bewaar: (namen) => metTenant(db, tenant.id, (tx) => zetBezichtigerNamen(tx, tenant.id, namen)) });
  console.log(
    `bezichtigers: ${r.opgehaald} van ${ids.length} namen opgehaald; ${r.onbekend} relaties niet in Realworks, ${r.geweigerd} geweigerd, ${r.open} nog open` +
      (r.gestopt ? `; gestopt: ${r.gestopt}` : ""),
  );
  return { opgehaald: r.opgehaald, open: r.open };
}

/**
 * Haalt voor leads in de pijplijn (ADR-020) e-mail, telefoon, website en links uit Realworks: voor één lead, of voor
 * alle leads van de tenant. Een fout op één relatie houdt de rest niet tegen; bij een limiet of storing stopt het en
 * volgt de rest bij de volgende run. In de log staan alleen aantallen en een HTTP-status.
 */
export async function leadContactOphalen(db: Db, tenant: Tenant, opties: RealworksOpties, leadId?: string): Promise<{ bijgewerkt: number; open: number }> {
  const leads = await metTenant(db, tenant.id, (tx) => leadsVoorContact(tx, tenant.id, leadId));
  const code = metBedrijfscode(tenant);
  if (leads.length === 0 || !code.heeftCode()) return { bijgewerkt: 0, open: leads.length };
  let bijgewerkt = 0;
  let overgeslagen = 0;
  let gestopt: string | null = null;
  for (const lead of leads) {
    try {
      const uitkomst = await code.probeer((c) => haalRelatieContact(opties, lead.relatieId, c));
      await metTenant(db, tenant.id, (tx) => zetLeadContact(tx, tenant.id, lead.leadId, uitkomst.gevonden ? uitkomst.contact : null));
      bijgewerkt += 1;
    } catch (fout) {
      if (fout instanceof RealworksFout && (fout.status === 400 || fout.status === 403)) {
        overgeslagen += 1;
        continue;
      }
      gestopt = fout instanceof RealworksFout ? `Realworks gaf status ${fout.status}` : "onverwachte fout";
      break;
    }
  }
  console.log(`bezichtigers: contactgegevens van ${bijgewerkt} van ${leads.length} leads bijgewerkt; ${overgeslagen} geweigerd${gestopt ? `; gestopt: ${gestopt}` : ""}`);
  return { bijgewerkt, open: leads.length - bijgewerkt - overgeslagen };
}

type SyncBericht = { tenantId: string; syncId: string } | { tenantId: string; leadId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leesSyncBericht(body: unknown): SyncBericht | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).length !== 2) return null;
  const { tenantId } = b;
  const soort = "syncId" in b ? "syncId" : "leadId" in b ? "leadId" : null;
  if (!soort || ![tenantId, b[soort]].every((v) => typeof v === "string" && UUID.test(v))) return null;
  return { tenantId, [soort]: b[soort] } as SyncBericht;
}

/**
 * Verwerkt één verzoek uit het portaal. De tenant komt uit het bericht; elke databasehandeling loopt via metTenant.
 * Een mislukte run wordt niet opnieuw geprobeerd: de medewerker ziet de status en kan zelf opnieuw synchroniseren.
 */
export async function verwerkSyncVerzoek(db: Db, bericht: SyncBericht, laatstePoging = false): Promise<Uitkomst> {
  const tenant = await zoekTenantOpId(db, bericht.tenantId);
  if (!tenant || !(await metTenant(db, tenant.id, (tx) => moduleAan(tx, tenant.id, "bezichtigers")))) {
    console.warn(`bezichtigers: verzoek voor tenant ${bericht.tenantId} overgeslagen (tenant onbekend of module uit)`);
    return "overgeslagen";
  }
  // Een nieuwe lead: alleen zijn contactgegevens ophalen. Een tijdelijke fout mag opnieuw, de laatste poging niet.
  if ("leadId" in bericht) {
    const uit = await leadContactOphalen(db, tenant, realworksOpties(tenant.sleutel), bericht.leadId);
    return uit.open > 0 && !laatstePoging ? "opnieuw" : "verwerkt";
  }
  if (!(await metTenant(db, tenant.id, (tx) => startBezichtigerSync(tx, tenant.id, bericht.syncId)))) {
    console.warn(`bezichtigers: verzoek ${bericht.syncId} overgeslagen (aanvraag bestaat niet of is al afgerond)`);
    return "overgeslagen";
  }
  try {
    const opties = realworksOpties(tenant.sleutel);
    const stand = await spiegelBezichtigingen(db, tenant, opties);
    const namen = await bezichtigerNamenOphalen(db, tenant, opties);
    await leadContactOphalen(db, tenant, opties);
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
    const aantal = await verwerkWachtrij("bezichtigers-sync", leesSyncBericht, (bericht, laatste) => verwerkSyncVerzoek(db, bericht, laatste));
    console.log(`bezichtigers: ${aantal} verzoek(en) behandeld`);
  } finally {
    await db.end();
  }
}
