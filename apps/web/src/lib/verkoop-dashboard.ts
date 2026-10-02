// Gegevens voor het dashboard "Verkoop en omzet". Met een database (PGHOST gezet) komen de cijfers uit de verkoopregels
// van de tenant en rekent packages/domain ze door; zonder database toont het portaal voorbeeldcijfers (lokaal ontwikkelen).
import "server-only";
import { connection } from "next/server";
import { leesOmzetdoelen, leesVerkoopregels } from "@makelaarscockpit/db";
import { berekenVerkoop, verkoopDashboard, type VerkoopRegel } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";

export type VerkochteWoning = {
  id: string;
  adres: string;
  makelaar: string;
  verkoopmaand: Date;
  passeerdatum: Date | null;
  verkoopprijs: number | null;
  omzetExBtw: number;
  gedeeld: boolean;
  /** Uit de Realworks-koppeling; de courtage moet nog in het portaal worden ingevuld. */
  courtageOntbreekt: boolean;
  onderVoorbehoud: boolean;
};

export type VerkoopDashboard = {
  isVoorbeeld: boolean;
  jaar: number;
  tot: Date;
  verkochtPerMaand: { ditJaar: (number | null)[]; vorigJaar: number[] };
  omzetPerMaand: { ditJaar: (number | null)[]; vorigJaar: number[]; doel: (number | null)[] };
  perMakelaar: { naam: string; omzetExBtw: number; verkocht: number }[];
  recent: VerkochteWoning[];
  kern: {
    verkocht: number;
    verkochtVorigJaar: number;
    omzet: number;
    omzetVorigJaar: number;
    doel: number;
    nogZonderPasseermaand: number;
    nogZonderCourtage: number;
  };
};

export function kerncijfers(d: VerkoopDashboard) {
  const { verkocht, verkochtVorigJaar, omzet, omzetVorigJaar, doel } = d.kern;
  const perWoning = verkocht ? omzet / verkocht : 0;
  const perWoningVorig = verkochtVorigJaar ? omzetVorigJaar / verkochtVorigJaar : 0;
  const verschil = (nu: number, toen: number) => (toen ? (nu - toen) / toen : undefined);
  return {
    verkocht,
    verkochtVerschil: verschil(verkocht, verkochtVorigJaar),
    omzet,
    omzetVerschil: verschil(omzet, omzetVorigJaar),
    doel,
    doelVerschil: verschil(omzet, doel),
    perWoning,
    perWoningVerschil: verschil(perWoning, perWoningVorig),
  };
}

const datum = (iso: string) => new Date(`${iso}T00:00:00`);

function vandaagInNederland(): { jaar: number; maand: number; datum: Date } {
  const delen = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { jaar: Number(delen.slice(0, 4)), maand: Number(delen.slice(5, 7)), datum: datum(delen) };
}

const TELT_ALS_WONING = new Set(["koop", "split", "nieuwbouw"]);

function recentVerkocht(regels: VerkoopRegel[], aantal: number): VerkochteWoning[] {
  return regels
    .filter((r) => r.verkoopdatum && TELT_ALS_WONING.has(r.soort))
    .sort((a, b) => (b.verkoopdatum! < a.verkoopdatum! ? -1 : b.verkoopdatum! > a.verkoopdatum! ? 1 : 0))
    .slice(0, aantal)
    .map((r, i) => ({
      id: String(i),
      adres: r.adres ?? "Adres onbekend",
      makelaar: r.makelaar,
      verkoopmaand: datum(r.verkoopdatum!),
      passeerdatum: r.passeerdatum ? datum(r.passeerdatum) : null,
      verkoopprijs: r.verkoopprijs,
      omzetExBtw: berekenVerkoop(r).omzetTotaalExBtw,
      gedeeld: r.aandeel < 1,
      courtageOntbreekt: r.courtage === null && r.herkomst === "koppeling",
      onderVoorbehoud: r.onderVoorbehoud === true,
    }));
}

export async function haalVerkoopDashboard(): Promise<VerkoopDashboard> {
  // De cijfers horen bij het moment van opvragen, niet bij het moment van bouwen. Dit moet vóór de databasecontrole staan:
  // tijdens het bouwen is er geen database, en anders zou de pagina statisch met voorbeeldcijfers worden ingebakken.
  await connection();
  if (!heeftDatabase()) return voorbeeld();
  const nu = vandaagInNederland();
  const { regels, doelen } = await metHuidigeTenant(async (tx, sessie) => ({
    regels: await leesVerkoopregels(tx, sessie.tenantId, nu.jaar - 1),
    doelen: await leesOmzetdoelen(tx, sessie.tenantId, nu.jaar),
  }));
  const cijfers = verkoopDashboard({ regels, doelen, jaar: nu.jaar, totEnMetMaand: nu.maand });
  return {
    isVoorbeeld: false,
    jaar: nu.jaar,
    tot: nu.datum,
    verkochtPerMaand: cijfers.verkochtPerMaand,
    omzetPerMaand: cijfers.omzetPerMaand,
    perMakelaar: cijfers.perMakelaar,
    recent: recentVerkocht(regels, 8),
    kern: cijfers.kern,
  };
}

function voorbeeld(): VerkoopDashboard {
  const n = null;
  const woning = (adres: string, makelaar: string, maand: number, prijs: number, omzet: number, passeren: Date | null): VerkochteWoning => ({
    id: adres, adres, makelaar, verkoopmaand: new Date(2026, maand, 1), passeerdatum: passeren, verkoopprijs: prijs, omzetExBtw: omzet, gedeeld: false,
    courtageOntbreekt: false, onderVoorbehoud: false,
  });
  return {
    isVoorbeeld: true,
    jaar: 2026,
    tot: new Date(2026, 8, 30),
    verkochtPerMaand: { ditJaar: [31, 36, 47, 42, 49, 54, 44, 38, 45, n, n, n], vorigJaar: [27, 30, 39, 41, 40, 46, 41, 33, 36, 40, 34, 28] },
    omzetPerMaand: {
      ditJaar: [148_200, 171_500, 224_900, 199_300, 233_800, 257_400, 209_600, 181_000, 214_700, n, n, n],
      vorigJaar: [124_600, 139_800, 181_200, 190_500, 186_300, 214_900, 191_700, 153_400, 167_800, 186_900, 158_300, 129_900],
      doel: Array.from({ length: 12 }, () => 200_000),
    },
    perMakelaar: [
      { naam: "Makelaar A", omzetExBtw: 612_300, verkocht: 128 },
      { naam: "Makelaar B", omzetExBtw: 448_900, verkocht: 94 },
      { naam: "Makelaar C", omzetExBtw: 341_200, verkocht: 71 },
      { naam: "Makelaar D", omzetExBtw: 268_500, verkocht: 56 },
      { naam: "Makelaar E", omzetExBtw: 169_500, verkocht: 37 },
    ],
    recent: [
      woning("Voorbeeldstraat 12", "Makelaar A", 8, 425_000, 5_058, new Date(2026, 10, 14)),
      woning("Proeflaan 8", "Makelaar B", 8, 318_500, 3_913, new Date(2026, 10, 3)),
      woning("Demoplein 3", "Makelaar A", 8, 579_000, 6_712, new Date(2026, 8, 25)),
      woning("Testweg 41", "Makelaar C", 8, 289_000, 3_596, null),
    ],
    kern: { verkocht: 386, verkochtVorigJaar: 333, omzet: 1_840_400, omzetVorigJaar: 1_550_200, doel: 1_800_000, nogZonderPasseermaand: 0, nogZonderCourtage: 0 },
  };
}
