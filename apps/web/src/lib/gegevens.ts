// Gegevenstoegang voor het portaal (alleen op de server): altijd binnen de tenant van de ingelogde medewerker.
import "server-only";
import { metTenant, type Tx } from "@makelaarscockpit/db";
import { db } from "./gegevens-basis";
import { vereisSessie, type Sessie } from "./inlog/sessie";

export { heeftDatabase } from "./gegevens-basis";

/** Voert `werk` uit binnen de tenant uit de sessie; de tenant komt nooit uit de URL of uit invoer. */
export async function metHuidigeTenant<T>(werk: (tx: Tx, sessie: Sessie) => Promise<T>): Promise<T> {
  const sessie = await vereisSessie();
  return metTenant(db(), sessie.tenantId, (tx) => werk(tx, sessie));
}
