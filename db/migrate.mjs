// Voert de SQL-migraties uit db/migrations op volgorde uit en controleert daarna de tenant-isolatie.
// In Azure: inloggen met de managed identity (Postgres is Entra-only). Lokaal: PGPASSWORD zetten.
// Gebruik: node migrate.mjs [--controle-rls]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const map = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function wachtwoord() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const { DefaultAzureCredential } = await import("@azure/identity");
  const credential = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID });
  const token = await credential.getToken("https://ossrdbms-aad.database.windows.net/.default");
  return token.token;
}

async function verbind() {
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: await wachtwoord(),
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

async function migreer(client) {
  await client.query(`create table if not exists schema_migraties (
    versie text primary key,
    toegepast_op timestamptz not null default now()
  )`);
  const gedaan = new Set((await client.query("select versie from schema_migraties")).rows.map((r) => r.versie));
  const bestanden = readdirSync(map).filter((f) => f.endsWith(".sql")).sort();
  let aantal = 0;
  for (const bestand of bestanden) {
    const versie = bestand.replace(/\.sql$/, "");
    if (gedaan.has(versie)) continue;
    console.log(`migratie ${versie} uitvoeren`);
    await client.query("begin");
    try {
      await client.query(readFileSync(join(map, bestand), "utf8"));
      await client.query("insert into schema_migraties (versie) values ($1)", [versie]);
      await client.query("commit");
      aantal += 1;
    } catch (fout) {
      await client.query("rollback");
      throw new Error(`migratie ${versie} mislukt: ${fout.message}`);
    }
  }
  console.log(aantal === 0 ? "geen nieuwe migraties" : `${aantal} migratie(s) toegepast`);
}

// Controle voor issue #3: tenant A mag geen rij van tenant B lezen of schrijven. Alles wordt teruggedraaid.
async function controleerRls(client) {
  await client.query("begin");
  try {
    await client.query("alter table tenant no force row level security");
    const a = (await client.query("insert into tenant (sleutel, naam) values ('rls-test-a', 'RLS test A') returning id")).rows[0].id;
    const b = (await client.query("insert into tenant (sleutel, naam) values ('rls-test-b', 'RLS test B') returning id")).rows[0].id;
    await client.query("alter table tenant force row level security");

    await client.query("set local role cockpit_app");
    const alsTenant = (id) => client.query("select set_config('app.tenant_id', $1, true)", [id]);

    await alsTenant(a);
    await client.query("insert into medewerker (tenant_id, weergavenaam) values ($1, 'van A')", [a]);
    await alsTenant(b);
    await client.query("insert into medewerker (tenant_id, weergavenaam) values ($1, 'van B')", [b]);

    const zichtbaarVoorB = (await client.query("select weergavenaam from medewerker")).rows.map((r) => r.weergavenaam);
    if (zichtbaarVoorB.length !== 1 || zichtbaarVoorB[0] !== "van B") throw new Error(`tenant B ziet ${JSON.stringify(zichtbaarVoorB)}`);

    const tenantsVoorB = (await client.query("select sleutel from tenant")).rows.map((r) => r.sleutel);
    if (tenantsVoorB.length !== 1 || tenantsVoorB[0] !== "rls-test-b") throw new Error(`tenant B ziet tenants ${JSON.stringify(tenantsVoorB)}`);

    await client.query("savepoint schrijven");
    let geweigerd = false;
    try {
      await client.query("insert into medewerker (tenant_id, weergavenaam) values ($1, 'B schrijft bij A')", [a]);
    } catch {
      geweigerd = true;
    }
    await client.query("rollback to savepoint schrijven");
    if (!geweigerd) throw new Error("tenant B kon een rij bij tenant A schrijven");

    await client.query("select set_config('app.tenant_id', '', true)");
    const zonderTenant = (await client.query("select count(*)::int as n from medewerker")).rows[0].n;
    if (zonderTenant !== 0) throw new Error(`zonder tenant zijn ${zonderTenant} rijen zichtbaar`);

    console.log("RLS-controle geslaagd: tenant B ziet en schrijft alleen eigen rijen; zonder tenant is niets zichtbaar");
  } finally {
    await client.query("rollback");
  }
}

const client = await verbind();
try {
  await migreer(client);
  if (process.argv.includes("--controle-rls")) await controleerRls(client);
} finally {
  await client.end();
}
