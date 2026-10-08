// Gegevens voor de lijst en het invoerscherm per verkoop (issue #7). Alleen op de server, altijd binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import {
  leesKostenregels, leesMedewerkerKeuzes, leesOmzetdoelen, leesVerkoop, leesVerkopenOverzicht,
  type Kostenregel, type MedewerkerKeuze, type VerkoopDetail, type VerkoopOverzichtRegel,
} from "@makelaarscockpit/db";
import type { Doel } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type { Kostenregel, MedewerkerKeuze, VerkoopDetail, VerkoopOverzichtRegel };

export function jaarInNederland(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric" }).format(new Date()));
}

export async function haalVerkopenOverzicht(): Promise<{ regels: VerkoopOverzichtRegel[]; vanafJaar: number; isVoorbeeld: boolean }> {
  await connection();
  const vanafJaar = jaarInNederland() - 1;
  if (!heeftDatabase()) return { regels: [], vanafJaar, isVoorbeeld: true };
  const regels = await metHuidigeTenant((tx, sessie) => leesVerkopenOverzicht(tx, sessie.tenantId, vanafJaar));
  return { regels, vanafJaar, isVoorbeeld: false };
}

export async function haalVerkoop(id: string): Promise<{ verkoop: VerkoopDetail | null; medewerkers: MedewerkerKeuze[]; kosten: Kostenregel[] }> {
  await connection();
  if (!heeftDatabase()) return { verkoop: null, medewerkers: [], kosten: [] };
  return metHuidigeTenant(async (tx, sessie) => ({
    verkoop: await leesVerkoop(tx, sessie.tenantId, id),
    medewerkers: await leesMedewerkerKeuzes(tx, sessie.tenantId),
    kosten: await leesKostenregels(tx, sessie.tenantId, id),
  }));
}

export async function haalOmzetdoelen(jaar: number): Promise<Doel[]> {
  await connection();
  if (!heeftDatabase()) return [];
  return metHuidigeTenant((tx, sessie) => leesOmzetdoelen(tx, sessie.tenantId, jaar));
}

export async function haalMedewerkerKeuzes(): Promise<MedewerkerKeuze[]> {
  await connection();
  if (!heeftDatabase()) return [];
  return metHuidigeTenant((tx, sessie) => leesMedewerkerKeuzes(tx, sessie.tenantId));
}
