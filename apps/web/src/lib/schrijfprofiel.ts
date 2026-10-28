// Gegevens voor het beheer van schrijfprofielen en voorbeeldteksten (ADR-016, stap B6). Alleen op de server, binnen de
// tenant van de sessie; alleen voor de kantoorbeheerder en alleen als de intake-module aan staat.
import "server-only";
import { connection } from "next/server";
import { actiefSchrijfprofiel, moduleAan, schrijfprofielVersies, schrijfvoorbeelden, type Schrijfvoorbeeld, type SchrijfprofielRij } from "@makelaarscockpit/db";
import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type { Schrijfvoorbeeld };

export type SchrijfprofielBeheer =
  | { toegang: "geen-module" | "geen-beheerder" }
  | { toegang: "ja"; actief: SchrijfprofielRij | null; versies: Omit<SchrijfprofielRij, "profiel">[]; voorbeelden: Schrijfvoorbeeld[] };

export async function haalSchrijfprofielBeheer(): Promise<SchrijfprofielBeheer> {
  await connection();
  if (!heeftDatabase()) return { toegang: "geen-module" };
  return metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return { toegang: "geen-module" as const };
    if (!magKantoorBeheren(sessie.rol)) return { toegang: "geen-beheerder" as const };
    return {
      toegang: "ja" as const,
      actief: await actiefSchrijfprofiel(tx, sessie.tenantId),
      versies: await schrijfprofielVersies(tx, sessie.tenantId),
      voorbeelden: await schrijfvoorbeelden(tx, sessie.tenantId),
    };
  });
}
