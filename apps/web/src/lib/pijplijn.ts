// Gegevens voor het beheer van de pijplijnfases (issue #54, ADR-020). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { leesPijplijnFases, moduleAan } from "@makelaarscockpit/db";
import { magKantoorBeheren, type PijplijnFase } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";
import { vereisSessie } from "./inlog/sessie";

export type PijplijnBeheer = { toegang: "geen-beheerder" } | { toegang: "geen-module" } | { toegang: "ja"; fases: PijplijnFase[] };

export async function haalPijplijnBeheer(): Promise<PijplijnBeheer> {
  await connection();
  const sessie = await vereisSessie();
  if (!magKantoorBeheren(sessie.rol)) return { toegang: "geen-beheerder" };
  if (!heeftDatabase()) return { toegang: "geen-module" };
  const fases = await metHuidigeTenant(async (tx) => ((await moduleAan(tx, sessie.tenantId, "bezichtigers")) ? leesPijplijnFases(tx, sessie.tenantId) : null));
  return fases ? { toegang: "ja", fases } : { toegang: "geen-module" };
}
