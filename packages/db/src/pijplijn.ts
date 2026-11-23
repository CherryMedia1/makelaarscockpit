// Pijplijn voor bezichtigersleads (issue #54, ADR-020). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
import type { FaseSoort, PijplijnFase } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/** Alle fases van de tenant in volgorde, ook de uitgezette. */
export async function leesPijplijnFases(tx: Tx, tenantId: string): Promise<PijplijnFase[]> {
  const { rows } = await tx.query("select id, naam, volgorde, soort, actief from pijplijn_fase where tenant_id = $1 order by volgorde, aangemaakt_op", [tenantId]);
  return rows as PijplijnFase[];
}

/** Voegt een fase toe aan het eind van de pijplijn. */
export async function voegPijplijnFaseToe(tx: Tx, tenantId: string, fase: { naam: string; soort: FaseSoort }): Promise<string> {
  const { rows } = await tx.query(
    `insert into pijplijn_fase (tenant_id, naam, soort, volgorde)
     values ($1, $2, $3, (select coalesce(max(volgorde), 0) + 1 from pijplijn_fase where tenant_id = $1))
     returning id`,
    [tenantId, fase.naam, fase.soort],
  );
  return rows[0].id as string;
}

export async function wijzigPijplijnFase(tx: Tx, tenantId: string, id: string, fase: { naam: string; soort: FaseSoort }): Promise<boolean> {
  const { rowCount } = await tx.query("update pijplijn_fase set naam = $3, soort = $4 where tenant_id = $1 and id = $2", [tenantId, id, fase.naam, fase.soort]);
  return rowCount === 1;
}

export async function zetPijplijnFaseActief(tx: Tx, tenantId: string, id: string, actief: boolean): Promise<boolean> {
  const { rowCount } = await tx.query("update pijplijn_fase set actief = $3 where tenant_id = $1 and id = $2", [tenantId, id, actief]);
  return rowCount === 1;
}

/** Zet de fases in de volgorde van `ids`; id's van een andere tenant doen niets. */
export async function zetPijplijnVolgorde(tx: Tx, tenantId: string, ids: readonly string[]): Promise<void> {
  await tx.query(
    `update pijplijn_fase f set volgorde = d.plek
       from unnest($2::uuid[]) with ordinality as d(id, plek)
      where f.tenant_id = $1 and f.id = d.id`,
    [tenantId, ids],
  );
}

export async function verwijderPijplijnFase(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await tx.query("delete from pijplijn_fase where tenant_id = $1 and id = $2", [tenantId, id]);
  return rowCount === 1;
}
