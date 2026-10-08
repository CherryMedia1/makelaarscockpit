// Gegevens voor het bord "Woningen in verkoop" (issue #10). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { leesMedewerkerKeuzes, leesWoningen, type MedewerkerKeuze, type WoningOpBord } from "@makelaarscockpit/db";
import { bepaalStappen, type RealworksSignalen, type Spoor } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type { MedewerkerKeuze, WoningOpBord };

export const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function haalWoningenBord(spoor: Spoor): Promise<{ woningen: WoningOpBord[]; isVoorbeeld: boolean; vandaag: string }> {
  await connection();
  const vandaag = vandaagInNederland();
  if (!heeftDatabase()) return { woningen: voorbeeld(spoor, vandaag), isVoorbeeld: true, vandaag };
  const woningen = await metHuidigeTenant((tx, sessie) => leesWoningen(tx, sessie.tenantId, spoor, vandaag));
  return { woningen, isVoorbeeld: false, vandaag };
}

export async function haalWoning(spoor: Spoor, id: string): Promise<{ woning: WoningOpBord | null; medewerkers: MedewerkerKeuze[]; vandaag: string }> {
  await connection();
  const vandaag = vandaagInNederland();
  if (!heeftDatabase()) return { woning: null, medewerkers: [], vandaag };
  return metHuidigeTenant(async (tx, sessie) => ({
    woning: (await leesWoningen(tx, sessie.tenantId, spoor, vandaag, id))[0] ?? null,
    medewerkers: await leesMedewerkerKeuzes(tx, sessie.tenantId),
    vandaag,
  }));
}

function voorbeeld(spoor: Spoor, vandaag: string): WoningOpBord[] {
  const leeg: RealworksSignalen = { heeftFotos: false, heeftPlattegrond: false, energieklasse: null, heeftTekst: false, publicatiedatum: null, transportdatum: null, agenda: [] };
  const woning = (n: number, fase: WoningOpBord["fase"], signalen: Partial<RealworksSignalen>, klaar: string[]): WoningOpBord => ({
    id: String(n), projectcode: `VB${n}`, adres: `Voorbeeldstraat ${n}`, plaats: "Voorbeeldstad", vraagprijs: 300_000 + n * 25_000,
    makelaar: ["Makelaar A", "Makelaar B"][n % 2]!, backoffice: ["Backoffice A", "Backoffice B"][n % 2]!, backofficeMedewerkerId: null, fase, realworksStatus: fase === "voorbereiding" ? null : "BESCHIKBAAR",
    stappen: bepaalStappen(spoor, { ...leeg, ...signalen }, klaar.map((stap) => ({ stap, status: "klaar" as const, datum: null })), vandaag),
  });
  return [
    woning(1, "voorbereiding", { agenda: [{ type: "Verkoopgesprek", datum: "2026-01-05", status: "Definitief" }] }, []),
    woning(2, "voorbereiding", { heeftFotos: true, energieklasse: "B" }, ["styling"]),
    woning(3, "in_verkoop", { heeftFotos: true, energieklasse: "A", heeftTekst: true, publicatiedatum: "2026-01-10" }, ["styling", "socials", "bord"]),
    woning(4, "in_verkoop", { heeftFotos: true, energieklasse: "C", heeftTekst: true, publicatiedatum: "2026-01-10", agenda: [{ type: "Verkoopgesprek", datum: "2026-01-02", status: "Definitief" }] }, ["video", "styling", "woningzoeker", "socials", "reel", "bord"]),
  ];
}
