import { describe, expect, it } from "vitest";
import { berekenVerkoop } from "./rekenregels";
import { excelRijNaarVerkoop, type ExcelRij } from "./excel-import";

const leeg: ExcelRij = {
  rij: 2, makelaar: "Makelaar A", aandeel: 1, type: "Koop", adres: "Voorbeeldstraat 1",
  maandVerkocht: new Date(Date.UTC(2026, 0, 1)), maandPasseren: new Date(Date.UTC(2026, 2, 1)), passeerdatum: new Date(Date.UTC(2026, 2, 14)),
  nota: "V", verkoopprijs: 400000, afgesprokenCourtage: 0.013, opstartnota: 595, courtage: 5200,
};

describe("excelRijNaarVerkoop", () => {
  it("zet een gewone koopregel om", () => {
    const v = excelRijNaarVerkoop(leeg);
    expect(v).toEqual({
      importRij: 2, soort: "koop", adres: "Voorbeeldstraat 1", makelaar: "Makelaar A", aandeel: 1,
      verkoopdatum: "2026-01-01", omzetMaand: "2026-03-01", passeerdatum: "2026-03-14",
      verkoopprijs: 400000, courtage: { soort: "percentage", fractie: 0.013 }, opstartnota: 595, notaVerstuurd: true,
    });
  });

  it("neemt een handmatig ingevulde courtage over als vast bedrag, zodat de omzet gelijk blijft aan de Excel", () => {
    const v = excelRijNaarVerkoop({ ...leeg, courtage: 4500 });
    expect(v?.courtage).toEqual({ soort: "vast", bedrag: 4500 });
    expect(berekenVerkoop(v!).omzetTotaal).toBeCloseTo(5095, 2);
  });

  it("leest een afgesproken courtage van 1 of hoger als vast bedrag", () => {
    expect(excelRijNaarVerkoop({ ...leeg, afgesprokenCourtage: 2500, courtage: 2500 })?.courtage).toEqual({ soort: "vast", bedrag: 2500 });
  });

  it("taxatie: geen verkoopprijs en geen courtage", () => {
    const v = excelRijNaarVerkoop({ ...leeg, type: "Taxatie", verkoopprijs: null, afgesprokenCourtage: null, courtage: 0, opstartnota: 795 });
    expect(v?.soort).toBe("taxatie");
    expect(v?.courtage).toBeNull();
    expect(berekenVerkoop(v!).omzetTotaal).toBe(795);
  });

  it("verhuur zonder percentage: de ingevulde courtage is het bedrag", () => {
    const v = excelRijNaarVerkoop({ ...leeg, type: "Huur", verkoopprijs: 1475, afgesprokenCourtage: null, courtage: 1149.5, opstartnota: 0 });
    expect(v?.soort).toBe("huur");
    expect(v?.courtage).toEqual({ soort: "vast", bedrag: 1149.5 });
  });

  it("herkent de soorten uit de Excel, ook met afwijkende hoofdletters", () => {
    const soort = (type: string | null) => excelRijNaarVerkoop({ ...leeg, type })?.soort;
    expect(soort("Split")).toBe("split");
    expect(soort("Nieuw")).toBe("nieuwbouw");
    expect(soort("overig")).toBe("overig");
    expect(soort(" Koop ")).toBe("koop");
    expect(soort(null)).toBe("overig");
  });

  it("gebruikt standaardwaarden voor lege velden", () => {
    const v = excelRijNaarVerkoop({ ...leeg, aandeel: null, opstartnota: null, nota: null, makelaar: "  ", passeerdatum: null });
    expect(v).toMatchObject({ aandeel: 1, opstartnota: 0, notaVerstuurd: false, makelaar: "Onbekend", passeerdatum: null });
  });

  it("slaat regels zonder verkoopmaand en zonder passeermaand over", () => {
    expect(excelRijNaarVerkoop({ ...leeg, maandVerkocht: null, maandPasseren: null })).toBeNull();
  });

  it("zet de passeermaand altijd op de eerste van de maand", () => {
    expect(excelRijNaarVerkoop({ ...leeg, maandPasseren: new Date(Date.UTC(2026, 2, 17)) })?.omzetMaand).toBe("2026-03-01");
  });

  it("weigert een ongeldig aandeel met het rijnummer in de melding", () => {
    expect(() => excelRijNaarVerkoop({ ...leeg, rij: 77, aandeel: 1.5 })).toThrow(/rij 77/);
  });
});
