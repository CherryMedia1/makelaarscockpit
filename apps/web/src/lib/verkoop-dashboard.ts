// Gegevens voor het dashboard "Verkoop en omzet". Nu nog voorbeelddata; zodra de synchronisatie met Realworks
// en de Excel-import er zijn (issues #3, #4, #8) komt dit uit de API en verdwijnt `isVoorbeeld`.

export type VerkochteWoning = {
  id: string;
  adres: string;
  plaats: string;
  makelaar: string;
  verkoopdatum: Date;
  passeerdatum: Date | null;
  verkoopprijs: number;
  omzetExBtw: number | null;
  status: "Verkocht o.v." | "Verkocht";
};

export type VerkoopDashboard = {
  isVoorbeeld: boolean;
  jaar: number;
  tot: Date;
  verkochtPerMaand: { ditJaar: (number | null)[]; vorigJaar: number[] };
  omzetPerMaand: { ditJaar: (number | null)[]; vorigJaar: number[]; doel: number[] };
  perMakelaar: { naam: string; omzetExBtw: number; verkocht: number }[];
  recent: VerkochteWoning[];
};

const som = (rij: (number | null)[]) => rij.reduce<number>((t, w) => t + (w ?? 0), 0);

export function kerncijfers(d: VerkoopDashboard) {
  const maanden = d.verkochtPerMaand.ditJaar.filter((w) => w !== null).length;
  const verkocht = som(d.verkochtPerMaand.ditJaar);
  const verkochtVorig = som(d.verkochtPerMaand.vorigJaar.slice(0, maanden));
  const omzet = som(d.omzetPerMaand.ditJaar);
  const omzetVorig = som(d.omzetPerMaand.vorigJaar.slice(0, maanden));
  const doel = som(d.omzetPerMaand.doel.slice(0, maanden));
  return {
    maanden,
    verkocht,
    verkochtVerschil: verkochtVorig ? (verkocht - verkochtVorig) / verkochtVorig : 0,
    omzet,
    omzetVerschil: omzetVorig ? (omzet - omzetVorig) / omzetVorig : 0,
    doel,
    doelVerschil: doel ? (omzet - doel) / doel : 0,
    gemiddeldeOmzetPerWoning: verkocht ? omzet / verkocht : 0,
    gemiddeldeOmzetPerWoningVorig: verkochtVorig ? omzetVorig / verkochtVorig : 0,
  };
}

export async function haalVerkoopDashboard(): Promise<VerkoopDashboard> {
  const n = null;
  return {
    isVoorbeeld: true,
    jaar: 2026,
    tot: new Date(2026, 8, 30),
    verkochtPerMaand: {
      ditJaar: [31, 36, 47, 42, 49, 54, 44, 38, 45, n, n, n],
      vorigJaar: [27, 30, 39, 41, 40, 46, 41, 33, 36, 40, 34, 28],
    },
    omzetPerMaand: {
      ditJaar: [148_200, 171_500, 224_900, 199_300, 233_800, 257_400, 209_600, 181_000, 214_700, n, n, n],
      vorigJaar: [124_600, 139_800, 181_200, 190_500, 186_300, 214_900, 191_700, 153_400, 167_800, 186_900, 158_300, 129_900],
      doel: [150_000, 165_000, 205_000, 205_000, 215_000, 235_000, 215_000, 175_000, 200_000, 210_000, 180_000, 150_000],
    },
    perMakelaar: [
      { naam: "Makelaar A", omzetExBtw: 612_300, verkocht: 128 },
      { naam: "Makelaar B", omzetExBtw: 448_900, verkocht: 94 },
      { naam: "Makelaar C", omzetExBtw: 341_200, verkocht: 71 },
      { naam: "Makelaar D", omzetExBtw: 268_500, verkocht: 56 },
      { naam: "Makelaar E", omzetExBtw: 169_500, verkocht: 37 },
    ],
    recent: [
      { id: "1", adres: "Voorbeeldstraat 12", plaats: "Roosendaal", makelaar: "Makelaar A", verkoopdatum: new Date(2026, 8, 26), passeerdatum: new Date(2026, 10, 14), verkoopprijs: 425_000, omzetExBtw: 5_058, status: "Verkocht o.v." },
      { id: "2", adres: "Proeflaan 8", plaats: "Roosendaal", makelaar: "Makelaar B", verkoopdatum: new Date(2026, 8, 24), passeerdatum: new Date(2026, 10, 3), verkoopprijs: 318_500, omzetExBtw: 3_913, status: "Verkocht o.v." },
      { id: "3", adres: "Demoplein 3", plaats: "Bergen op Zoom", makelaar: "Makelaar A", verkoopdatum: new Date(2026, 8, 19), passeerdatum: new Date(2026, 9, 30), verkoopprijs: 579_000, omzetExBtw: 6_712, status: "Verkocht" },
      { id: "4", adres: "Testweg 41", plaats: "Roosendaal", makelaar: "Makelaar C", verkoopdatum: new Date(2026, 8, 17), passeerdatum: new Date(2026, 10, 21), verkoopprijs: 289_000, omzetExBtw: 3_596, status: "Verkocht o.v." },
      { id: "5", adres: "Voorbeeldkade 27", plaats: "Oudenbosch", makelaar: "Makelaar D", verkoopdatum: new Date(2026, 8, 12), passeerdatum: new Date(2026, 9, 28), verkoopprijs: 364_000, omzetExBtw: 4_402, status: "Verkocht" },
      { id: "6", adres: "Proefdreef 5", plaats: "Roosendaal", makelaar: "Makelaar B", verkoopdatum: new Date(2026, 8, 9), passeerdatum: null, verkoopprijs: 447_500, omzetExBtw: null, status: "Verkocht o.v." },
    ],
  };
}
