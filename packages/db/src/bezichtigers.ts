// Bezichtigersleads (issue #48, ADR-019). Altijd binnen metTenant, met filter op tenant_id. Alleen id's en aantallen in logs.
import type { BezichtigingRegel, BezichtigingUitRealworks } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/**
 * Vervangt de gespiegelde bezichtigingen door de stand van deze run. Idempotent op het Realworks-id; wat Realworks niet
 * meer levert, verdwijnt, en een bezichtiger zonder bezichtigingen ook (met zijn naam).
 */
export async function vervangBezichtigingen(tx: Tx, tenantId: string, lijst: readonly BezichtigingUitRealworks[]): Promise<{ bezichtigingen: number; bezichtigers: number; verwijderd: number }> {
  await tx.query(
    `insert into bezichtiger (tenant_id, realworks_relatie_id)
     select $1, r from unnest($2::bigint[]) as r
     on conflict (tenant_id, realworks_relatie_id) do nothing`,
    [tenantId, [...new Set(lijst.map((b) => b.relatieId))]],
  );
  await tx.query(
    `insert into bezichtiging (tenant_id, realworks_id, bezichtiger_id, agendatype, status, tijdstip, projectcode, projecttype, locatie, medewerker_realworks_id, gesynchroniseerd_op)
     select $1, d.realworks_id, b.id, d.agendatype, d.status, d.tijdstip::timestamp, d.projectcode, d.projecttype, d.locatie, d.medewerker_realworks_id, now()
       from unnest($2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::bigint[])
              as d(realworks_id, relatie_id, agendatype, status, tijdstip, projectcode, projecttype, locatie, medewerker_realworks_id)
       join bezichtiger b on b.tenant_id = $1 and b.realworks_relatie_id = d.relatie_id
     on conflict (tenant_id, realworks_id) do update
       set bezichtiger_id = excluded.bezichtiger_id, agendatype = excluded.agendatype, status = excluded.status, tijdstip = excluded.tijdstip,
           projectcode = excluded.projectcode, projecttype = excluded.projecttype, locatie = excluded.locatie,
           medewerker_realworks_id = excluded.medewerker_realworks_id, gesynchroniseerd_op = now()`,
    [
      tenantId, lijst.map((b) => b.realworksId), lijst.map((b) => b.relatieId), lijst.map((b) => b.agendatype), lijst.map((b) => b.status), lijst.map((b) => b.tijdstip),
      lijst.map((b) => b.projectcode), lijst.map((b) => b.projecttype), lijst.map((b) => b.locatie), lijst.map((b) => b.medewerkerRealworksId),
    ],
  );
  // now() is binnen één transactie constant: alles wat deze run niet heeft aangeraakt, is ouder.
  const weg = await tx.query("delete from bezichtiging where tenant_id = $1 and gesynchroniseerd_op < now()", [tenantId]);
  await tx.query("delete from bezichtiger b where b.tenant_id = $1 and not exists (select 1 from bezichtiging g where g.tenant_id = $1 and g.bezichtiger_id = b.id)", [tenantId]);
  const stand = await tx.query(
    "select (select count(*)::int from bezichtiging where tenant_id = $1) as bezichtigingen, (select count(*)::int from bezichtiger where tenant_id = $1) as bezichtigers",
    [tenantId],
  );
  return { bezichtigingen: stand.rows[0].bezichtigingen, bezichtigers: stand.rows[0].bezichtigers, verwijderd: weg.rowCount ?? 0 };
}

/** Relatie-id's waarvan de naam nog niet is opgehaald, of langer dan 30 dagen geleden; nieuwe eerst. */
export async function bezichtigersZonderNaam(tx: Tx, tenantId: string, limiet: number): Promise<number[]> {
  const { rows } = await tx.query(
    `select realworks_relatie_id from bezichtiger
      where tenant_id = $1 and (naam_opgehaald_op is null or naam_opgehaald_op < now() - interval '30 days')
      order by naam_opgehaald_op nulls first, aangemaakt_op desc
      limit $2`,
    [tenantId, limiet],
  );
  return rows.map((r) => Number(r.realworks_relatie_id));
}

/** Legt opgehaalde namen vast; naam null betekent dat de relatie niet (meer) in Realworks staat. */
export async function zetBezichtigerNamen(tx: Tx, tenantId: string, namen: readonly { relatieId: number; naam: string | null }[]): Promise<void> {
  if (namen.length === 0) return;
  await tx.query(
    `update bezichtiger b set naam = d.naam, naam_opgehaald_op = now()
       from unnest($2::bigint[], $3::text[]) as d(relatie_id, naam)
      where b.tenant_id = $1 and b.realworks_relatie_id = d.relatie_id`,
    [tenantId, namen.map((n) => n.relatieId), namen.map((n) => n.naam)],
  );
}

/** Alle bezichtigingen van de tenant met naam, woning en makelaar, voor het leadoverzicht. */
export async function leesBezichtigingen(tx: Tx, tenantId: string): Promise<BezichtigingRegel[]> {
  const { rows } = await tx.query(
    `select g.id, g.bezichtiger_id as "bezichtigerId", b.naam, g.agendatype, g.status, to_char(g.tijdstip, 'YYYY-MM-DD HH24:MI') as tijdstip, g.projectcode,
            coalesce(o.adres, nullif(regexp_replace(g.locatie, '^\\d{4}\\s?[A-Za-z]{2}\\s+', ''), '')) as woning,
            coalesce(m.weergavenaam, 'Onbekend') as makelaar
       from bezichtiging g
       join bezichtiger b on b.id = g.bezichtiger_id and b.tenant_id = g.tenant_id
       left join lateral (
         select nullif(concat_ws(', ', nullif(concat_ws(' ', o.straat, o.huisnummer, o.huisnummertoevoeging), ''), o.plaats), '') as adres
           from object o where o.tenant_id = g.tenant_id and o.objectcode = g.projectcode limit 1
       ) o on true
       left join medewerker m on m.tenant_id = g.tenant_id and m.realworks_id = g.medewerker_realworks_id
      where g.tenant_id = $1
      order by g.tijdstip desc`,
    [tenantId],
  );
  return rows as BezichtigingRegel[];
}
