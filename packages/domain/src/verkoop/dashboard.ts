// Metricdefinities voor het dashboard "Verkoop en omzet", gelijk aan de Excel van C&R:
// - omzet per maand: omzet excl. btw in de maand van passeren ("Omzet per maand"), naast de doelstelling;
// - verkochte omzet per maand: omzet excl. btw in de maand van verkoop ("Verkocht per maand");
// - aantal verkocht: koop, split en nieuwbouw, geteld naar aandeel, zodat een gedeelde verkoop samen één woning is.
import type { VerkoopRegel, VerkoopSoort } from "./excel-import";
import { berekenVerkoop } from "./rekenregels";

export type Doel = { jaar: number; maand: number; waarde: number };

export type VerkoopDashboardInvoer = {
  regels: VerkoopRegel[];
  doelen: Doel[];
  jaar: number;
  /** Laatste maand (1-12) die meetelt; latere maanden van dit jaar zijn null. */
  totEnMetMaand: number;
};

type PerMaand = { ditJaar: (number | null)[]; vorigJaar: number[] };

export type VerkoopDashboardCijfers = {
  jaar: number;
  totEnMetMaand: number;
  verkochtPerMaand: PerMaand;
  omzetPerMaand: PerMaand & { doel: (number | null)[] };
  verkochteOmzetPerMaand: PerMaand;
  perMakelaar: { naam: string; omzetExBtw: number; verkocht: number }[];
  kern: {
    verkocht: number;
    verkochtVorigJaar: number;
    omzet: number;
    omzetVorigJaar: number;
    doel: number;
    /** Regels die dit jaar verkocht zijn maar nog geen passeermaand hebben en dus nog niet in de omzet tellen. */
    nogZonderPasseermaand: number;
  };
};

const TELT_ALS_WONING: ReadonlySet<VerkoopSoort> = new Set(["koop", "split", "nieuwbouw"]);
const twaalf = () => Array.from({ length: 12 }, () => 0);
const jaarEnMaand = (datum: string | null) => (datum ? { jaar: Number(datum.slice(0, 4)), maand: Number(datum.slice(5, 7)) } : null);

export function verkoopDashboard({ regels, doelen, jaar, totEnMetMaand }: VerkoopDashboardInvoer): VerkoopDashboardCijfers {
  const aantal = { dit: twaalf(), vorig: twaalf() };
  const omzet = { dit: twaalf(), vorig: twaalf() };
  const verkochteOmzet = { dit: twaalf(), vorig: twaalf() };
  const makelaars = new Map<string, { omzetExBtw: number; verkocht: number }>();
  const makelaar = (naam: string) => makelaars.get(naam) ?? makelaars.set(naam, { omzetExBtw: 0, verkocht: 0 }).get(naam)!;
  let nogZonderPasseermaand = 0;

  for (const regel of regels) {
    const bedrag = berekenVerkoop(regel).omzetTotaalExBtw;
    const verkoop = jaarEnMaand(regel.verkoopdatum);
    const passeren = jaarEnMaand(regel.omzetMaand);

    if (verkoop) {
      const reeks = verkoop.jaar === jaar ? "dit" : verkoop.jaar === jaar - 1 ? "vorig" : null;
      if (reeks) {
        verkochteOmzet[reeks][verkoop.maand - 1]! += bedrag;
        if (TELT_ALS_WONING.has(regel.soort)) aantal[reeks][verkoop.maand - 1]! += regel.aandeel;
      }
      if (verkoop.jaar === jaar && verkoop.maand <= totEnMetMaand) {
        if (TELT_ALS_WONING.has(regel.soort)) makelaar(regel.makelaar).verkocht += regel.aandeel;
        if (!passeren) nogZonderPasseermaand += 1;
      }
    }
    if (passeren) {
      const reeks = passeren.jaar === jaar ? "dit" : passeren.jaar === jaar - 1 ? "vorig" : null;
      if (reeks) omzet[reeks][passeren.maand - 1]! += bedrag;
      if (passeren.jaar === jaar && passeren.maand <= totEnMetMaand) makelaar(regel.makelaar).omzetExBtw += bedrag;
    }
  }

  const totNu = (rij: number[]): (number | null)[] => rij.map((w, i) => (i < totEnMetMaand ? w : null));
  const som = (rij: number[]) => rij.slice(0, totEnMetMaand).reduce((t, w) => t + w, 0);
  const doel = Array.from({ length: 12 }, (_, i) => doelen.find((d) => d.jaar === jaar && d.maand === i + 1)?.waarde ?? null);

  return {
    jaar,
    totEnMetMaand,
    verkochtPerMaand: { ditJaar: totNu(aantal.dit), vorigJaar: aantal.vorig },
    omzetPerMaand: { ditJaar: totNu(omzet.dit), vorigJaar: omzet.vorig, doel },
    verkochteOmzetPerMaand: { ditJaar: totNu(verkochteOmzet.dit), vorigJaar: verkochteOmzet.vorig },
    perMakelaar: [...makelaars.entries()]
      .map(([naam, m]) => ({ naam, ...m }))
      .filter((m) => m.omzetExBtw > 0 || m.verkocht > 0)
      .sort((a, b) => b.omzetExBtw - a.omzetExBtw),
    kern: {
      verkocht: som(aantal.dit),
      verkochtVorigJaar: som(aantal.vorig),
      omzet: som(omzet.dit),
      omzetVorigJaar: som(omzet.vorig),
      doel: doel.slice(0, totEnMetMaand).reduce<number>((t, w) => t + (w ?? 0), 0),
      nogZonderPasseermaand,
    },
  };
}
