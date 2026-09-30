import { describe, expect, it } from "vitest";
import { verkoopDashboard } from "./dashboard";
import type { VerkoopRegel } from "./excel-import";

const regel = (o: Partial<VerkoopRegel>): VerkoopRegel => ({
  soort: "koop", adres: null, makelaar: "A", aandeel: 1, verkoopdatum: null, omzetMaand: null, passeerdatum: null,
  verkoopprijs: 121000, courtage: { soort: "vast", bedrag: 1210 }, opstartnota: 0, notaVerstuurd: false, ...o,
});

// Elke standaardregel: courtage 1.210 incl. btw = 1.000 excl. btw.
const regels: VerkoopRegel[] = [
  regel({ verkoopdatum: "2026-01-10", omzetMaand: "2026-02-01" }),
  regel({ verkoopdatum: "2026-01-20", omzetMaand: "2026-03-01", makelaar: "B" }),
  regel({ soort: "split", aandeel: 0.5, verkoopdatum: "2026-02-05", omzetMaand: "2026-03-01" }),
  regel({ soort: "split", aandeel: 0.5, verkoopdatum: "2026-02-05", omzetMaand: "2026-03-01", makelaar: "B" }),
  regel({ soort: "taxatie", verkoopprijs: null, courtage: null, opstartnota: 605, verkoopdatum: "2026-02-11", omzetMaand: "2026-02-01" }),
  regel({ verkoopdatum: "2025-01-15", omzetMaand: "2025-02-01" }),
  regel({ verkoopdatum: "2025-12-15", omzetMaand: "2026-01-01" }),
  regel({ verkoopdatum: "2026-03-02", omzetMaand: null }),
];

const d = verkoopDashboard({ regels, doelen: [{ jaar: 2026, maand: 1, waarde: 1500 }, { jaar: 2026, maand: 2, waarde: 1500 }], jaar: 2026, totEnMetMaand: 3 });

describe("verkoopDashboard", () => {
  it("telt verkochte woningen per verkoopmaand; een gedeelde verkoop telt samen als één, een taxatie niet", () => {
    expect(d.verkochtPerMaand.ditJaar.slice(0, 4)).toEqual([2, 1, 1, null]);
    expect(d.verkochtPerMaand.vorigJaar[0]).toBe(1);
    expect(d.verkochtPerMaand.vorigJaar[11]).toBe(1);
  });

  it("telt omzet excl. btw in de maand van passeren, inclusief taxaties", () => {
    expect(d.omzetPerMaand.ditJaar[0]).toBeCloseTo(1000, 6);
    expect(d.omzetPerMaand.ditJaar[1]).toBeCloseTo(1500, 6);
    expect(d.omzetPerMaand.ditJaar[2]).toBeCloseTo(2000, 6);
    expect(d.omzetPerMaand.ditJaar[3]).toBeNull();
    expect(d.omzetPerMaand.vorigJaar[1]).toBeCloseTo(1000, 6);
  });

  it("geeft de doelstelling per maand, null waar geen doel is vastgelegd", () => {
    expect(d.omzetPerMaand.doel.slice(0, 3)).toEqual([1500, 1500, null]);
  });

  it("telt de omzet op verkoopmaand apart, zoals het Excel-tabblad 'Verkocht per maand'", () => {
    expect(d.verkochteOmzetPerMaand.ditJaar[0]).toBeCloseTo(2000, 6);
    expect(d.verkochteOmzetPerMaand.ditJaar[1]).toBeCloseTo(1500, 6);
    expect(d.verkochteOmzetPerMaand.ditJaar[2]).toBeCloseTo(1000, 6);
  });

  it("verdeelt omzet en aantallen per makelaar, gesorteerd op omzet", () => {
    expect(d.perMakelaar).toEqual([
      { naam: "A", omzetExBtw: expect.closeTo(3000, 6), verkocht: 2.5 },
      { naam: "B", omzetExBtw: expect.closeTo(1500, 6), verkocht: 1.5 },
    ]);
  });

  it("rekent de kerncijfers over dezelfde maanden in beide jaren", () => {
    expect(d.kern.verkocht).toBe(4);
    expect(d.kern.verkochtVorigJaar).toBe(1);
    expect(d.kern.omzet).toBeCloseTo(4500, 6);
    expect(d.kern.omzetVorigJaar).toBeCloseTo(1000, 6);
    expect(d.kern.doel).toBe(3000);
    expect(d.kern.nogZonderPasseermaand).toBe(1);
  });
});
