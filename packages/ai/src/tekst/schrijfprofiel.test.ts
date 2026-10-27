import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profielAnalyseBerichten, valideerSchrijfprofiel } from "./schrijfprofiel-validatie";
import type { Schrijfprofiel } from "./schrijfprofiel";

const map = new URL("../../fixtures/schrijfprofielen/voorbeeld/", import.meta.url);
const testprofiel = (): Schrijfprofiel => JSON.parse(readFileSync(new URL("profiel.json", map), "utf8"));
const voorbeeld = (naam: string) => readFileSync(new URL(naam, map), "utf8");

describe("valideerSchrijfprofiel", () => {
  it("accepteert het verzonnen testprofiel", () => {
    expect(valideerSchrijfprofiel(testprofiel())).toMatchObject({ geldig: true });
  });

  it("weigert een profiel dat niet aan het schema voldoet", () => {
    const zonderNaam: Partial<Schrijfprofiel> = testprofiel();
    delete zonderNaam.naam;
    const uitkomst = valideerSchrijfprofiel({ ...zonderNaam, kopstijl: "cursief" });
    expect(uitkomst.geldig).toBe(false);
    if (!uitkomst.geldig) expect(uitkomst.fouten).toEqual(expect.arrayContaining([expect.stringContaining("naam"), expect.stringContaining("kopstijl")]));
  });

  it("controleert de samenhang: bestaande vragen, unieke sleutels, elke vraag gebruikt, koppen en lengtes", () => {
    const p = testprofiel();
    p.vragenlijst.push({ ...p.vragenlijst[1]!, label: "Dubbel" });
    p.vragenlijst.push({ sleutel: "zolder", label: "Zolder", hint: "", volgorde: 9, verplicht: false });
    p.structuur.secties[0]!.invoer.push("garage");
    p.structuur.secties[1]!.standaardkop = "";
    p.lengte.appartement = { min: 500, max: 400 };
    p.vasteBlokken.push({ ...p.vasteBlokken[0]! });
    const uitkomst = valideerSchrijfprofiel(p);
    expect(uitkomst.geldig).toBe(false);
    if (!uitkomst.geldig)
      expect(uitkomst.fouten).toEqual([
        "vraag 'woonkamer' staat meer dan eens in de vragenlijst",
        "sectie 'wonen' verwijst naar onbekende vraag 'garage'",
        "sectie 'slapen' heeft geen standaardkop en geen vrije kop",
        "vraag 'zolder' wordt door geen enkele sectie gebruikt",
        "lengte voor appartement: minimum is groter dan maximum",
        "vast blok 'meetclausule' staat meer dan eens in het profiel",
      ]);
  });
});

describe("profielAnalyseBerichten (stub profielgenerator)", () => {
  const teksten = [
    { titel: "A", woningtype: "eengezinswoning" as const, tekst: voorbeeld("voorbeeld-eengezinswoning.md") },
    { titel: "B", woningtype: "appartement" as const, tekst: voorbeeld("voorbeeld-appartement.md") },
    { titel: "C", woningtype: "appartement" as const, tekst: voorbeeld("voorbeeld-appartement.md") },
  ];

  it("vraagt drie tot vijf teksten", () => {
    expect(() => profielAnalyseBerichten(teksten.slice(0, 2))).toThrow("drie tot vijf");
    expect(() => profielAnalyseBerichten([...teksten, ...teksten])).toThrow("drie tot vijf");
  });

  it("geeft een analyseprompt met alle teksten en de opdracht om vaste blokken letterlijk over te nemen", () => {
    const [systeem, gebruiker] = profielAnalyseBerichten(teksten);
    expect(systeem!.content).toContain("letterlijk");
    expect(systeem!.content).toContain("concept");
    expect(gebruiker!.content).toContain("<tekst titel=\"A\" woningtype=\"eengezinswoning\">");
    expect(gebruiker!.content).toContain("De vermelde maten zijn indicatief");
  });
});
