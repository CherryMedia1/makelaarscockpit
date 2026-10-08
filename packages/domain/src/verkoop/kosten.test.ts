import { describe, expect, it } from "vitest";
import { resultaatPerWoning, valideerDoelenInvoer, valideerKostenregelInvoer } from "./kosten";

describe("valideerKostenregelInvoer", () => {
  const geldig = { soort: "fotograaf", leverancier: "Fotostudio Voorbeeld", omschrijving: "", bedrag: "€ 250,00", datum: "2026-10-05" };

  it("zet een geldige kostenregel om", () => {
    expect(valideerKostenregelInvoer(geldig)).toEqual({
      ok: true,
      waarde: { soort: "fotograaf", leverancier: "Fotostudio Voorbeeld", omschrijving: null, bedrag: 250, datum: "2026-10-05" },
    });
  });

  it("eist soort, bedrag en datum en meldt alle fouten tegelijk", () => {
    expect(valideerKostenregelInvoer({ ...geldig, soort: "koffie", bedrag: "", datum: "5-10-2026" })).toEqual({
      ok: false,
      fouten: { soort: "Kies een soort.", bedrag: "Vul het bedrag in.", datum: "Vul een geldige datum in." },
    });
    expect(valideerKostenregelInvoer({ ...geldig, bedrag: "-5" })).toEqual({ ok: false, fouten: { bedrag: "Een bedrag kan niet negatief zijn." } });
    expect(valideerKostenregelInvoer({ ...geldig, bedrag: "abc" })).toEqual({ ok: false, fouten: { bedrag: "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50." } });
    expect(valideerKostenregelInvoer({ ...geldig, datum: "" })).toEqual({ ok: false, fouten: { datum: "Vul de datum in." } });
  });

  it("laat leverancier en omschrijving leeg als ze niet zijn ingevuld", () => {
    const r = valideerKostenregelInvoer({ ...geldig, leverancier: "  ", omschrijving: " Extra foto's " });
    expect(r.ok && r.waarde).toMatchObject({ leverancier: null, omschrijving: "Extra foto's" });
  });
});

describe("resultaatPerWoning", () => {
  it("trekt de kosten excl. btw af van de omzet excl. btw", () => {
    const r = resultaatPerWoning(5000, [{ bedrag: 121 }, { bedrag: 242 }]);
    expect(r.kostenInclBtw).toBe(363);
    expect(r.kostenExBtw).toBeCloseTo(300, 6);
    expect(r.resultaatExBtw).toBeCloseTo(4700, 6);
  });

  it("geeft null als de omzet nog niet bekend is", () => {
    expect(resultaatPerWoning(null, [{ bedrag: 121 }])).toEqual({ kostenInclBtw: 121, kostenExBtw: 100, resultaatExBtw: null });
  });
});

describe("valideerDoelenInvoer", () => {
  it("leest twaalf maandbedragen voor een jaar", () => {
    const r = valideerDoelenInvoer({ jaar: "2026", maanden: Array.from({ length: 12 }, () => "150.000") });
    expect(r.ok && r.waarde).toHaveLength(12);
    expect(r.ok && r.waarde[0]).toEqual({ jaar: 2026, maand: 1, waarde: 150000 });
    expect(r.ok && r.waarde[11]).toEqual({ jaar: 2026, maand: 12, waarde: 150000 });
  });

  it("neemt een lege maand als 0 en weigert negatieve of onleesbare bedragen", () => {
    const leeg = valideerDoelenInvoer({ jaar: "2026", maanden: Array.from({ length: 12 }, (_, i) => (i === 0 ? "" : "1")) });
    expect(leeg.ok && leeg.waarde[0]?.waarde).toBe(0);
    const fout = valideerDoelenInvoer({ jaar: "2026", maanden: Array.from({ length: 12 }, (_, i) => (i === 2 ? "-1" : i === 5 ? "x" : "1")) });
    expect(fout).toEqual({ ok: false, fouten: { "maand-3": "Een doel kan niet negatief zijn.", "maand-6": "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50." } });
  });

  it("controleert het jaar", () => {
    expect(valideerDoelenInvoer({ jaar: "1999", maanden: Array.from({ length: 12 }, () => "1") })).toEqual({ ok: false, fouten: { jaar: "Kies een jaar tussen 2000 en 2100." } });
    expect(valideerDoelenInvoer({ jaar: "2026", maanden: ["1"] })).toEqual({ ok: false, fouten: { jaar: "Er horen twaalf maanden bij een jaar." } });
  });
});
