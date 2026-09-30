import { describe, expect, it } from "vitest";
import { berekenVerkoop, courtageBedrag, exBtw } from "./rekenregels";

// De verwachte uitkomsten komen uit de Excel "Lijst verkochte woningen" van C&R (tabblad "Verkocht woningen",
// kolommen J t/m Q). Alleen de getallen zijn overgenomen, geen adressen of namen.

describe("exBtw", () => {
  it("deelt door 1,21", () => {
    expect(exBtw(121)).toBeCloseTo(100, 6);
    expect(exBtw(6756.75)).toBeCloseTo(5584.090909, 5);
  });
});

describe("courtageBedrag", () => {
  it("rekent een percentage over de verkoopprijs", () => {
    expect(courtageBedrag({ verkoopprijs: 675675, courtage: { soort: "percentage", fractie: 0.01 } })).toBeCloseTo(6756.75, 6);
    expect(courtageBedrag({ verkoopprijs: 586000, courtage: { soort: "percentage", fractie: 0.008 } })).toBeCloseTo(4688, 6);
  });

  it("neemt een vaste courtage ongewijzigd over", () => {
    expect(courtageBedrag({ verkoopprijs: 205000, courtage: { soort: "vast", bedrag: 2500 } })).toBe(2500);
  });

  it("is nul als er geen courtage is afgesproken, zoals bij een taxatie", () => {
    expect(courtageBedrag({ verkoopprijs: null, courtage: null })).toBe(0);
  });

  it("weigert een percentage zonder verkoopprijs", () => {
    expect(() => courtageBedrag({ verkoopprijs: null, courtage: { soort: "percentage", fractie: 0.01 } })).toThrow(/verkoopprijs/);
  });

  it("weigert een percentage buiten 0 tot 1", () => {
    expect(() => courtageBedrag({ verkoopprijs: 100000, courtage: { soort: "percentage", fractie: 1.3 } })).toThrow(/fractie/);
  });
});

describe("berekenVerkoop", () => {
  it("koop zonder opstartnota, volledig aandeel (Excel rij 2)", () => {
    const r = berekenVerkoop({ verkoopprijs: 675675, courtage: { soort: "percentage", fractie: 0.01 }, opstartnota: 0, aandeel: 1 });
    expect(r.courtage).toBeCloseTo(6756.75, 2);
    expect(r.omzetTotaal).toBeCloseTo(6756.75, 2);
    expect(r.courtageExBtw).toBeCloseTo(5584.090909, 4);
    expect(r.omzetTotaalExBtw).toBeCloseTo(5584.090909, 4);
  });

  it("koop met opstartnota (Excel rij 3 en 4)", () => {
    const r3 = berekenVerkoop({ verkoopprijs: 586000, courtage: { soort: "percentage", fractie: 0.008 }, opstartnota: 400, aandeel: 1 });
    expect(r3.courtage).toBeCloseTo(4688, 2);
    expect(r3.omzetTotaal).toBeCloseTo(5088, 2);
    expect(r3.courtageExBtw).toBeCloseTo(3874.380165, 4);
    expect(r3.omzetTotaalExBtw).toBeCloseTo(4204.958678, 4);

    const r4 = berekenVerkoop({ verkoopprijs: 397500, courtage: { soort: "percentage", fractie: 0.01 }, opstartnota: 400, aandeel: 1 });
    expect(r4.omzetTotaal).toBeCloseTo(4375, 2);
    expect(r4.omzetTotaalExBtw).toBeCloseTo(3615.702479, 4);
  });

  it("gedeelde verkoop: het aandeel geldt voor opstartnota en courtage samen", () => {
    const r = berekenVerkoop({ verkoopprijs: 410000, courtage: { soort: "percentage", fractie: 0.013 }, opstartnota: 595, aandeel: 0.5 });
    expect(r.courtage).toBeCloseTo(5330, 2);
    expect(r.omzetTotaal).toBeCloseTo(2962.5, 2);
    expect(r.courtageExBtw).toBeCloseTo(4404.958678, 4);
    expect(r.omzetTotaalExBtw).toBeCloseTo(2448.347107, 4);
    expect(r.omzetExBtwZonderAandeel).toBeCloseTo(4896.694215, 4);

    const groot = berekenVerkoop({ verkoopprijs: 787500, courtage: { soort: "percentage", fractie: 0.015 }, opstartnota: 995, aandeel: 0.5 });
    expect(groot.omzetTotaal).toBeCloseTo(6403.75, 2);
    expect(groot.omzetTotaalExBtw).toBeCloseTo(5292.355372, 4);
    expect(groot.omzetExBtwZonderAandeel).toBeCloseTo(10584.71074, 3);
  });

  it("vaste courtage met opstartnota", () => {
    const r = berekenVerkoop({ verkoopprijs: 205000, courtage: { soort: "vast", bedrag: 2500 }, opstartnota: 500, aandeel: 1 });
    expect(r.omzetTotaal).toBe(3000);
    expect(r.courtageExBtw).toBeCloseTo(2066.115702, 4);
    expect(r.omzetTotaalExBtw).toBeCloseTo(2479.338843, 4);
  });

  it("taxatie: alleen een nota, geen verkoopprijs en geen courtage", () => {
    const r = berekenVerkoop({ verkoopprijs: null, courtage: null, opstartnota: 795, aandeel: 1 });
    expect(r.courtage).toBe(0);
    expect(r.omzetTotaal).toBe(795);
    expect(r.omzetTotaalExBtw).toBeCloseTo(657.0247934, 5);
  });

  it("verhuur: vaste courtage, geen opstartnota", () => {
    const r = berekenVerkoop({ verkoopprijs: 1475, courtage: { soort: "vast", bedrag: 1149.5 }, opstartnota: 0, aandeel: 1 });
    expect(r.omzetTotaal).toBeCloseTo(1149.5, 2);
    expect(r.omzetTotaalExBtw).toBeCloseTo(950, 4);
  });

  it("weigert een aandeel buiten 0 tot en met 1", () => {
    const basis = { verkoopprijs: 300000, courtage: { soort: "percentage", fractie: 0.01 } as const, opstartnota: 0 };
    expect(() => berekenVerkoop({ ...basis, aandeel: 0 })).toThrow(/aandeel/);
    expect(() => berekenVerkoop({ ...basis, aandeel: 1.5 })).toThrow(/aandeel/);
  });

  it("weigert negatieve bedragen", () => {
    expect(() => berekenVerkoop({ verkoopprijs: 300000, courtage: null, opstartnota: -1, aandeel: 1 })).toThrow(/opstartnota/);
  });
});
