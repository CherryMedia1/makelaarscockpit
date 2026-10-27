import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { haalPersoonsgegevensWeg, toegestaneSecties, verzamelFeiten } from "./feiten";
import { tekstBerichten, TEKST_PROMPT_VERSIE } from "./prompt";
import { renderTekst, tekstUitvoerSchema } from "./render";
import type { Schrijfprofiel } from "./schrijfprofiel";

const map = new URL("../../fixtures/schrijfprofielen/voorbeeld/", import.meta.url);
const profiel = (): Schrijfprofiel => JSON.parse(readFileSync(new URL("profiel.json", map), "utf8"));
const voorbeeld = readFileSync(new URL("voorbeeld-eengezinswoning.md", map), "utf8");

const rij = (pad: string, waarde: unknown, status: "voorstel" | "bevestigd" | "conflict" | "afgewezen" = "bevestigd") => ({ pad, waarde, status });

describe("haalPersoonsgegevensWeg", () => {
  it("haalt e-mailadressen en telefoonnummers weg, maar laat jaartallen en maten staan", () => {
    expect(haalPersoonsgegevensWeg("bel 0165-123456 of mail jan@voorbeeld.nl; tuin 60 m2, uit 1978, +31 6 12345678")).toEqual({
      tekst: "bel [weggelaten] of mail [weggelaten]; tuin 60 m2, uit 1978, [weggelaten]",
      weggelaten: ["telefoon", "e-mail", "telefoon"],
    });
  });
});

describe("verzamelFeiten", () => {
  const feiten = verzamelFeiten({
    woning: { adres: "Proefstraat 1", plaats: "Testdorp", energieklasse: "B" },
    velden: [
      rij("object.woningtype", "appartement"),
      rij("object.bouwjaar", 1978),
      rij("installaties.cv.merk", "Remeha", "voorstel"),
      rij("installaties.isolatie.dak", true),
      rij("planning.huisdieren", "kat"),
      rij("gebreken.asbest", "nee"),
      rij("zaken.mee_te_nemen[0]", "lamp"),
    ],
    steekwoorden: { woonkamer: "  licht, open haard ", keuken: "", onbekend: "x", overig: "info via 06-12345678" },
    profiel: profiel(),
  });

  it("neemt alleen bevestigde woningkenmerken mee, zonder planning, gebreken en lijst van zaken", () => {
    expect(feiten.bevestigd).toEqual([
      { label: "Woning › Bouwjaar", waarde: "1978" },
      { label: "Woning › Woningtype", waarde: "appartement" },
      { label: "Installaties › Isolatie › Dak", waarde: "ja" },
    ]);
  });

  it("neemt adres, plaats en energielabel uit de woning en leidt de categorie af uit het woningtype", () => {
    expect(feiten).toMatchObject({ adres: "Proefstraat 1", plaats: "Testdorp", energielabel: "B", woningcategorie: "appartement" });
  });

  it("houdt alleen ingevulde steekwoorden van vragen uit het profiel, zonder persoonsgegevens", () => {
    expect(feiten.steekwoorden).toEqual({ woonkamer: "licht, open haard", overig: "info via [weggelaten]" });
    expect(feiten.weggelaten).toEqual([{ vraag: "overig", soort: "telefoon" }]);
  });

  it("valt terug op eengezinswoning, of op de keuze van de medewerker", () => {
    const basis = { woning: { adres: null, plaats: null, energieklasse: null }, velden: [], steekwoorden: {}, profiel: profiel() };
    expect(verzamelFeiten(basis).woningcategorie).toBe("eengezinswoning");
    expect(verzamelFeiten({ ...basis, velden: [rij("object.woningtype", "vrijstaand")] }).woningcategorie).toBe("vrijstaand");
    expect(verzamelFeiten({ ...basis, categorie: "vrijstaand" }).woningcategorie).toBe("vrijstaand");
  });
});

describe("toegestaneSecties", () => {
  it("geeft de secties met ingevulde steekwoorden plus de secties die altijd mogen", () => {
    expect(toegestaneSecties(profiel(), { woonkamer: "licht", adres_ligging: "rustig" })).toEqual(["wonen", "omgeving", "afsluiting"]);
  });
});

describe("tekstBerichten", () => {
  const p = profiel();
  const feiten = verzamelFeiten({ woning: { adres: "Proefstraat 1", plaats: "Testdorp", energieklasse: null }, velden: [rij("object.bouwjaar", 1978)], steekwoorden: { woonkamer: "licht", adres_ligging: "rustig, park" }, profiel: p });
  const [systeem, gebruiker] = tekstBerichten(p, feiten, [{ titel: "Voorbeeld A", tekst: voorbeeld }]);

  it("zet de profielregels, de lengte voor de categorie en de voorbeelden in het systeembericht", () => {
    expect(systeem!.content).toContain("Verzin geen kenmerken");
    expect(systeem!.content).toContain("Zakelijk en helder.");
    expect(systeem!.content).toContain("tussen 350 en 550 woorden");
    expect(systeem!.content).toContain("'Wonen in Testdorp'");
    expect(systeem!.content).toContain(`<voorbeeld titel="Voorbeeld A">`);
    expect(systeem!.content).toContain("aanspreekvorm: u");
    // Vaste blokken voegt de code toe; ook uit de voorbeelden gehaald, zodat het model ze niet zelf gaat schrijven.
    expect(systeem!.content).not.toContain("De vermelde maten zijn indicatief");
  });

  it("zet de feiten en steekwoorden in het gebruikersbericht en noemt welke secties mogen", () => {
    expect(gebruiker!.content).toContain("Adres: Proefstraat 1");
    expect(gebruiker!.content).toContain("- Woning › Bouwjaar: 1978");
    expect(gebruiker!.content).toContain("Woonkamer: licht");
    expect(gebruiker!.content).toContain("Secties: wonen, omgeving, afsluiting");
  });

  it("vraagt bij opnieuw schrijven van één sectie alleen die sectie, met de huidige tekst als context", () => {
    const huidig = { inleiding: "Welkom.", secties: [{ sectie: "wonen", kop: "Wonen", tekst: "Oud." }] };
    const [, g] = tekstBerichten(p, feiten, [], { sectie: "wonen", huidig });
    expect(g!.content).toContain("Schrijf alleen de sectie 'wonen' opnieuw");
    expect(g!.content).toContain("Oud.");
  });

  it("heeft een promptversie", () => {
    expect(TEKST_PROMPT_VERSIE).toBe("tekst-v1");
  });
});

describe("tekstUitvoerSchema", () => {
  it("staat alleen de toegestane secties toe en voldoet aan strikte modus", () => {
    const schema = tekstUitvoerSchema(["wonen", "afsluiting"]);
    const v = new Ajv2020({ strict: false }).compile(schema);
    expect(v({ inleiding: "x", secties: [{ sectie: "wonen", kop: "Wonen", tekst: "y" }], gebruikte_feiten: [], aannames: [] })).toBe(true);
    expect(v({ inleiding: "x", secties: [{ sectie: "zolder", kop: "Z", tekst: "y" }], gebruikte_feiten: [], aannames: [] })).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("minItems");
  });
});

describe("renderTekst", () => {
  const inhoud = {
    inleiding: "Welkom aan de Proefstraat 1.",
    secties: [
      { sectie: "slapen", kop: "## **Slapen**", tekst: "Drie kamers." },
      { sectie: "wonen", kop: "Wonen en koken", tekst: "Licht.\n\nRuim." },
      { sectie: "zolder", kop: "Zolder", tekst: "Bestaat niet." },
    ],
  };

  it("zet secties in de volgorde van het profiel, haalt opmaaktekens uit koppen, laat onbekende secties weg en voegt vaste blokken toe", () => {
    expect(renderTekst(profiel(), inhoud)).toEqual({
      inhoud: { inleiding: "Welkom aan de Proefstraat 1.", secties: [{ sectie: "wonen", kop: "Wonen en koken", tekst: "Licht.\n\nRuim." }, { sectie: "slapen", kop: "Slapen", tekst: "Drie kamers." }] },
      tekst: "Welkom aan de Proefstraat 1.\n\nWonen en koken\nLicht.\n\nRuim.\n\nSlapen\nDrie kamers.\n\nDe vermelde maten zijn indicatief en ontleend aan de meetinstructie.",
    });
  });

  it("zet koppen in hoofdletters en een label boven de inleiding als het profiel dat vraagt", () => {
    const p = { ...profiel(), kopstijl: "hoofdletters" as const, inleidingLabel: "Omschrijving" };
    expect(renderTekst(p, inhoud).tekst.split("\n").slice(0, 4)).toEqual(["Omschrijving", "Welkom aan de Proefstraat 1.", "", "WONEN EN KOKEN"]);
  });
});
