import { describe, expect, it } from "vitest";
import { leesBedrag, leesPercentage, valideerVerkoopInvoer, type RuweVerkoopInvoer } from "./invoer";

describe("leesBedrag", () => {
  it("leest Nederlandse notatie, met of zonder euroteken en duizendtallen", () => {
    expect(leesBedrag("€ 2.500,50")).toEqual({ waarde: 2500.5 });
    expect(leesBedrag("2500")).toEqual({ waarde: 2500 });
    expect(leesBedrag("2.500")).toEqual({ waarde: 2500 });
    expect(leesBedrag("-500")).toEqual({ waarde: -500 });
    expect(leesBedrag(" 395000,00 ")).toEqual({ waarde: 395000 });
    expect(leesBedrag("1.234.567,89")).toEqual({ waarde: 1234567.89 });
  });

  it("accepteert een punt als decimaalteken als er geen komma is en hoogstens twee cijfers volgen", () => {
    expect(leesBedrag("2500.50")).toEqual({ waarde: 2500.5 });
    expect(leesBedrag("0.5")).toEqual({ waarde: 0.5 });
  });

  it("geeft null voor een lege invoer en een fout voor onzin", () => {
    expect(leesBedrag("")).toEqual({ waarde: null });
    expect(leesBedrag("   ")).toEqual({ waarde: null });
    expect(leesBedrag("abc")).toEqual({ fout: "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50." });
    expect(leesBedrag("1,2,3")).toEqual({ fout: "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50." });
  });
});

describe("leesPercentage", () => {
  it("leest een percentage als fractie", () => {
    expect(leesPercentage("1,3")).toEqual({ waarde: 0.013 });
    expect(leesPercentage("1.3%")).toEqual({ waarde: 0.013 });
    expect(leesPercentage(" 1,25 % ")).toEqual({ waarde: 0.0125 });
    expect(leesPercentage("")).toEqual({ waarde: null });
    expect(leesPercentage("x")).toEqual({ fout: "Vul een percentage in, bijvoorbeeld 1,3." });
  });
});

const geldig: RuweVerkoopInvoer = {
  soort: "koop",
  adres: "Voorbeeldstraat 12, Roosendaal",
  verkoopdatum: "2026-10-17",
  passeerdatum: "2026-11-25",
  omzetMaand: "2026-11",
  verkoopprijs: "395.000",
  courtageSoort: "percentage",
  courtagePercentage: "1,3",
  courtageBedrag: "",
  opstartnota: "595",
  notaVerstuurd: true,
  verdeling: [{ medewerkerId: "m1", makelaar: "Sam van Voorbeeld", aandeel: "100" }],
};

describe("valideerVerkoopInvoer", () => {
  it("zet een geldige invoer om naar een verkoopregel met verdeling", () => {
    const r = valideerVerkoopInvoer(geldig);
    expect(r).toEqual({
      ok: true,
      waarde: {
        soort: "koop",
        adres: "Voorbeeldstraat 12, Roosendaal",
        verkoopdatum: "2026-10-17",
        passeerdatum: "2026-11-25",
        omzetMaand: "2026-11-01",
        verkoopprijs: 395000,
        courtage: { soort: "percentage", fractie: 0.013 },
        opstartnota: 595,
        notaVerstuurd: true,
        verdeling: [{ medewerkerId: "m1", makelaar: "Sam van Voorbeeld", aandeel: 1 }],
      },
    });
  });

  it("leidt de omzetmaand af van de passeerdatum als die niet apart is ingevuld", () => {
    const r = valideerVerkoopInvoer({ ...geldig, omzetMaand: "" });
    expect(r.ok && r.waarde.omzetMaand).toBe("2026-11-01");
    const zonder = valideerVerkoopInvoer({ ...geldig, omzetMaand: "", passeerdatum: "" });
    expect(zonder.ok && zonder.waarde.omzetMaand).toBeNull();
    expect(zonder.ok && zonder.waarde.passeerdatum).toBeNull();
  });

  it("verdeelt een gedeelde verkoop en eist dat de aandelen samen 100% zijn", () => {
    const r = valideerVerkoopInvoer({
      ...geldig,
      verdeling: [
        { medewerkerId: "m1", makelaar: "A", aandeel: "50" },
        { medewerkerId: "m2", makelaar: "B", aandeel: "50" },
      ],
    });
    expect(r.ok && r.waarde.verdeling.map((v) => v.aandeel)).toEqual([0.5, 0.5]);
    const fout = valideerVerkoopInvoer({ ...geldig, verdeling: [{ medewerkerId: "m1", makelaar: "A", aandeel: "60" }, { medewerkerId: "m2", makelaar: "B", aandeel: "50" }] });
    expect(fout).toEqual({ ok: false, fouten: { verdeling: "De aandelen zijn samen 110%; dat moet 100% zijn." } });
  });

  it("slaat lege verdelingsregels over en eist minstens één makelaar", () => {
    const r = valideerVerkoopInvoer({ ...geldig, verdeling: [{ medewerkerId: "m1", makelaar: "A", aandeel: "100" }, { medewerkerId: "", makelaar: "", aandeel: "" }] });
    expect(r.ok && r.waarde.verdeling).toHaveLength(1);
    expect(valideerVerkoopInvoer({ ...geldig, verdeling: [] })).toEqual({ ok: false, fouten: { verdeling: "Kies minstens één makelaar." } });
    expect(valideerVerkoopInvoer({ ...geldig, verdeling: [{ medewerkerId: "m1", makelaar: "A", aandeel: "0" }] })).toEqual({
      ok: false,
      fouten: { verdeling: "Elk aandeel moet groter dan 0 zijn." },
    });
  });

  it("courtage: vast bedrag, geen courtage, of percentage met verkoopprijs", () => {
    const vast = valideerVerkoopInvoer({ ...geldig, courtageSoort: "vast", courtageBedrag: "2.500" });
    expect(vast.ok && vast.waarde.courtage).toEqual({ soort: "vast", bedrag: 2500 });
    const geen = valideerVerkoopInvoer({ ...geldig, soort: "taxatie", courtageSoort: "geen", verkoopprijs: "", opstartnota: "795" });
    expect(geen.ok && geen.waarde.courtage).toBeNull();
    expect(geen.ok && geen.waarde.verkoopprijs).toBeNull();
    expect(valideerVerkoopInvoer({ ...geldig, courtagePercentage: "" })).toEqual({ ok: false, fouten: { courtagePercentage: "Vul het afgesproken percentage in." } });
    expect(valideerVerkoopInvoer({ ...geldig, courtagePercentage: "150" })).toEqual({ ok: false, fouten: { courtagePercentage: "Een percentage ligt tussen 0 en 100." } });
    expect(valideerVerkoopInvoer({ ...geldig, verkoopprijs: "" })).toEqual({ ok: false, fouten: { verkoopprijs: "Een courtagepercentage heeft een verkoopprijs nodig." } });
    expect(valideerVerkoopInvoer({ ...geldig, courtageSoort: "vast", courtageBedrag: "" })).toEqual({ ok: false, fouten: { courtageBedrag: "Vul het courtagebedrag in." } });
    expect(valideerVerkoopInvoer({ ...geldig, courtageSoort: "vast", courtageBedrag: "-10" })).toEqual({ ok: false, fouten: { courtageBedrag: "Een courtagebedrag kan niet negatief zijn." } });
  });

  it("staat een negatieve opstartnota toe (verrekening) en gebruikt 0 bij een lege", () => {
    expect(valideerVerkoopInvoer({ ...geldig, opstartnota: "-500" }).ok).toBe(true);
    const leeg = valideerVerkoopInvoer({ ...geldig, opstartnota: "" });
    expect(leeg.ok && leeg.waarde.opstartnota).toBe(0);
  });

  it("controleert soort, datums en prijs en meldt alle fouten tegelijk", () => {
    const r = valideerVerkoopInvoer({ ...geldig, soort: "villa", verkoopdatum: "17-10-2026", passeerdatum: "2026-13-01", verkoopprijs: "-1", opstartnota: "abc" });
    expect(r).toEqual({
      ok: false,
      fouten: {
        soort: "Kies een soort.",
        verkoopdatum: "Vul een geldige datum in.",
        passeerdatum: "Vul een geldige datum in.",
        verkoopprijs: "Een verkoopprijs kan niet negatief zijn.",
        opstartnota: "Vul een bedrag in, bijvoorbeeld 2.500 of 2500,50.",
      },
    });
  });

  it("eist een verkoopdatum en een adres", () => {
    expect(valideerVerkoopInvoer({ ...geldig, verkoopdatum: "" })).toEqual({ ok: false, fouten: { verkoopdatum: "Vul de verkoopdatum in." } });
    expect(valideerVerkoopInvoer({ ...geldig, adres: "  " })).toEqual({ ok: false, fouten: { adres: "Vul een adres of omschrijving in." } });
  });
});
