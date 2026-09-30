// Gegevenstoegang voor het portaal (alleen op de server). Tot de inlog er is (issue #5) is de tenant vast: TENANT_SLEUTEL.
import "server-only";
import { maakDb, metTenant, zoekTenant, type Db, type Tenant, type Tx } from "@makelaarscockpit/db";

const globaal = globalThis as unknown as { cockpitDb?: Db };

export const heeftDatabase = () => Boolean(process.env.PGHOST);

function db(): Db {
  return (globaal.cockpitDb ??= maakDb());
}

export async function huidigeTenant(): Promise<Tenant> {
  return zoekTenant(db(), process.env.TENANT_SLEUTEL ?? "cr");
}

export async function metHuidigeTenant<T>(werk: (tx: Tx, tenant: Tenant) => Promise<T>): Promise<T> {
  const tenant = await huidigeTenant();
  return metTenant(db(), tenant.id, (tx) => werk(tx, tenant));
}
