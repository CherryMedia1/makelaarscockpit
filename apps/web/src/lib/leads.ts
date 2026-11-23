// Gegevens voor het leadoverzicht uit bezichtigingen (issue #48, ADR-019). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { bezichtigingenBijgewerktOp, laatsteBezichtigerSync, leesBezichtigingen, moduleAan, type BezichtigerSync } from "@makelaarscockpit/db";
import { groepeerLeads, syncAanvraag, type BezichtigingRegel, type Lead, type SyncAanvraag } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

/** Stand van het synchroniseren: wanneer voor het laatst bijgewerkt, de laatste aanvraag uit het portaal, en of een nieuwe mag. */
export type LeadSync = { bijgewerktOp: Date | null; laatste: BezichtigerSync | null; aanvraag: SyncAanvraag };

export type LeadOverzicht = { isVoorbeeld: boolean; moduleAan: boolean; vandaag: string; leads: Lead[]; sync: LeadSync | null };

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function bezichtigersModuleAan(): Promise<boolean> {
  if (!heeftDatabase()) return true;
  return metHuidigeTenant((tx, sessie) => moduleAan(tx, sessie.tenantId, "bezichtigers"));
}

export async function haalLeadOverzicht(): Promise<LeadOverzicht> {
  await connection();
  const vandaag = vandaagInNederland();
  if (!heeftDatabase()) return { isVoorbeeld: true, moduleAan: true, vandaag, leads: groepeerLeads(voorbeeld(vandaag), vandaag), sync: null };
  const gegevens = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return null;
    const regels = await leesBezichtigingen(tx, sessie.tenantId);
    const { laatste, nu } = await laatsteBezichtigerSync(tx, sessie.tenantId);
    return { regels, sync: { bijgewerktOp: await bezichtigingenBijgewerktOp(tx, sessie.tenantId), laatste, aanvraag: syncAanvraag(laatste, nu) } };
  });
  return { isVoorbeeld: false, moduleAan: gegevens !== null, vandaag, leads: groepeerLeads(gegevens?.regels ?? [], vandaag), sync: gegevens?.sync ?? null };
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
