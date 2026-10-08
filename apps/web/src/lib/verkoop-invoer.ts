// Gegevens voor de lijst en het invoerscherm per verkoop (issue #7). Alleen op de server, altijd binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { leesMedewerkerKeuzes, leesVerkoop, leesVerkopenOverzicht, type MedewerkerKeuze, type VerkoopDetail, type VerkoopOverzichtRegel } from "@makelaarscockpit/db";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type { MedewerkerKeuze, VerkoopDetail, VerkoopOverzichtRegel };

function jaarInNederland(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric" }).format(new Date()));
}

export async function haalVerkopenOverzicht(): Promise<{ regels: VerkoopOverzichtRegel[]; vanafJaar: number; isVoorbeeld: boolean }> {
  await connection();
  const vanafJaar = jaarInNederland() - 1;
  if (!heeftDatabase()) return { regels: [], vanafJaar, isVoorbeeld: true };
  const regels = await metHuidigeTenant((tx, sessie) => leesVerkopenOverzicht(tx, sessie.tenantId, vanafJaar));
  return { regels, vanafJaar, isVoorbeeld: false };
}

export async function haalVerkoop(id: string): Promise<{ verkoop: VerkoopDetail | null; medewerkers: MedewerkerKeuze[] }> {
  await connection();
  if (!heeftDatabase()) return { verkoop: null, medewerkers: [] };
  return metHuidigeTenant(async (tx, sessie) => ({
    verkoop: await leesVerkoop(tx, sessie.tenantId, id),
    medewerkers: await leesMedewerkerKeuzes(tx, sessie.tenantId),
  }));
}

export async function haalMedewerkerKeuzes(): Promise<MedewerkerKeuze[]> {
  await connection();
  if (!heeftDatabase()) return [];
  return metHuidigeTenant((tx, sessie) => leesMedewerkerKeuzes(tx, sessie.tenantId));
}
