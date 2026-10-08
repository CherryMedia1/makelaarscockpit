// Woningen in verkoop (issue #10, ADR-012). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
import {
  bepaalStappen, faseVanObject, leesLocatie, locatieBevatAdres, stappenVoorSpoor, woningenInVoorbereiding,
  type AgendapuntGegevens, type HandmatigeStap, type RealworksSignalen, type Spoor, type StapStatus, type StapUitkomst, type WoningFase,
} from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/** Agendatypes die bij een woning horen en die wij bewaren. Bezichtigingen en privé-afspraken horen daar niet bij. */
export const WONING_AGENDATYPES: ReadonlySet<string> = new Set([
  "Verkoopgesprek", "Foto's/video maken", "Video Luna", "Energielabel", "Bord plaatsen", "Open Huis", "Tekenafspraak", "Overdracht notaris",
]);

/** Vervangt de gespiegelde afspraken door de stand van deze run; wat in Realworks is verwijderd, verdwijnt hier ook. */
export async function vervangAgendapunten(tx: Tx, tenantId: string, punten: AgendapuntGegevens[]): Promise<number> {
  let aantal = 0;
  for (const a of punten) {
    if (!a.agendatype || !WONING_AGENDATYPES.has(a.agendatype) || !a.begintijd) continue;
    await tx.query(
      `insert into agendapunt (tenant_id, realworks_id, agendatype, status, datum, projectcode, projecttype, locatie, medewerker_realworks_id, gesynchroniseerd_op)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (tenant_id, realworks_id) do update
         set agendatype = excluded.agendatype, status = excluded.status, datum = excluded.datum, projectcode = excluded.projectcode,
             projecttype = excluded.projecttype, locatie = excluded.locatie, medewerker_realworks_id = excluded.medewerker_realworks_id,
             gesynchroniseerd_op = now()`,
      [tenantId, a.realworksId, a.agendatype, a.status, a.begintijd.slice(0, 10), a.projectcode, a.projecttype, a.locatie, a.medewerkerRealworksId],
    );
    aantal += 1;
  }
  // now() is binnen één transactie constant: alles wat deze run niet heeft aangeraakt, is ouder.
  await tx.query("delete from agendapunt where tenant_id = $1 and gesynchroniseerd_op < now()", [tenantId]);
  return aantal;
}

/**
 * Werkt het bord bij na een sync: elke woning die Realworks nu als object levert (en niet is ingetrokken) en elke woning
 * in voorbereiding uit de agenda staat op het bord; de rest verdwijnt ervan, met behoud van de ingevulde stappen.
 */
export async function werkWoningenBij(tx: Tx, tenantId: string, vandaag: string, plaatsen: readonly string[]): Promise<Record<WoningFase | "verborgen", number>> {
  const telling: Record<WoningFase | "verborgen", number> = { voorbereiding: 0, in_verkoop: 0, verkocht_ov: 0, verkocht: 0, verborgen: 0 };
  await tx.query("update woning set zichtbaar = false where tenant_id = $1", [tenantId]);

  // Objecten uit de laatste sync-run; wat Realworks niet meer levert (gearchiveerd), heeft een oudere stempel.
  const objecten = await tx.query(
    `select o.id, o.objectcode, o.realworks_id, o.status, o.straat, o.huisnummer, o.huisnummertoevoeging, o.plaats, o.vraagprijs,
            m.id as medewerker_id, m.weergavenaam
       from object o
       left join medewerker m on m.tenant_id = o.tenant_id and m.relatiecode = o.gekoppelde_makelaar_code
      where o.tenant_id = $1
        and o.gesynchroniseerd_op >= (select max(gesynchroniseerd_op) - interval '1 hour' from object where tenant_id = $1)`,
    [tenantId],
  );
  for (const o of objecten.rows) {
    const fase = faseVanObject(o.status);
    if (!fase) continue;
    const adres = [o.straat, [o.huisnummer, o.huisnummertoevoeging].filter(Boolean).join(" ")].filter(Boolean).join(" ") || null;
    await tx.query(
      `insert into woning (tenant_id, projectcode, object_id, adres, plaats, vraagprijs, medewerker_id, makelaar_naam, fase, zichtbaar)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'Onbekend'), $9, true)
       on conflict (tenant_id, projectcode) do update
         set object_id = excluded.object_id, adres = excluded.adres, plaats = excluded.plaats, vraagprijs = excluded.vraagprijs,
             medewerker_id = excluded.medewerker_id, makelaar_naam = excluded.makelaar_naam, fase = excluded.fase, zichtbaar = true, gewijzigd_op = now()`,
      [tenantId, o.objectcode ?? `object-${o.realworks_id}`, o.id, adres, o.plaats, o.vraagprijs, o.medewerker_id, o.weergavenaam, fase],
    );
    telling[fase] += 1;
  }

  // Woningen in voorbereiding: een recent verkoopgesprek of fotoafspraak voor een project dat nog geen object is.
  const bekend = await tx.query("select objectcode from object where tenant_id = $1 and objectcode is not null", [tenantId]);
  const agenda = await tx.query(
    `select projectcode, projecttype, agendatype, to_char(datum, 'YYYY-MM-DD') as datum, status, locatie, medewerker_realworks_id as "medewerkerRealworksId"
       from agendapunt where tenant_id = $1 and projectcode is not null`,
    [tenantId],
  );
  const kandidaten = woningenInVoorbereiding(agenda.rows, new Set(bekend.rows.map((r) => r.objectcode as string)), vandaag);
  for (const k of kandidaten) {
    const { plaats, adres } = leesLocatie(k.locatie, plaatsen);
    await tx.query(
      `insert into woning (tenant_id, projectcode, adres, plaats, medewerker_id, makelaar_naam, fase, zichtbaar)
       select $1, $2, $3, $4, m.id, coalesce(m.weergavenaam, 'Onbekend'), 'voorbereiding', true
         from (select 1) x left join medewerker m on m.tenant_id = $1 and m.realworks_id = $5
       on conflict (tenant_id, projectcode) do update
         set adres = coalesce(excluded.adres, woning.adres), plaats = coalesce(excluded.plaats, woning.plaats),
             medewerker_id = excluded.medewerker_id, makelaar_naam = excluded.makelaar_naam, fase = 'voorbereiding', zichtbaar = true, gewijzigd_op = now()`,
      [tenantId, k.projectcode, adres, plaats, k.medewerkerRealworksId],
    );
    telling.voorbereiding += 1;
  }
  const verborgen = await tx.query("select count(*)::int as n from woning where tenant_id = $1 and not zichtbaar", [tenantId]);
  telling.verborgen = verborgen.rows[0].n;
  return telling;
}

export type WoningOpBord = {
  id: string;
  projectcode: string;
  adres: string | null;
  plaats: string | null;
  vraagprijs: number | null;
  makelaar: string;
  backoffice: string | null;
  backofficeMedewerkerId: string | null;
  fase: WoningFase;
  realworksStatus: string | null;
  stappen: StapUitkomst[];
};

const FASES: Record<Spoor, WoningFase[]> = { verkoop: ["voorbereiding", "in_verkoop"], kovk: ["verkocht_ov", "verkocht"] };

/**
 * De woningen op het bord van een spoor, met per stap de stand (Realworks, handmatig of open). Met `alleenId` komt die ene
 * woning terug met de stappen van het gevraagde spoor, ongeacht haar fase.
 */
export async function leesWoningen(tx: Tx, tenantId: string, spoor: Spoor, vandaag: string, alleenId: string | null = null): Promise<WoningOpBord[]> {
  const { rows } = await tx.query(
    `select w.id, w.projectcode, w.adres, w.plaats, w.vraagprijs, w.makelaar_naam, w.backoffice_medewerker_id, w.fase,
            coalesce(b.weergavenaam, w.backoffice_naam) as backoffice,
            o.status as realworks_status, coalesce(o.heeft_fotos, false) as heeft_fotos, coalesce(o.heeft_plattegrond, false) as heeft_plattegrond,
            o.energieklasse, coalesce(o.heeft_tekst, false) as heeft_tekst,
            to_char(o.publicatiedatum, 'YYYY-MM-DD') as publicatiedatum, to_char(o.transportdatum, 'YYYY-MM-DD') as transportdatum
       from woning w
       left join object o on o.id = w.object_id and o.tenant_id = w.tenant_id
       left join medewerker b on b.id = w.backoffice_medewerker_id and b.tenant_id = w.tenant_id
      where w.tenant_id = $1 and w.zichtbaar and (($3::uuid is null and w.fase = any($2)) or w.id = $3)
      order by w.fase, w.adres`,
    [tenantId, FASES[spoor], alleenId],
  );
  if (rows.length === 0) return [];
  const codes = rows.map((r) => r.projectcode as string);
  const ids = rows.map((r) => r.id as string);
  const agenda = await tx.query(
    "select projectcode, agendatype as type, to_char(datum, 'YYYY-MM-DD') as datum, status from agendapunt where tenant_id = $1 and projectcode = any($2)",
    [tenantId, codes],
  );
  const stappen = await tx.query(
    "select woning_id, stap, status, to_char(datum, 'YYYY-MM-DD') as datum from woning_stap where tenant_id = $1 and woning_id = any($2)",
    [tenantId, ids],
  );
  return rows.map((r) => {
    const signalen: RealworksSignalen = {
      heeftFotos: r.heeft_fotos, heeftPlattegrond: r.heeft_plattegrond, energieklasse: r.energieklasse, heeftTekst: r.heeft_tekst,
      publicatiedatum: r.publicatiedatum, transportdatum: r.transportdatum,
      agenda: agenda.rows.filter((a) => a.projectcode === r.projectcode).map((a) => ({ type: a.type, datum: a.datum, status: a.status })),
    };
    const handmatig: HandmatigeStap[] = stappen.rows.filter((s) => s.woning_id === r.id).map((s) => ({ stap: s.stap, status: s.status as StapStatus, datum: s.datum }));
    return {
      id: r.id, projectcode: r.projectcode, adres: r.adres, plaats: r.plaats, vraagprijs: r.vraagprijs === null ? null : Number(r.vraagprijs),
      makelaar: r.makelaar_naam, backoffice: r.backoffice, backofficeMedewerkerId: r.backoffice_medewerker_id, fase: r.fase as WoningFase,
      realworksStatus: r.realworks_status, stappen: bepaalStappen(spoor, signalen, handmatig, vandaag),
    };
  });
}

/** Zet een stap met de hand. "Open" verwijdert de invoer. Geeft false als de woning niet bestaat binnen de tenant. */
export async function bewaarWoningStap(tx: Tx, tenantId: string, woningId: string, invoer: HandmatigeStap, gebruikerId: string | null, herkomst: "handmatig" | "import" = "handmatig"): Promise<boolean> {
  const woning = await tx.query("select 1 from woning where tenant_id = $1 and id = $2", [tenantId, woningId]);
  if (woning.rowCount === 0) return false;
  if (invoer.status === "open") {
    await tx.query("delete from woning_stap where tenant_id = $1 and woning_id = $2 and stap = $3", [tenantId, woningId, invoer.stap]);
    return true;
  }
  await tx.query(
    `insert into woning_stap (tenant_id, woning_id, stap, status, datum, herkomst, gewijzigd_door) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (tenant_id, woning_id, stap) do update
       set status = excluded.status, datum = excluded.datum, herkomst = excluded.herkomst, gewijzigd_door = excluded.gewijzigd_door, gewijzigd_op = now()`,
    [tenantId, woningId, invoer.stap, invoer.status, invoer.datum, herkomst, gebruikerId],
  );
  return true;
}

/** Wie van de backoffice de woning begeleidt; leeg maakt het veld leeg. */
export async function zetBackoffice(tx: Tx, tenantId: string, woningId: string, medewerkerId: string | null): Promise<boolean> {
  const { rowCount } = await tx.query(
    `update woning set backoffice_medewerker_id = (select id from medewerker where tenant_id = $1 and id = $3), backoffice_naam = null, gewijzigd_op = now()
      where tenant_id = $1 and id = $2`,
    [tenantId, woningId, medewerkerId],
  );
  return (rowCount ?? 0) > 0;
}

export type WoningImportRij = { adres: string; backoffice: string | null; stappen: HandmatigeStap[] };

/**
 * Import van de Excel-checklist. Realworks is leidend: alleen rijen waarvan het adres bij een woning op het bord hoort
 * worden overgenomen, en een stap die al met de hand in het portaal is gezet blijft staan. Herhaalbaar.
 */
export async function importeerWoningStappen(tx: Tx, tenantId: string, spoor: Spoor, rijen: WoningImportRij[]): Promise<{ gekoppeld: number; nietGevonden: number; stappen: number; backoffice: number }> {
  const geldig = new Set(stappenVoorSpoor(spoor).map((s) => s.sleutel));
  await tx.query("delete from woning_stap where tenant_id = $1 and herkomst = 'import' and stap = any($2)", [tenantId, [...geldig]]);
  const woningen = await tx.query(
    "select id, adres, plaats, backoffice_medewerker_id from woning where tenant_id = $1 and zichtbaar and adres is not null and fase = any($2)",
    [tenantId, spoor === "kovk" ? FASES.kovk : [...FASES.verkoop, ...FASES.kovk]],
  );
  const uitkomst = { gekoppeld: 0, nietGevonden: 0, stappen: 0, backoffice: 0 };
  const gebruikt = new Set<string>();
  for (const rij of rijen) {
    // De Excel-cel is vrije tekst ("Straat 12" of "Straat 12, Plaats"); het adres van de woning moet er als geheel in staan.
    const woning = woningen.rows
      .filter((w) => !gebruikt.has(w.id) && locatieBevatAdres(rij.adres, w.adres))
      .sort((a, b) => (b.adres as string).length - (a.adres as string).length)[0];
    if (!woning) {
      uitkomst.nietGevonden += 1;
      continue;
    }
    gebruikt.add(woning.id);
    uitkomst.gekoppeld += 1;
    for (const s of rij.stappen) {
      if (!geldig.has(s.stap) || s.status === "open") continue;
      const { rowCount } = await tx.query(
        `insert into woning_stap (tenant_id, woning_id, stap, status, datum, herkomst) values ($1, $2, $3, $4, $5, 'import')
         on conflict (tenant_id, woning_id, stap) do nothing`,
        [tenantId, woning.id, s.stap, s.status, s.datum],
      );
      uitkomst.stappen += rowCount ?? 0;
    }
    if (rij.backoffice && woning.backoffice_medewerker_id === null) {
      const { rowCount } = await tx.query(
        `update woning set backoffice_naam = $3,
                backoffice_medewerker_id = (select id from medewerker where tenant_id = $1 and lower(roepnaam) = lower($3) order by actief desc limit 1)
          where tenant_id = $1 and id = $2`,
        [tenantId, woning.id, rij.backoffice],
      );
      uitkomst.backoffice += rowCount ?? 0;
    }
  }
  return uitkomst;
}
