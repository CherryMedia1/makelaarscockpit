// Kosten per woning en maanddoelstellingen (ADR-007, issue #7): validatie van de invoer en het resultaat per woning.
import { exBtw } from "./rekenregels";
import { leesBedrag } from "./invoer";
import type { Doel } from "./dashboard";

export const KOSTEN_SOORTEN = ["fotograaf", "videograaf", "advertentie", "styling", "energielabel", "overig"] as const;
export type KostenSoort = (typeof KOSTEN_SOORTEN)[number];

export type RuweKostenregelInvoer = { soort: string; leverancier: string; omschrijving: string; bedrag: string; datum: string };

export type GeldigeKostenregel = { soort: KostenSoort; leverancier: string | null; omschrijving: string | null; bedrag: number; datum: string };

export type KostenregelFouten = Partial<Record<keyof RuweKostenregelInvoer, string>>;

const geldigeDatum = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

export function valideerKostenregelInvoer(r: RuweKostenregelInvoer): { ok: true; waarde: GeldigeKostenregel } | { ok: false; fouten: KostenregelFouten } {
  const fouten: KostenregelFouten = {};
  const soort = KOSTEN_SOORTEN.find((s) => s === r.soort.trim());
  if (!soort) fouten.soort = "Kies een soort.";
  const bedrag = leesBedrag(r.bedrag);
  if ("fout" in bedrag) fouten.bedrag = bedrag.fout;
  else if (bedrag.waarde === null) fouten.bedrag = "Vul het bedrag in.";
  else if (bedrag.waarde < 0) fouten.bedrag = "Een bedrag kan niet negatief zijn.";
  const datum = r.datum.trim();
  if (!datum) fouten.datum = "Vul de datum in.";
  else if (!geldigeDatum(datum)) fouten.datum = "Vul een geldige datum in.";
  if (!soort || "fout" in bedrag || bedrag.waarde === null || Object.keys(fouten).length > 0) return { ok: false, fouten };
  return {
    ok: true,
    waarde: { soort, leverancier: r.leverancier.trim() || null, omschrijving: r.omschrijving.trim() || null, bedrag: bedrag.waarde, datum },
  };
}

/** Kosten zijn ingevoerd incl. btw (zoals op de factuur); het resultaat is excl. btw, net als de omzet op het dashboard. */
export function resultaatPerWoning(omzetExBtw: number | null, kosten: { bedrag: number }[]): { kostenInclBtw: number; kostenExBtw: number; resultaatExBtw: number | null } {
  const kostenInclBtw = kosten.reduce((t, k) => t + k.bedrag, 0);
  const kostenExBtw = exBtw(kostenInclBtw);
  return { kostenInclBtw, kostenExBtw, resultaatExBtw: omzetExBtw === null ? null : omzetExBtw - kostenExBtw };
}

export type RuweDoelenInvoer = { jaar: string; maanden: string[] };

export function valideerDoelenInvoer(r: RuweDoelenInvoer): { ok: true; waarde: Doel[] } | { ok: false; fouten: Record<string, string> } {
  const fouten: Record<string, string> = {};
  const jaar = Number(r.jaar);
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) fouten.jaar = "Kies een jaar tussen 2000 en 2100.";
  else if (r.maanden.length !== 12) fouten.jaar = "Er horen twaalf maanden bij een jaar.";
  if (fouten.jaar) return { ok: false, fouten };
  const waarde: Doel[] = [];
  r.maanden.forEach((tekst, i) => {
    const b = leesBedrag(tekst);
    if ("fout" in b) fouten[`maand-${i + 1}`] = b.fout;
    else if (b.waarde !== null && b.waarde < 0) fouten[`maand-${i + 1}`] = "Een doel kan niet negatief zijn.";
    else waarde.push({ jaar, maand: i + 1, waarde: b.waarde ?? 0 });
  });
  return Object.keys(fouten).length > 0 ? { ok: false, fouten } : { ok: true, waarde };
}
