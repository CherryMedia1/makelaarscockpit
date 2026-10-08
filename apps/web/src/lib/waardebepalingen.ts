// Gegevens voor het dashboard "Waardebepalingen" (issue #9). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { leesWaardebepalingen, type WaardebepalingRegel } from "@makelaarscockpit/db";
import { waardebepalingDashboard, type WaardebepalingDashboardCijfers } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type { WaardebepalingRegel };

export type WaardebepalingDashboard = { isVoorbeeld: boolean; tot: Date; cijfers: WaardebepalingDashboardCijfers; regels: WaardebepalingRegel[] };

function vandaagInNederland(): { jaar: number; maand: number; datum: Date } {
  const delen = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { jaar: Number(delen.slice(0, 4)), maand: Number(delen.slice(5, 7)), datum: new Date(`${delen}T00:00:00`) };
}

export async function haalWaardebepalingDashboard(): Promise<WaardebepalingDashboard> {
  await connection();
  const nu = vandaagInNederland();
  if (!heeftDatabase()) return voorbeeld(nu);
  const regels = await metHuidigeTenant((tx, sessie) => leesWaardebepalingen(tx, sessie.tenantId, nu.jaar - 1));
  return { isVoorbeeld: false, tot: nu.datum, cijfers: waardebepalingDashboard({ regels, jaar: nu.jaar, totEnMetMaand: nu.maand }), regels };
}

function voorbeeld(nu: { jaar: number; maand: number; datum: Date }): WaardebepalingDashboard {
  const statussen = ["gewonnen", "gewonnen", "verloren", "in_afwachting", "orienterend", "gewonnen"] as const;
  const regels: WaardebepalingRegel[] = Array.from({ length: 36 }, (_, i): WaardebepalingRegel => ({
    id: String(i),
    datum: `${i < 24 ? nu.jaar : nu.jaar - 1}-${String((i % 12) + 1).padStart(2, "0")}-1${i % 9}`,
    adres: `Voorbeeldstraat ${i + 1}`,
    plaats: "Voorbeeldstad",
    makelaar: ["Makelaar A", "Makelaar B", "Makelaar C"][i % 3]!,
    status: statussen[i % statussen.length]!,
    verlorenAan: statussen[i % statussen.length] === "verloren" ? "Ander kantoor" : null,
    binnengehaaldVia: ["Telefonisch", "Eigen netwerk", "Per mail"][i % 3]!,
    objectId: null,
    statusBron: "automatisch" as const,
    herkomst: "koppeling" as const,
    agendaStatus: "Definitief",
  })).filter((r) => Number(r.datum.slice(5, 7)) <= nu.maand || Number(r.datum.slice(0, 4)) < nu.jaar);
  return { isVoorbeeld: true, tot: nu.datum, cijfers: waardebepalingDashboard({ regels, jaar: nu.jaar, totEnMetMaand: nu.maand }), regels };
}
