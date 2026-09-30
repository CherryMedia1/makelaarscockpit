// Verbinding met PostgreSQL en de tenant-context. In Azure logt de managed identity in met een Entra-token
// (Postgres is Entra-only); lokaal kan PGPASSWORD gezet worden.
import pg from "pg";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

async function wachtwoord(): Promise<string> {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const { DefaultAzureCredential } = await import("@azure/identity");
  const clientId = process.env.AZURE_CLIENT_ID;
  const credential = new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : {});
  const token = await credential.getToken("https://ossrdbms-aad.database.windows.net/.default");
  return token.token;
}

export function maakDb(): Db {
  return new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    // Een functie: pg vraagt bij elke nieuwe verbinding een vers token op.
    password: wachtwoord,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

export type Tenant = { id: string; sleutel: string; naam: string; afdelingscode: string | null; bedrijfscode: string | null };

/** Zoekt een tenant op sleutel. Dit gebeurt als inlogrol, vóór de tenant-context is gezet. */
export async function zoekTenant(db: Db, sleutel: string): Promise<Tenant> {
  const { rows } = await db.query(
    "select id, sleutel, naam, realworks_afdelingscode as afdelingscode, realworks_bedrijfscode as bedrijfscode from tenant where sleutel = $1",
    [sleutel],
  );
  if (rows.length !== 1) throw new Error(`tenant '${sleutel}' niet gevonden`);
  return rows[0] as Tenant;
}

/**
 * Voert `werk` uit in één transactie binnen de context van een tenant: als rol cockpit_app (zodat row-level security geldt)
 * en met app.tenant_id gezet. Queries filteren daarnaast zelf op tenant_id; RLS is het vangnet.
 */
export async function metTenant<T>(db: Db, tenantId: string, werk: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("begin");
    await tx.query("set local role cockpit_app");
    await tx.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const resultaat = await werk(tx);
    await tx.query("commit");
    return resultaat;
  } catch (fout) {
    await tx.query("rollback").catch(() => undefined);
    throw fout;
  } finally {
    tx.release();
  }
}
