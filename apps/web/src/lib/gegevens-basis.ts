// Eén databasepool per serverproces.
import "server-only";
import { maakDb, type Db } from "@makelaarscockpit/db";

const globaal = globalThis as unknown as { cockpitDb?: Db };

export const heeftDatabase = () => Boolean(process.env.PGHOST);

export function db(): Db {
  return (globaal.cockpitDb ??= maakDb());
}
