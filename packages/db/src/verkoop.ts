// Queries rond verkopen en doelstellingen. Altijd binnen metTenant, en altijd met een expliciet filter op tenant_id.
import type { Doel, VerkoopHerkomst, VerkoopRegel, VerkoopSoort, VerkoopUitRealworks } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/** Vervangt alle regels van één importbron door de opgegeven regels, zodat een import herhaalbaar is. */
export async function vervangImport(tx: Tx, tenantId: string, bron: string, regels: VerkoopRegel[]): Promise<number> {
  await tx.query("delete from verkoop where tenant_id = $1 and import_bron = $2", [tenantId, bron]);
  for (const r of regels) {
    const { rows } = await tx.query(
      `insert into verkoop (tenant_id, soort, adres, verkoopdatum, omzet_maand, passeerdatum, verkoopprijs,
         courtage_soort, courtage_fractie, courtage_bedrag, opstartnota, nota_verstuurd, herkomst, import_bron, import_rij)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'import', $13, $14) returning id`,
      [
        tenantId, r.soort, r.adres, r.verkoopdatum, r.omzetMaand, r.passeerdatum, r.verkoopprijs,
        r.courtage?.soort ?? null,
        r.courtage?.soort === "percentage" ? r.courtage.fractie : null,
        r.courtage?.soort === "vast" ? r.courtage.bedrag : null,
        r.opstartnota, r.notaVerstuurd, bron, r.importRij ?? null,
      ],
    );
    await tx.query("insert into verkoop_verdeling (tenant_id, verkoop_id, makelaar_naam, aandeel) values ($1, $2, $3, $4)", [tenantId, rows[0].id, r.makelaar, r.aandeel]);
  }
  return regels.length;
}

export type KoppelingUitkomst = { nieuw: number; bijgewerkt: number; zonderObject: number };

/**
 * Legt verkopen uit de Realworks-koppeling vast: nieuw aanmaken of de Realworks-velden bijwerken.
 * Wat in het portaal is ingevuld (courtage, opstartnota, notastatus, verdeling) blijft staan.
 */
export async function upsertKoppelingVerkopen(tx: Tx, tenantId: string, verkopen: VerkoopUitRealworks[]): Promise<KoppelingUitkomst> {
  const uitkomst: KoppelingUitkomst = { nieuw: 0, bijgewerkt: 0, zonderObject: 0 };
  for (const v of verkopen) {
    const object = await tx.query("select id from object where tenant_id = $1 and realworks_id = $2", [tenantId, v.realworksId]);
    const objectId = object.rows[0]?.id as string | undefined;
    if (!objectId) {
      uitkomst.zonderObject += 1;
      continue;
    }
    const { rows } = await tx.query(
      `insert into verkoop (tenant_id, object_id, soort, adres, verkoopdatum, omzet_maand, passeerdatum, verkoopprijs, onder_voorbehoud, herkomst)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'koppeling')
       on conflict (tenant_id, object_id) where herkomst = 'koppeling' do update
         set adres = excluded.adres, verkoopdatum = excluded.verkoopdatum, omzet_maand = excluded.omzet_maand,
             passeerdatum = excluded.passeerdatum, verkoopprijs = excluded.verkoopprijs, onder_voorbehoud = excluded.onder_voorbehoud,
             gewijzigd_op = now()
       returning id, (xmax = 0) as nieuw`,
      [tenantId, objectId, v.soort, v.adres, v.verkoopdatum, v.omzetMaand, v.passeerdatum, v.verkoopprijs, v.onderVoorbehoud],
    );
    const verkoopId = rows[0].id as string;
    if (rows[0].nieuw) uitkomst.nieuw += 1;
    else uitkomst.bijgewerkt += 1;
    // De verdeling alleen zetten als er nog geen is; een handmatig ingevulde verdeling wint van de koppeling.
    await tx.query(
      `insert into verkoop_verdeling (tenant_id, verkoop_id, medewerker_id, makelaar_naam, aandeel)
       select $1, $2, (select id from medewerker where tenant_id = $1 and relatiecode = $3), $4, 1
        where not exists (select 1 from verkoop_verdeling where tenant_id = $1 and verkoop_id = $2)`,
      [tenantId, verkoopId, v.makelaarCode, v.makelaar],
    );
  }
  return uitkomst;
}

/**
 * Verwijdert verkopen uit de koppeling waarvan het object niet meer verkocht is (de verkoop is niet doorgegaan),
 * zolang er in het portaal nog niets is ingevuld. Geeft het aantal verwijderde en het aantal bewaarde regels.
 */
export async function verwijderVervallenKoppelingVerkopen(tx: Tx, tenantId: string): Promise<{ verwijderd: number; bewaard: number }> {
  const vervallen = `from verkoop v join object o on o.id = v.object_id and o.tenant_id = v.tenant_id
     where v.tenant_id = $1 and v.herkomst = 'koppeling' and o.status not in ('VERKOCHT', 'VERKOCHT_ONDER_VOORBEHOUD')`;
  const ingevuld = "(v.courtage_soort is not null or v.opstartnota <> 0 or v.nota_verstuurd)";
  const bewaard = await tx.query(`select count(*)::int as n ${vervallen} and ${ingevuld}`, [tenantId]);
  const { rowCount } = await tx.query(`delete from verkoop where tenant_id = $1 and id in (select v.id ${vervallen} and not ${ingevuld})`, [tenantId]);
  return { verwijderd: rowCount ?? 0, bewaard: bewaard.rows[0].n as number };
}

export async function zetOmzetdoelen(tx: Tx, tenantId: string, doelen: Doel[]): Promise<void> {
  for (const d of doelen) {
    await tx.query(
      `insert into doelstelling (tenant_id, jaar, maand, soort, waarde) values ($1, $2, $3, 'omzet_ex_btw', $4)
       on conflict (tenant_id, jaar, maand, soort) do update set waarde = excluded.waarde`,
      [tenantId, d.jaar, d.maand, d.waarde],
    );
  }
}

export async function leesOmzetdoelen(tx: Tx, tenantId: string, jaar: number): Promise<Doel[]> {
  const { rows } = await tx.query("select jaar, maand, waarde from doelstelling where tenant_id = $1 and jaar = $2 and soort = 'omzet_ex_btw'", [tenantId, jaar]);
  return rows.map((r) => ({ jaar: r.jaar, maand: r.maand, waarde: Number(r.waarde) }));
}

const getal = (w: string | null): number | null => (w === null ? null : Number(w));

/** Eén regel per makelaar-aandeel, voor verkopen of omzet vanaf het opgegeven jaar. */
export async function leesVerkoopregels(tx: Tx, tenantId: string, vanafJaar: number): Promise<VerkoopRegel[]> {
  const { rows } = await tx.query(
    `select v.soort, v.adres, v.herkomst, v.onder_voorbehoud, d.makelaar_naam, d.aandeel,
            to_char(v.verkoopdatum, 'YYYY-MM-DD') as verkoopdatum, to_char(v.omzet_maand, 'YYYY-MM-DD') as omzet_maand,
            to_char(v.passeerdatum, 'YYYY-MM-DD') as passeerdatum, v.verkoopprijs, v.courtage_soort, v.courtage_fractie,
            v.courtage_bedrag, v.opstartnota, v.nota_verstuurd
       from verkoop v
       join verkoop_verdeling d on d.verkoop_id = v.id and d.tenant_id = v.tenant_id
      where v.tenant_id = $1
        and (extract(year from v.verkoopdatum) >= $2 or extract(year from v.omzet_maand) >= $2)`,
    [tenantId, vanafJaar],
  );
  return rows.map((r) => ({
    soort: r.soort as VerkoopSoort,
    herkomst: r.herkomst as VerkoopHerkomst,
    onderVoorbehoud: r.onder_voorbehoud as boolean,
    adres: r.adres,
    makelaar: r.makelaar_naam,
    aandeel: Number(r.aandeel),
    verkoopdatum: r.verkoopdatum,
    omzetMaand: r.omzet_maand,
    passeerdatum: r.passeerdatum,
    verkoopprijs: getal(r.verkoopprijs),
    courtage:
      r.courtage_soort === "percentage" ? { soort: "percentage", fractie: Number(r.courtage_fractie) }
      : r.courtage_soort === "vast" ? { soort: "vast", bedrag: Number(r.courtage_bedrag) }
      : null,
    opstartnota: Number(r.opstartnota),
    notaVerstuurd: r.nota_verstuurd,
  }));
}
