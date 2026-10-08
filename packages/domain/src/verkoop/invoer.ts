// Invoer van de financiële gegevens per verkoop in het portaal (ADR-007, issue #7): parsen van Nederlandse notatie en
// validatie. Foutmeldingen zijn bedoeld voor de medewerker en staan per veld, zodat het formulier ze onder het veld toont.
import type { Courtage } from "./rekenregels";
import type { VerkoopSoort } from "./excel-import";

export const VERKOOP_SOORTEN: readonly VerkoopSoort[] = ["koop", "split", "nieuwbouw", "taxatie", "huur", "overig"];

export type CourtageInvoerSoort = "percentage" | "vast" | "geen";

/** Alles zoals het uit het formulier komt: tekst, nog niet gecontroleerd. */
export type RuweVerkoopInvoer = {
  soort: string;
  adres: string;
  /** 'JJJJ-MM-DD' */
  verkoopdatum: string;
  passeerdatum: string;
  /** 'JJJJ-MM'; leeg = afleiden van de passeerdatum. */
  omzetMaand: string;
  verkoopprijs: string;
  courtageSoort: string;
  courtagePercentage: string;
  courtageBedrag: string;
  opstartnota: string;
  notaVerstuurd: boolean;
  verdeling: { medewerkerId: string; makelaar: string; aandeel: string }[];
};

export type VerdelingRegel = { medewerkerId: string | null; makelaar: string; aandeel: number };

export type GeldigeVerkoopInvoer = {
  soort: VerkoopSoort;
  adres: string;
  verkoopdatum: string;
  passeerdatum: string | null;
  omzetMaand: string | null;
  verkoopprijs: number | null;
  courtage: Courtage | null;
  opstartnota: number;
  notaVerstuurd: boolean;
  verdeling: VerdelingRegel[];
};

export type VerkoopInvoerFouten = Partial<Record<keyof RuweVerkoopInvoer, string>>;

export type VerkoopInvoerUitkomst = { ok: true; waarde: GeldigeVerkoopInvoer } | { ok: false; fouten: VerkoopInvoerFouten };

type Gelezen = { waarde: number | null } | { fout: string };

const BEDRAG_FOUT = "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50.";

/** Leest "€ 2.500,50", "2500", "2.500", "-500" en "2500.50"; leeg geeft null. */
export function leesBedrag(tekst: string): Gelezen {
  const schoon = tekst.replace(/€/g, "").replace(/\s/g, "");
  if (schoon === "") return { waarde: null };
  let genormaliseerd: string;
  if (schoon.includes(",")) {
    if ((schoon.match(/,/g) ?? []).length > 1) return { fout: BEDRAG_FOUT };
    genormaliseerd = schoon.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+\.\d{1,2}$/.test(schoon)) {
    genormaliseerd = schoon;
  } else {
    genormaliseerd = schoon.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(genormaliseerd)) return { fout: BEDRAG_FOUT };
  return { waarde: Number(genormaliseerd) };
}

/** Leest "1,3", "1.3%" of " 1,25 % " als fractie (0,013); leeg geeft null. */
export function leesPercentage(tekst: string): Gelezen {
  const schoon = tekst.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (schoon === "") return { waarde: null };
  if (!/^\d+(\.\d+)?$/.test(schoon)) return { fout: "Vul een percentage in, bijvoorbeeld 1,3." };
  // Afronden op zes decimalen (0,0001%), zoals de database het bewaart; voorkomt 0,013000000000000001.
  return { waarde: Math.round(Number(schoon) * 10000) / 1_000_000 };
}

function geldigeDatum(tekst: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tekst)) return false;
  const d = new Date(`${tekst}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === tekst;
}

export function valideerVerkoopInvoer(r: RuweVerkoopInvoer): VerkoopInvoerUitkomst {
  const fouten: VerkoopInvoerFouten = {};

  const soort = VERKOOP_SOORTEN.find((s) => s === r.soort.trim());
  if (!soort) fouten.soort = "Kies een soort.";

  const adres = r.adres.trim();
  if (!adres) fouten.adres = "Vul een adres of omschrijving in.";

  const verkoopdatum = r.verkoopdatum.trim();
  if (!verkoopdatum) fouten.verkoopdatum = "Vul de verkoopdatum in.";
  else if (!geldigeDatum(verkoopdatum)) fouten.verkoopdatum = "Vul een geldige datum in.";

  const passeerdatum = r.passeerdatum.trim() || null;
  if (passeerdatum && !geldigeDatum(passeerdatum)) fouten.passeerdatum = "Vul een geldige datum in.";

  let omzetMaand: string | null = null;
  const maand = r.omzetMaand.trim();
  if (maand) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(maand)) fouten.omzetMaand = "Vul een geldige maand in.";
    else omzetMaand = `${maand}-01`;
  } else if (passeerdatum && !fouten.passeerdatum) {
    omzetMaand = `${passeerdatum.slice(0, 7)}-01`;
  }

  const prijs = leesBedrag(r.verkoopprijs);
  let verkoopprijs: number | null = null;
  if ("fout" in prijs) fouten.verkoopprijs = prijs.fout;
  else if (prijs.waarde !== null && prijs.waarde < 0) fouten.verkoopprijs = "Een verkoopprijs kan niet negatief zijn.";
  else verkoopprijs = prijs.waarde;

  let courtage: Courtage | null = null;
  if (r.courtageSoort === "percentage") {
    const p = leesPercentage(r.courtagePercentage);
    if ("fout" in p) fouten.courtagePercentage = p.fout;
    else if (p.waarde === null) fouten.courtagePercentage = "Vul het afgesproken percentage in.";
    else if (p.waarde <= 0 || p.waarde >= 1) fouten.courtagePercentage = "Een percentage ligt tussen 0 en 100.";
    else if (verkoopprijs === null && !fouten.verkoopprijs) fouten.verkoopprijs = "Een courtagepercentage heeft een verkoopprijs nodig.";
    else courtage = { soort: "percentage", fractie: p.waarde };
  } else if (r.courtageSoort === "vast") {
    const b = leesBedrag(r.courtageBedrag);
    if ("fout" in b) fouten.courtageBedrag = b.fout;
    else if (b.waarde === null) fouten.courtageBedrag = "Vul het courtagebedrag in.";
    else if (b.waarde < 0) fouten.courtageBedrag = "Een courtagebedrag kan niet negatief zijn.";
    else courtage = { soort: "vast", bedrag: b.waarde };
  } else if (r.courtageSoort !== "geen") {
    fouten.courtageSoort = "Kies hoe de courtage is afgesproken.";
  }

  const nota = leesBedrag(r.opstartnota);
  let opstartnota = 0;
  if ("fout" in nota) fouten.opstartnota = nota.fout;
  else opstartnota = nota.waarde ?? 0;

  const verdeling: VerdelingRegel[] = [];
  let verdelingFout: string | undefined;
  for (const regel of r.verdeling) {
    const makelaar = regel.makelaar.trim();
    const medewerkerId = regel.medewerkerId.trim() || null;
    if (!makelaar && !medewerkerId && !regel.aandeel.trim()) continue;
    if (!makelaar) {
      verdelingFout = "Kies bij elke regel een makelaar.";
      continue;
    }
    const aandeel = leesPercentage(regel.aandeel);
    if ("fout" in aandeel || aandeel.waarde === null) verdelingFout = "Vul bij elke makelaar een aandeel in procenten in.";
    else if (aandeel.waarde <= 0) verdelingFout = "Elk aandeel moet groter dan 0 zijn.";
    else verdeling.push({ medewerkerId, makelaar, aandeel: aandeel.waarde });
  }
  if (verdelingFout) fouten.verdeling = verdelingFout;
  else if (verdeling.length === 0) fouten.verdeling = "Kies minstens één makelaar.";
  else {
    const som = verdeling.reduce((t, v) => t + v.aandeel, 0);
    if (Math.abs(som - 1) > 0.0005) fouten.verdeling = `De aandelen zijn samen ${Math.round(som * 1000) / 10}%; dat moet 100% zijn.`;
  }

  if (Object.keys(fouten).length > 0 || !soort) return { ok: false, fouten };
  return {
    ok: true,
    waarde: { soort, adres, verkoopdatum, passeerdatum, omzetMaand, verkoopprijs, courtage, opstartnota, notaVerstuurd: r.notaVerstuurd, verdeling },
  };
}
