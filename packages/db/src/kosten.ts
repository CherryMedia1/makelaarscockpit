// Kostenregels per verkoop (ADR-007). Altijd binnen metTenant, met filter op tenant_id.
import type { GeldigeKostenregel, KostenSoort } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

export type Kostenregel = { id: string; soort: KostenSoort; leverancier: string | null; omschrijving: string | null; bedrag: number; datum: string };

export async function leesKostenregels(tx: Tx, tenantId: string, verkoopId: string): Promise<Kostenregel[]> {
  const { rows } = await tx.query(
    `select id, soort, leverancier, omschrijving, bedrag, to_char(datum, 'YYYY-MM-DD') as datum
       from kostenregel where tenant_id = $1 and verkoop_id = $2 order by datum, aangemaakt_op`,
    [tenantId, verkoopId],
  );
  return rows.map((r) => ({ id: r.id, soort: r.soort as KostenSoort, leverancier: r.leverancier, omschrijving: r.omschrijving, bedrag: Number(r.bedrag), datum: r.datum }));
}

/** Geeft false als de verkoop niet (meer) bestaat binnen de tenant. */
export async function voegKostenregelToe(tx: Tx, tenantId: string, verkoopId: string, k: GeldigeKostenregel, gebruikerId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `insert into kostenregel (tenant_id, verkoop_id, soort, leverancier, omschrijving, bedrag, datum, herkomst, gewijzigd_door)
     select $1, v.id, $3, $4, $5, $6, $7, 'handmatig', $8 from verkoop v where v.tenant_id = $1 and v.id = $2`,
    [tenantId, verkoopId, k.soort, k.leverancier, k.omschrijving, k.bedrag, k.datum, gebruikerId],
  );
  return (rowCount ?? 0) > 0;
}

export async function verwijderKostenregel(tx: Tx, tenantId: string, verkoopId: string, id: string): Promise<boolean> {
  const { rowCount } = await tx.query("delete from kostenregel where tenant_id = $1 and verkoop_id = $2 and id = $3", [tenantId, verkoopId, id]);
  return (rowCount ?? 0) > 0;
}
