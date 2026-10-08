// Waardebepalingen (issue #9). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
import {
  kiesAgendapunt, leesLocatie, pastBijObject,
  type ObjectVoorKoppeling, type Waardebepaling, type WaardebepalingImport, type WaardebepalingInvoer, type WaardebepalingStatus, type WaardebepalingUitRealworks,
} from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/** Plaatsen die het kantoor kent, om de plaats uit de locatie van een agendapunt te halen. */
export async function leesBekendePlaatsen(tx: Tx, tenantId: string): Promise<string[]> {
  const { rows } = await tx.query(
    `select distinct plaats from (select plaats from object where tenant_id = $1 union select plaats from waardebepaling where tenant_id = $1) p
      where plaats is not null and plaats <> ''`,
    [tenantId],
  );
  return rows.map((r) => r.plaats as string);
}

export async function upsertWaardebepalingen(tx: Tx, tenantId: string, lijst: WaardebepalingUitRealworks[], plaatsen: readonly string[]): Promise<{ nieuw: number; bijgewerkt: number }> {
  const uitkomst = { nieuw: 0, bijgewerkt: 0 };
  for (const w of lijst) {
    const { postcode, plaats, adres } = leesLocatie(w.locatie, plaatsen);
    const { rows } = await tx.query(
      `insert into waardebepaling (tenant_id, realworks_agenda_id, datum, locatie, adres, postcode, plaats, projectcode, medewerker_id, makelaar_naam,
         relatie_id, agenda_status, herkomst, realworks_gewijzigd_op)
       select $1, $2, $3, $4, $5, $6, $7, $8, m.id, coalesce(m.weergavenaam, 'Onbekend'), $10, $11, 'koppeling', $12::timestamp at time zone 'Europe/Amsterdam'
         from (select 1) x left join medewerker m on m.tenant_id = $1 and m.realworks_id = $9
       on conflict (tenant_id, realworks_agenda_id) do update
         set datum = excluded.datum, locatie = excluded.locatie, adres = excluded.adres, postcode = excluded.postcode, plaats = excluded.plaats,
             projectcode = excluded.projectcode, medewerker_id = excluded.medewerker_id, makelaar_naam = excluded.makelaar_naam,
             relatie_id = excluded.relatie_id, agenda_status = excluded.agenda_status, realworks_gewijzigd_op = excluded.realworks_gewijzigd_op
       returning (xmax = 0) as nieuw`,
      [tenantId, w.realworksAgendaId, w.datum, w.locatie, adres, postcode, plaats, w.projectcode, w.medewerkerRealworksId, w.relatieId, w.agendaStatus, w.realworksGewijzigdOp],
    );
    if (rows[0].nieuw) uitkomst.nieuw += 1;
    else uitkomst.bijgewerkt += 1;
  }
  return uitkomst;
}

/**
 * Zet waardebepalingen op "gewonnen" zodra er een Wonen-object bij past (projectcode of adres), zolang niemand de status
 * met de hand heeft gezet. Geeft het aantal nieuw gekoppelde waardebepalingen.
 */
export async function koppelGewonnen(tx: Tx, tenantId: string): Promise<number> {
  const objecten = await tx.query(
    `select id, objectcode, straat, huisnummer, huisnummertoevoeging, plaats, to_char(publicatiedatum, 'YYYY-MM-DD') as publicatiedatum
       from object where tenant_id = $1`,
    [tenantId],
  );
  const kandidaten = await tx.query(
    `select id, to_char(datum, 'YYYY-MM-DD') as datum, locatie, projectcode from waardebepaling
      where tenant_id = $1 and object_id is null and status_bron = 'automatisch' and datum >= current_date - interval '18 months'`,
    [tenantId],
  );
  let gekoppeld = 0;
  for (const w of kandidaten.rows) {
    const o = objecten.rows.find((r) => pastBijObject(w, r as ObjectVoorKoppeling & { id: string }));
    if (!o) continue;
    await tx.query("update waardebepaling set status = 'gewonnen', object_id = $3, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, w.id, o.id]);
    gekoppeld += 1;
  }
  return gekoppeld;
}

export type WaardebepalingRegel = Waardebepaling & { statusBron: "automatisch" | "handmatig" | "import"; herkomst: "koppeling" | "import" | "handmatig"; agendaStatus: string | null };

export async function leesWaardebepalingen(tx: Tx, tenantId: string, vanafJaar: number): Promise<WaardebepalingRegel[]> {
  const { rows } = await tx.query(
    `select id, to_char(datum, 'YYYY-MM-DD') as datum, adres, plaats, makelaar_naam, status, status_bron, verloren_aan, binnengehaald_via, object_id, herkomst, agenda_status
       from waardebepaling where tenant_id = $1 and extract(year from datum) >= $2 order by datum desc, adres`,
    [tenantId, vanafJaar],
  );
  return rows.map((r) => ({
    id: r.id, datum: r.datum, adres: r.adres, plaats: r.plaats, makelaar: r.makelaar_naam, status: r.status as WaardebepalingStatus,
    verlorenAan: r.verloren_aan, binnengehaaldVia: r.binnengehaald_via, objectId: r.object_id, statusBron: r.status_bron, herkomst: r.herkomst, agendaStatus: r.agenda_status,
  }));
}

export async function bewaarWaardebepalingInvoer(tx: Tx, tenantId: string, id: string, invoer: WaardebepalingInvoer, gebruikerId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `update waardebepaling set status = $3, status_bron = 'handmatig', verloren_aan = $4, binnengehaald_via = $5, gewijzigd_door = $6, gewijzigd_op = now()
      where tenant_id = $1 and id = $2`,
    [tenantId, id, invoer.status, invoer.verlorenAan, invoer.binnengehaaldVia, gebruikerId],
  );
  return (rowCount ?? 0) > 0;
}

export type WaardebepalingImportUitkomst = {
  gekoppeld: number;
  zelfdeDag: number;
  binnenEenWeek: number;
  binnenVenster: number;
  /** Excel-rijen zonder agendapunt in Realworks; die tellen niet mee (Realworks is leidend). */
  nietInRealworks: number;
  /** Rijen waar Realworks de woning al in de verkoop heeft; de status blijft gewonnen. */
  gewonnenVolgensRealworks: number;
  handmatigBehouden: number;
};

/** Hoeveel dagen de Excel-datum van de afspraak in Realworks mag afwijken. */
const VENSTER_DAGEN = 31;

/**
 * Import van de Excel "Waardebepaallijst" (ADR-011). Realworks is leidend: alleen agendapunten tellen als waardebepaling.
 * Een Excel-rij vult bij het agendapunt met hetzelfde adres (eerst op dezelfde dag, daarna het dichtstbijzijnde binnen het
 * venster) de uitkomst aan. Staat de woning volgens Realworks in de verkoop, dan blijft de status gewonnen. Een met de hand
 * gezette status blijft staan. Rijen zonder agendapunt worden niet toegevoegd. Herhaalbaar.
 */
export async function importeerWaardebepalingen(tx: Tx, tenantId: string, regels: WaardebepalingImport[]): Promise<WaardebepalingImportUitkomst> {
  // Opruimen van een eerdere import: losse Excel-regels weg, en eerder overgenomen uitkomsten terug naar de stand van Realworks.
  await tx.query("delete from waardebepaling where tenant_id = $1 and herkomst = 'import'", [tenantId]);
  await tx.query(
    `update waardebepaling
        set status = case when object_id is not null then 'gewonnen' else 'in_afwachting' end, status_bron = 'automatisch',
            verloren_aan = null, binnengehaald_via = null
      where tenant_id = $1 and herkomst = 'koppeling' and status_bron = 'import'`,
    [tenantId],
  );
  const agenda = await tx.query(
    "select id, to_char(datum, 'YYYY-MM-DD') as datum, locatie, status_bron, object_id from waardebepaling where tenant_id = $1 and herkomst = 'koppeling'",
    [tenantId],
  );
  const perId = new Map(agenda.rows.map((a) => [a.id as string, a]));
  const uitkomst: WaardebepalingImportUitkomst = { gekoppeld: 0, zelfdeDag: 0, binnenEenWeek: 0, binnenVenster: 0, nietInRealworks: 0, gewonnenVolgensRealworks: 0, handmatigBehouden: 0 };
  const gebruikt = new Set<string>();
  const keuzes = new Map<WaardebepalingImport, { id: string; dagen: number }>();
  // Eerst de rijen die op de dag zelf passen, zodat een ruimere match geen agendapunt wegkaapt.
  for (const maxDagen of [0, VENSTER_DAGEN]) {
    for (const r of regels) {
      if (keuzes.has(r)) continue;
      const keuze = kiesAgendapunt(r, agenda.rows, maxDagen, gebruikt);
      if (!keuze) continue;
      gebruikt.add(keuze.id);
      keuzes.set(r, keuze);
    }
  }
  for (const r of regels) {
    const keuze = keuzes.get(r);
    if (!keuze) {
      uitkomst.nietInRealworks += 1;
      continue;
    }
    uitkomst.gekoppeld += 1;
    if (keuze.dagen === 0) uitkomst.zelfdeDag += 1;
    else if (keuze.dagen <= 7) uitkomst.binnenEenWeek += 1;
    else uitkomst.binnenVenster += 1;
    const a = perId.get(keuze.id)!;
    if (a.status_bron === "handmatig") {
      uitkomst.handmatigBehouden += 1;
      continue;
    }
    if (a.object_id !== null && r.status !== "gewonnen") {
      // Realworks heeft de woning in de verkoop: gewonnen blijft staan, alleen "binnengehaald via" komt uit de Excel.
      uitkomst.gewonnenVolgensRealworks += 1;
      await tx.query("update waardebepaling set binnengehaald_via = $3, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, keuze.id, r.binnengehaaldVia]);
      continue;
    }
    await tx.query(
      "update waardebepaling set status = $3, status_bron = 'import', verloren_aan = $4, binnengehaald_via = $5, gewijzigd_op = now() where tenant_id = $1 and id = $2",
      [tenantId, keuze.id, r.status, r.verlorenAan, r.binnengehaaldVia],
    );
  }
  return uitkomst;
}
