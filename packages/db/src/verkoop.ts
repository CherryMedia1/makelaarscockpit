// Queries rond verkopen en doelstellingen. Altijd binnen metTenant, en altijd met een expliciet filter op tenant_id.
import { berekenVerkoop, type Courtage, type Doel, type GeldigeVerkoopInvoer, type VerkoopHerkomst, type VerkoopRegel, type VerkoopSoort, type VerkoopUitRealworks } from "@makelaarscockpit/domain";
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

const leesCourtage = (r: { courtage_soort: string | null; courtage_fractie: string | null; courtage_bedrag: string | null }): Courtage | null =>
  r.courtage_soort === "percentage" ? { soort: "percentage", fractie: Number(r.courtage_fractie) }
  : r.courtage_soort === "vast" ? { soort: "vast", bedrag: Number(r.courtage_bedrag) }
  : null;

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
    courtage: leesCourtage(r),
    opstartnota: Number(r.opstartnota),
    notaVerstuurd: r.nota_verstuurd,
  }));
}

// --- Invoer per verkoop in het portaal (issue #7) ---

export type VerkoopOverzichtRegel = {
  id: string;
  soort: VerkoopSoort;
  adres: string | null;
  verkoopdatum: string | null;
  passeerdatum: string | null;
  verkoopprijs: number | null;
  herkomst: VerkoopHerkomst;
  onderVoorbehoud: boolean;
  courtageIngevuld: boolean;
  makelaars: string;
  omzetExBtw: number | null;
};

/** Alle omzetregels vanaf een jaar, nieuwste verkoop eerst; één rij per verkoop met de makelaars samengevoegd. */
export async function leesVerkopenOverzicht(tx: Tx, tenantId: string, vanafJaar: number): Promise<VerkoopOverzichtRegel[]> {
  const { rows } = await tx.query(
    `select v.id, v.soort, v.adres, v.herkomst, v.onder_voorbehoud, v.verkoopprijs,
            to_char(v.verkoopdatum, 'YYYY-MM-DD') as verkoopdatum, to_char(v.passeerdatum, 'YYYY-MM-DD') as passeerdatum,
            v.courtage_soort, v.courtage_fractie, v.courtage_bedrag, v.opstartnota,
            coalesce((select string_agg(d.makelaar_naam, ', ' order by d.aandeel desc, d.makelaar_naam)
                        from verkoop_verdeling d where d.tenant_id = v.tenant_id and d.verkoop_id = v.id), '') as makelaars
       from verkoop v
      where v.tenant_id = $1
        and (extract(year from v.verkoopdatum) >= $2 or extract(year from v.omzet_maand) >= $2 or v.verkoopdatum is null)
      order by v.verkoopdatum desc nulls last, v.adres`,
    [tenantId, vanafJaar],
  );
  return rows.map((r) => {
    const courtage = leesCourtage(r);
    const opstartnota = Number(r.opstartnota);
    const ingevuld = courtage !== null || opstartnota !== 0;
    return {
      id: r.id,
      soort: r.soort as VerkoopSoort,
      adres: r.adres,
      verkoopdatum: r.verkoopdatum,
      passeerdatum: r.passeerdatum,
      verkoopprijs: getal(r.verkoopprijs),
      herkomst: r.herkomst as VerkoopHerkomst,
      onderVoorbehoud: r.onder_voorbehoud,
      courtageIngevuld: courtage !== null,
      makelaars: r.makelaars,
      // Omzet van het kantoor op deze regel (vóór verdeling); null zolang er niets is ingevuld.
      omzetExBtw: ingevuld ? berekenVerkoop({ verkoopprijs: getal(r.verkoopprijs), courtage, opstartnota, aandeel: 1 }).omzetExBtwZonderAandeel : null,
    };
  });
}

export type VerkoopDetail = {
  id: string;
  soort: VerkoopSoort;
  adres: string | null;
  verkoopdatum: string | null;
  passeerdatum: string | null;
  omzetMaand: string | null;
  verkoopprijs: number | null;
  courtage: Courtage | null;
  opstartnota: number;
  notaVerstuurd: boolean;
  herkomst: VerkoopHerkomst;
  onderVoorbehoud: boolean;
  verdeling: { medewerkerId: string | null; makelaar: string; aandeel: number }[];
  /** Realworks-gegevens van het gekoppelde object, als die er zijn. */
  object: { status: string | null; vraagprijs: number | null; gekoppeldeMakelaarCode: string | null; gesynchroniseerdOp: string } | null;
  gewijzigdOp: string;
};

export async function leesVerkoop(tx: Tx, tenantId: string, id: string): Promise<VerkoopDetail | null> {
  const { rows } = await tx.query(
    `select v.id, v.soort, v.adres, v.herkomst, v.onder_voorbehoud, v.verkoopprijs, v.courtage_soort, v.courtage_fractie, v.courtage_bedrag,
            v.opstartnota, v.nota_verstuurd, to_char(v.verkoopdatum, 'YYYY-MM-DD') as verkoopdatum,
            to_char(v.passeerdatum, 'YYYY-MM-DD') as passeerdatum, to_char(v.omzet_maand, 'YYYY-MM-DD') as omzet_maand,
            to_char(v.gewijzigd_op at time zone 'Europe/Amsterdam', 'YYYY-MM-DD HH24:MI') as gewijzigd_op,
            o.status as object_status, o.vraagprijs as object_vraagprijs, o.gekoppelde_makelaar_code,
            to_char(o.gesynchroniseerd_op at time zone 'Europe/Amsterdam', 'YYYY-MM-DD HH24:MI') as object_gesynchroniseerd_op
       from verkoop v
       left join object o on o.id = v.object_id and o.tenant_id = v.tenant_id
      where v.tenant_id = $1 and v.id = $2`,
    [tenantId, id],
  );
  const r = rows[0];
  if (!r) return null;
  const verdeling = await tx.query(
    "select medewerker_id, makelaar_naam, aandeel from verkoop_verdeling where tenant_id = $1 and verkoop_id = $2 order by aandeel desc, makelaar_naam",
    [tenantId, id],
  );
  return {
    id: r.id,
    soort: r.soort as VerkoopSoort,
    adres: r.adres,
    verkoopdatum: r.verkoopdatum,
    passeerdatum: r.passeerdatum,
    omzetMaand: r.omzet_maand,
    verkoopprijs: getal(r.verkoopprijs),
    courtage: leesCourtage(r),
    opstartnota: Number(r.opstartnota),
    notaVerstuurd: r.nota_verstuurd,
    herkomst: r.herkomst as VerkoopHerkomst,
    onderVoorbehoud: r.onder_voorbehoud,
    verdeling: verdeling.rows.map((d) => ({ medewerkerId: d.medewerker_id, makelaar: d.makelaar_naam, aandeel: Number(d.aandeel) })),
    object: r.object_status === null && r.object_gesynchroniseerd_op === null ? null : {
      status: r.object_status,
      vraagprijs: getal(r.object_vraagprijs),
      gekoppeldeMakelaarCode: r.gekoppelde_makelaar_code,
      gesynchroniseerdOp: r.object_gesynchroniseerd_op,
    },
    gewijzigdOp: r.gewijzigd_op,
  };
}

async function vervangVerdeling(tx: Tx, tenantId: string, verkoopId: string, verdeling: GeldigeVerkoopInvoer["verdeling"]): Promise<void> {
  await tx.query("delete from verkoop_verdeling where tenant_id = $1 and verkoop_id = $2", [tenantId, verkoopId]);
  for (const d of verdeling) {
    await tx.query(
      `insert into verkoop_verdeling (tenant_id, verkoop_id, medewerker_id, makelaar_naam, aandeel)
       values ($1, $2, (select id from medewerker where tenant_id = $1 and id = $3), $4, $5)`,
      [tenantId, verkoopId, d.medewerkerId, d.makelaar, d.aandeel],
    );
  }
}

const courtageKolommen = (c: GeldigeVerkoopInvoer["courtage"]) => [
  c?.soort ?? null,
  c?.soort === "percentage" ? c.fractie : null,
  c?.soort === "vast" ? c.bedrag : null,
];

/**
 * Slaat de invoer van het portaal op. Bij een verkoop uit de Realworks-koppeling blijven adres, datums en prijs van
 * Realworks (ADR-007 punt 4); alleen soort, courtage, opstartnota, notastatus en verdeling worden overgenomen.
 */
export async function bewaarVerkoopInvoer(tx: Tx, tenantId: string, id: string, invoer: GeldigeVerkoopInvoer, gebruikerId: string): Promise<boolean> {
  const [courtageSoort, courtageFractie, courtageBedrag] = courtageKolommen(invoer.courtage);
  const { rowCount } = await tx.query(
    `update verkoop
        set soort = $3, courtage_soort = $4, courtage_fractie = $5, courtage_bedrag = $6, opstartnota = $7, nota_verstuurd = $8,
            adres = case when herkomst = 'koppeling' then adres else $9 end,
            verkoopdatum = case when herkomst = 'koppeling' then verkoopdatum else $10::date end,
            passeerdatum = case when herkomst = 'koppeling' then passeerdatum else $11::date end,
            omzet_maand = case when herkomst = 'koppeling' then omzet_maand else $12::date end,
            verkoopprijs = case when herkomst = 'koppeling' then verkoopprijs else $13 end,
            gewijzigd_op = now(), gewijzigd_door = $14
      where tenant_id = $1 and id = $2`,
    [
      tenantId, id, invoer.soort, courtageSoort, courtageFractie, courtageBedrag, invoer.opstartnota, invoer.notaVerstuurd,
      invoer.adres, invoer.verkoopdatum, invoer.passeerdatum, invoer.omzetMaand, invoer.verkoopprijs, gebruikerId,
    ],
  );
  if (!rowCount) return false;
  await vervangVerdeling(tx, tenantId, id, invoer.verdeling);
  return true;
}

/** Een omzetregel zonder Realworks-object, zoals een taxatie of verhuur. Geeft het nieuwe id. */
export async function maakHandmatigeVerkoop(tx: Tx, tenantId: string, invoer: GeldigeVerkoopInvoer, gebruikerId: string): Promise<string> {
  const [courtageSoort, courtageFractie, courtageBedrag] = courtageKolommen(invoer.courtage);
  const { rows } = await tx.query(
    `insert into verkoop (tenant_id, soort, adres, verkoopdatum, passeerdatum, omzet_maand, verkoopprijs, courtage_soort, courtage_fractie,
       courtage_bedrag, opstartnota, nota_verstuurd, herkomst, gewijzigd_door)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'handmatig', $13) returning id`,
    [
      tenantId, invoer.soort, invoer.adres, invoer.verkoopdatum, invoer.passeerdatum, invoer.omzetMaand, invoer.verkoopprijs,
      courtageSoort, courtageFractie, courtageBedrag, invoer.opstartnota, invoer.notaVerstuurd, gebruikerId,
    ],
  );
  const id = rows[0].id as string;
  await vervangVerdeling(tx, tenantId, id, invoer.verdeling);
  return id;
}

export type MedewerkerKeuze = { id: string; naam: string };

/** Medewerkers van het kantoor voor de keuzelijst bij de verdeling. */
export async function leesMedewerkerKeuzes(tx: Tx, tenantId: string): Promise<MedewerkerKeuze[]> {
  const { rows } = await tx.query("select id, weergavenaam as naam from medewerker where tenant_id = $1 and actief order by weergavenaam", [tenantId]);
  return rows.map((r) => ({ id: r.id as string, naam: r.naam as string }));
}
