import { describe, expect, it } from "vitest";
import { controleerTekst, telWoorden, type TekstVoorControle } from "./controles";

const secties = [
  { sleutel: "wonen", invoer: ["woonkamer", "keuken"], standaardkop: "Wonen & Koken", varianten: ["Wonen, Koken & Genieten"], vrijeKop: false },
  { sleutel: "buiten", invoer: ["buitenruimte"], standaardkop: "Tuinieren, Zonnen & Genieten", varianten: [], vrijeKop: false },
  { sleutel: "omgeving", invoer: ["adres_ligging"], standaardkop: "Wonen in {plaats}", varianten: [], vrijeKop: true },
  { sleutel: "afsluiting", invoer: [], standaardkop: "Zie Jij Jezelf Hier Al Wonen?", varianten: [], vrijeKop: false },
];

const woorden = (n: number) => Array.from({ length: n }, () => "woord").join(" ");

const goed = (): TekstVoorControle => ({
  secties,
  ingevuld: ["woonkamer", "buitenruimte", "adres_ligging"],
  adres: "Proefstraat 1",
  plaats: "Testdorp",
  lengte: { min: 50, max: 400 },
  inhoud: {
    inleiding: "Welkom aan de Proefstraat 1 in Testdorp! Plan snel die bezichtiging in.",
    secties: [
      { sectie: "wonen", kop: "Wonen & Koken", tekst: woorden(60) },
      { sectie: "buiten", kop: "tuinieren, zonnen & genieten", tekst: "Een zonnige tuin." },
      { sectie: "omgeving", kop: "Groen wonen in Testdorp", tekst: "Rustig gelegen." },
      { sectie: "afsluiting", kop: "Zie Jij Jezelf Hier Al Wonen?", tekst: "Plan dan snel een bezichtiging in!" },
    ],
  },
});

describe("telWoorden", () => {
  it("telt woorden, ook met leestekens en meerdere spaties", () => {
    expect(telWoorden("Wauw! Wat een  tuin, én een schuur.")).toBe(7);
    expect(telWoorden("")).toBe(0);
  });
});

describe("controleerTekst", () => {
  it("vindt niets bij een tekst die aan het profiel voldoet; een kop vergelijken gaat zonder hoofdletters", () => {
    expect(controleerTekst(goed())).toEqual([]);
  });

  it("meldt een kop buiten de toegestane lijst, maar niet bij een sectie met vrije kop", () => {
    const t = goed();
    t.inhoud.secties[0]!.kop = "Leven & Lachen";
    t.inhoud.secties[2]!.kop = "Iets heel anders";
    expect(controleerTekst(t)).toEqual([{ soort: "kop", sectie: "wonen", melding: "De kop 'Leven & Lachen' staat niet in het profiel; toegestaan: Wonen & Koken, Wonen, Koken & Genieten." }]);
  });

  it("meldt een sectie zonder invoer en een onbekende sectie", () => {
    const t = goed();
    t.ingevuld = ["woonkamer", "adres_ligging"];
    t.inhoud.secties.splice(3, 0, { sectie: "zolder", kop: "Zolder", tekst: "x" });
    expect(controleerTekst(t).map((c) => [c.soort, c.sectie])).toEqual([["sectie-zonder-invoer", "buiten"], ["onbekende-sectie", "zolder"]]);
  });

  it("controleert adres en uitnodiging in de inleiding, en een uitnodiging aan het eind", () => {
    const t = goed();
    t.inhoud.inleiding = "Een prachtige woning in Testdorp.";
    t.inhoud.secties[3]!.tekst = "Tot ziens.";
    expect(controleerTekst(t).map((c) => c.soort)).toEqual(["inleiding-adres", "inleiding-uitnodiging", "afsluiting-uitnodiging"]);
  });

  it("meldt een lengte buiten de bandbreedte met het aantal woorden", () => {
    const t = goed();
    t.lengte = { min: 500, max: 650 };
    expect(controleerTekst(t)).toEqual([{ soort: "lengte", melding: expect.stringMatching(/^De tekst telt \d+ woorden; het profiel vraagt 500 tot 650\.$/) }]);
  });

  it("meldt als de plaats nergens in de tekst staat", () => {
    const t = goed();
    t.plaats = "Roosendaal";
    expect(controleerTekst(t).map((c) => c.soort)).toContain("plaats");
  });
});
