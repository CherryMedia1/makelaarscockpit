// Gebruikers en inloglinks. Het opzoeken bij het inloggen gebeurt als platformcode (inlogrol), vóórdat er een tenant-context is;
// daarna werkt alles binnen metTenant. Er worden nooit tokens of e-mailadressen gelogd.
import type { GebruikerVoorInlog, Rol } from "@makelaarscockpit/domain";
import type { Db } from "./verbinding";

const GEBRUIKER_KOLOMMEN = `g.id, g.tenant_id as "tenantId", g.email, g.naam, g.rol, g.actief,
  to_char(g.toegang_tot, 'YYYY-MM-DD') as "toegangTot", g.microsoft_tenant_id as "microsoftTenantId",
  t.microsoft_tenant_id as "kantoorMicrosoftTenantId"`;

export async function zoekGebruikerOpEmail(db: Db, email: string): Promise<GebruikerVoorInlog | null> {
  const { rows } = await db.query(`select ${GEBRUIKER_KOLOMMEN} from gebruiker g join tenant t on t.id = g.tenant_id where g.email = $1`, [email]);
  return (rows[0] as GebruikerVoorInlog | undefined) ?? null;
}

export async function zoekGebruikerOpId(db: Db, id: string): Promise<(GebruikerVoorInlog & { kantoornaam: string }) | null> {
  const { rows } = await db.query(
    `select ${GEBRUIKER_KOLOMMEN}, t.naam as kantoornaam from gebruiker g join tenant t on t.id = g.tenant_id where g.id = $1`,
    [id],
  );
  return (rows[0] as (GebruikerVoorInlog & { kantoornaam: string }) | undefined) ?? null;
}

/** Aantal inloglinks dat in de afgelopen periode voor deze gebruiker is aangemaakt, om misbruik te begrenzen. */
export async function telRecenteInlogTokens(db: Db, gebruiker: Pick<GebruikerVoorInlog, "id" | "tenantId">, minuten: number): Promise<number> {
  const { rows } = await db.query(
    "select count(*)::int as n from inlog_token where tenant_id = $1 and gebruiker_id = $2 and aangemaakt_op > now() - make_interval(mins => $3)",
    [gebruiker.tenantId, gebruiker.id, minuten],
  );
  return rows[0].n;
}

export async function bewaarInlogToken(db: Db, gebruiker: Pick<GebruikerVoorInlog, "id" | "tenantId">, tokenHash: string, geldigMinuten: number): Promise<void> {
  await db.query(
    "insert into inlog_token (tenant_id, gebruiker_id, token_hash, verloopt_op) values ($1, $2, $3, now() + make_interval(mins => $4))",
    [gebruiker.tenantId, gebruiker.id, tokenHash, geldigMinuten],
  );
}

/** Verbruikt een inloglink: geldig, niet verlopen en nog niet gebruikt. Geeft het gebruiker-id terug, of null. Eenmalig, ook bij gelijktijdige aanvragen. */
export async function verbruikInlogToken(db: Db, tokenHash: string): Promise<string | null> {
  const { rows } = await db.query(
    "update inlog_token set gebruikt_op = now() where token_hash = $1 and gebruikt_op is null and verloopt_op > now() returning gebruiker_id",
    [tokenHash],
  );
  return rows[0]?.gebruiker_id ?? null;
}

export async function registreerInlog(db: Db, gebruiker: Pick<GebruikerVoorInlog, "id" | "tenantId">): Promise<void> {
  await db.query("update gebruiker set laatste_inlog = now() where id = $1 and tenant_id = $2", [gebruiker.id, gebruiker.tenantId]);
  // Oude inloglinks opruimen; ze zijn na gebruik of na verlopen waardeloos.
  await db.query("delete from inlog_token where tenant_id = $1 and (verloopt_op < now() - interval '1 day' or gebruikt_op is not null)", [gebruiker.tenantId]);
}

export type NieuweGebruiker = { tenantId: string; email: string; naam: string | null; rol: Rol; toegangTot: string | null; microsoftTenantId: string | null };

/** Voegt een gebruiker toe of werkt hem bij. Een adres dat al bij een ander kantoor hoort, wordt geweigerd. */
export async function bewaarGebruiker(db: Db, g: NieuweGebruiker): Promise<"toegevoegd" | "bijgewerkt"> {
  const bestaand = await db.query("select tenant_id from gebruiker where email = $1", [g.email]);
  if (bestaand.rows[0] && bestaand.rows[0].tenant_id !== g.tenantId) throw new Error("dit e-mailadres hoort al bij een ander kantoor");
  const { rows } = await db.query(
    `insert into gebruiker (tenant_id, email, naam, rol, toegang_tot, microsoft_tenant_id) values ($1, $2, $3, $4, $5, $6)
     on conflict (email) do update set naam = excluded.naam, rol = excluded.rol, toegang_tot = excluded.toegang_tot,
       microsoft_tenant_id = excluded.microsoft_tenant_id, actief = true
     returning (xmax = 0) as nieuw`,
    [g.tenantId, g.email, g.naam, g.rol, g.toegangTot, g.microsoftTenantId],
  );
  return rows[0].nieuw ? "toegevoegd" : "bijgewerkt";
}
