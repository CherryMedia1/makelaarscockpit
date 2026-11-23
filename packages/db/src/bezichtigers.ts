// Bezichtigersleads (issue #48, ADR-019). Altijd binnen metTenant, met filter op tenant_id. Alleen id's en aantallen in logs.
import { syncAanvraag, type BezichtigingRegel, type BezichtigingUitRealworks, type SyncAanvraag, type SyncStatus } from "@makelaarscockpit/domain";
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
    `select g.id, g.bezichtiger_id as "bezichtigerId", b.naam, b.naam_opgehaald_op is not null as "naamGezocht", g.agendatype, g.status, to_char(g.tijdstip, 'YYYY-MM-DD HH24:MI') as tijdstip, g.projectcode,
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

export type BezichtigerSync = {
  id: string;
  status: SyncStatus;
  aangevraagdOp: Date;
  klaarOp: Date | null;
  bezichtigingen: number | null;
  bezichtigers: number | null;
  namenOpgehaald: number | null;
  namenOpen: number | null;
  foutcode: string | null;
};

/** De laatst aangevraagde run van de tenant, en het tijdstip van de database om de wachttijd mee te rekenen. */
export async function laatsteBezichtigerSync(tx: Tx, tenantId: string): Promise<{ laatste: BezichtigerSync | null; nu: Date }> {
  const { rows } = await tx.query(
    `select s.id, s.status, s.aangevraagd_op as "aangevraagdOp", s.klaar_op as "klaarOp", s.bezichtigingen, s.bezichtigers,
            s.namen_opgehaald as "namenOpgehaald", s.namen_open as "namenOpen", s.foutcode, now() as nu
       from (select 1) een
       left join lateral (select * from bezichtiger_sync where tenant_id = $1 order by aangevraagd_op desc limit 1) s on true`,
    [tenantId],
  );
  const { nu, ...laatste } = rows[0];
  return { laatste: laatste.id ? (laatste as BezichtigerSync) : null, nu };
}

/** Wanneer de bezichtigingen voor het laatst zijn gespiegeld, door de dagelijkse sync of op verzoek. */
export async function bezichtigingenBijgewerktOp(tx: Tx, tenantId: string): Promise<Date | null> {
  const { rows } = await tx.query("select max(gesynchroniseerd_op) as op from bezichtiging where tenant_id = $1", [tenantId]);
  return rows[0].op ?? null;
}

/**
 * Legt een aanvraag vast als dat mag (zie syncAanvraag). Twee gelijktijdige aanvragen van hetzelfde kantoor wachten op
 * elkaar, zodat er maar één doorkomt.
 */
export async function vraagBezichtigerSyncAan(tx: Tx, tenantId: string, gebruikerId: string): Promise<{ id: string } | Exclude<SyncAanvraag, { mag: true }>> {
  await tx.query("select pg_advisory_xact_lock(hashtext('bezichtiger_sync:' || $1))", [tenantId]);
  const { laatste, nu } = await laatsteBezichtigerSync(tx, tenantId);
  const oordeel = syncAanvraag(laatste, nu);
  if (!oordeel.mag) return oordeel;
  const { rows } = await tx.query("insert into bezichtiger_sync (tenant_id, aangevraagd_door) values ($1, $2) returning id", [tenantId, gebruikerId]);
  return { id: rows[0].id as string };
}

/** Trekt een aanvraag in die niet in de wachtrij kon worden gezet. */
export async function trekBezichtigerSyncIn(tx: Tx, tenantId: string, id: string): Promise<void> {
  await tx.query("delete from bezichtiger_sync where tenant_id = $1 and id = $2 and status = 'wachtrij'", [tenantId, id]);
}

/** Zet de run op bezig; false als de aanvraag niet (meer) bestaat of al is afgerond. */
export async function startBezichtigerSync(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    "update bezichtiger_sync set status = 'bezig', gestart_op = now() where tenant_id = $1 and id = $2 and status in ('wachtrij', 'bezig')",
    [tenantId, id],
  );
  return rowCount === 1;
}

export type BezichtigerSyncUitkomst =
  | { status: "klaar"; bezichtigingen: number; bezichtigers: number; namenOpgehaald: number; namenOpen: number }
  | { status: "mislukt"; foutcode: string };

export async function rondBezichtigerSyncAf(tx: Tx, tenantId: string, id: string, u: BezichtigerSyncUitkomst): Promise<void> {
  await tx.query(
    `update bezichtiger_sync
        set status = $3, klaar_op = now(), bezichtigingen = $4, bezichtigers = $5, namen_opgehaald = $6, namen_open = $7, foutcode = $8
      where tenant_id = $1 and id = $2`,
    u.status === "klaar" ? [tenantId, id, "klaar", u.bezichtigingen, u.bezichtigers, u.namenOpgehaald, u.namenOpen, null] : [tenantId, id, "mislukt", null, null, null, null, u.foutcode],
  );
}
