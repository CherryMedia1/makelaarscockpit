// Vertaalt één rij uit het tabblad "Verkocht woningen" van de Excel van C&R naar een verkoopregel (ADR-007, issue #8).
import type { Courtage, VerkoopInvoer } from "./rekenregels";

export type VerkoopSoort = "koop" | "split" | "nieuwbouw" | "taxatie" | "huur" | "overig";

/** Eén rij zoals die in de Excel staat; datums als Date op middernacht UTC. */
export type ExcelRij = {
  rij: number;
  makelaar: string | null;
  aandeel: number | null;
  type: string | null;
  adres: string | null;
  maandVerkocht: Date | null;
  maandPasseren: Date | null;
  passeerdatum: Date | null;
  nota: string | null;
  verkoopprijs: number | null;
  afgesprokenCourtage: number | null;
  opstartnota: number | null;
  courtage: number | null;
};

/** Een verkoop of andere omzetregel met het aandeel van één makelaar; datums als 'JJJJ-MM-DD'. */
export type VerkoopRegel = VerkoopInvoer & {
  importRij?: number;
  soort: VerkoopSoort;
  adres: string | null;
  makelaar: string;
  /** Datum (of eerste dag van de maand) van verkoop. */
  verkoopdatum: string | null;
  /** Eerste dag van de maand waarin de omzet telt: de maand van passeren. */
  omzetMaand: string | null;
  passeerdatum: string | null;
  notaVerstuurd: boolean;
};

const SOORTEN: Record<string, VerkoopSoort> = { koop: "koop", split: "split", nieuw: "nieuwbouw", nieuwbouw: "nieuwbouw", taxatie: "taxatie", huur: "huur", overig: "overig" };

const isoDatum = (d: Date) => d.toISOString().slice(0, 10);
const eersteVanDeMaand = (d: Date) => `${d.toISOString().slice(0, 7)}-01`;

function bepaalCourtage(rij: ExcelRij): Courtage | null {
  const { afgesprokenCourtage: afspraak, courtage: ingevuld, verkoopprijs } = rij;
  if (afspraak !== null && afspraak >= 1) return { soort: "vast", bedrag: ingevuld ?? afspraak };
  if (afspraak !== null && afspraak > 0 && verkoopprijs !== null) {
    const berekend = verkoopprijs * afspraak;
    // In de Excel is de courtage soms met de hand overschreven; dan telt het ingevulde bedrag.
    if (ingevuld !== null && Math.abs(ingevuld - berekend) > 0.005) return { soort: "vast", bedrag: ingevuld };
    return { soort: "percentage", fractie: afspraak };
  }
  if (ingevuld !== null && ingevuld > 0) return { soort: "vast", bedrag: ingevuld };
  return null;
}

/** Geeft null voor rijen zonder verkoopmaand en zonder passeermaand; die tellen in geen enkel overzicht mee. */
export function excelRijNaarVerkoop(rij: ExcelRij): VerkoopRegel | null {
  if (rij.maandVerkocht === null && rij.maandPasseren === null) return null;
  const aandeel = rij.aandeel ?? 1;
  if (!Number.isFinite(aandeel) || aandeel <= 0 || aandeel > 1) throw new RangeError(`rij ${rij.rij}: aandeel ${aandeel} ligt niet tussen 0 en 1`);
  const opstartnota = rij.opstartnota ?? 0;
  return {
    importRij: rij.rij,
    soort: SOORTEN[(rij.type ?? "").trim().toLowerCase()] ?? "overig",
    adres: rij.adres?.trim() || null,
    makelaar: rij.makelaar?.trim() || "Onbekend",
    aandeel,
    verkoopdatum: rij.maandVerkocht ? isoDatum(rij.maandVerkocht) : null,
    omzetMaand: rij.maandPasseren ? eersteVanDeMaand(rij.maandPasseren) : null,
    passeerdatum: rij.passeerdatum ? isoDatum(rij.passeerdatum) : null,
    verkoopprijs: rij.verkoopprijs,
    courtage: bepaalCourtage(rij),
    opstartnota,
    notaVerstuurd: (rij.nota ?? "").trim().toUpperCase().startsWith("V"),
  };
}
