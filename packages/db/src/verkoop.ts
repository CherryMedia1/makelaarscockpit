// Queries rond verkopen en doelstellingen. Altijd binnen metTenant, en altijd met een expliciet filter op tenant_id.
import type { Doel, VerkoopRegel, VerkoopSoort } from "@makelaarscockpit/domain";
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
    `select v.soort, v.adres, d.makelaar_naam, d.aandeel,
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
