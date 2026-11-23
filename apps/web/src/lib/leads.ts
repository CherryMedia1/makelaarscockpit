// Gegevens voor het leadoverzicht uit bezichtigingen (issue #48, ADR-019). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import {
  bezichtigingenBijgewerktOp, laatsteBezichtigerSync, leesBezichtigingen, leesLeadKaart, leesLeadStanden, leesMedewerkerKeuzes, leesPijplijnFases, moduleAan,
  type BezichtigerSync, type LeadKaart, type LeadStand, type MedewerkerKeuze,
} from "@makelaarscockpit/db";
import { groepeerLeads, syncAanvraag, type BezichtigingRegel, type Lead, type PijplijnFase, type SyncAanvraag } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

/** Stand van het synchroniseren: wanneer voor het laatst bijgewerkt, de laatste aanvraag uit het portaal, en of een nieuwe mag. */
export type LeadSync = { bijgewerktOp: Date | null; laatste: BezichtigerSync | null; aanvraag: SyncAanvraag };

export type LeadOverzicht = {
  isVoorbeeld: boolean;
  moduleAan: boolean;
  vandaag: string;
  leads: Lead[];
  sync: LeadSync | null;
  /** De fases van het kantoor en, per bezichtiger in de pijplijn, zijn stand (ADR-020). */
  fases: PijplijnFase[];
  standen: LeadStand[];
};

export type LeadKaartGegevens = { kaart: LeadKaart; bezichtigingen: BezichtigingRegel[]; fases: PijplijnFase[]; medewerkers: MedewerkerKeuze[] };

/** Alles voor de lead-kaart van één bezichtiger; null als de module uit staat of de bezichtiger niet van dit kantoor is. */
export async function haalLeadKaart(bezichtigerId: string): Promise<LeadKaartGegevens | null> {
  await connection();
  if (!heeftDatabase()) return null;
  return metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return null;
    const kaart = await leesLeadKaart(tx, sessie.tenantId, bezichtigerId);
    if (!kaart) return null;
    return {
      kaart,
      bezichtigingen: await leesBezichtigingen(tx, sessie.tenantId, bezichtigerId),
      fases: await leesPijplijnFases(tx, sessie.tenantId),
      medewerkers: await leesMedewerkerKeuzes(tx, sessie.tenantId),
    };
  });
}

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function bezichtigersModuleAan(): Promise<boolean> {
  if (!heeftDatabase()) return true;
  return metHuidigeTenant((tx, sessie) => moduleAan(tx, sessie.tenantId, "bezichtigers"));
}

export async function haalLeadOverzicht(): Promise<LeadOverzicht> {
  await connection();
  const vandaag = vandaagInNederland();
  if (!heeftDatabase()) return { isVoorbeeld: true, moduleAan: true, vandaag, leads: groepeerLeads(voorbeeld(vandaag), vandaag), sync: null, fases: [], standen: [] };
  const gegevens = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return null;
    const regels = await leesBezichtigingen(tx, sessie.tenantId);
    const { laatste, nu } = await laatsteBezichtigerSync(tx, sessie.tenantId);
    return {
      regels,
      sync: { bijgewerktOp: await bezichtigingenBijgewerktOp(tx, sessie.tenantId), laatste, aanvraag: syncAanvraag(laatste, nu) },
      fases: await leesPijplijnFases(tx, sessie.tenantId),
      standen: await leesLeadStanden(tx, sessie.tenantId),
    };
  });
  return {
    isVoorbeeld: false, moduleAan: gegevens !== null, vandaag, leads: groepeerLeads(gegevens?.regels ?? [], vandaag), sync: gegevens?.sync ?? null,
    fases: gegevens?.fases ?? [], standen: gegevens?.standen ?? [],
  };
}

/** Verzonnen bezichtigingen voor een omgeving zonder database. */
function voorbeeld(vandaag: string): BezichtigingRegel[] {
  const dag = (terug: number) => {
    const d = new Date(`${vandaag}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - terug);
    return d.toISOString().slice(0, 10);
  };
  return Array.from({ length: 40 }, (_, i): BezichtigingRegel => {
    const woning = (i * 7) % 6;
    return {
      id: String(i),
      bezichtigerId: `voorbeeld-${i % 22}`,
      naam: `Bezichtiger ${String.fromCharCode(65 + (i % 22))}`,
      naamGezocht: true,
      agendatype: i % 9 === 4 ? "2e bezichtiging" : i % 11 === 0 ? "Bezichtiging (planner)" : "1e bezichtiging",
      status: "Definitief",
      tijdstip: `${dag(i * 4 - 6)} ${10 + (i % 7)}:${i % 2 ? "30" : "00"}`,
      projectcode: `VB-${woning}`,
      woning: `Voorbeeldstraat ${woning * 2 + 1}, Voorbeeldstad`,
      makelaar: ["Makelaar A", "Makelaar B", "Makelaar C"][i % 3]!,
    };
  });
}
