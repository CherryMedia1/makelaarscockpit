import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BRONCONTROLE_PROMPT_VERSIE, bronnencontroleBerichten, bronnencontroleSchema, leesTekstuitvoer, naarBroncontroles, vervangSectie } from "./bronnencontrole";
import type { Tekstfeiten } from "./feiten";

const feiten: Tekstfeiten = {
  adres: "Proefstraat 1",
  plaats: "Testdorp",
  energielabel: null,
  woningcategorie: "eengezinswoning",
  bevestigd: [{ label: "Woning › Bouwjaar", waarde: "1978" }],
  steekwoorden: { woonkamer: "licht, tegelvloer" },
  weggelaten: [],
};
const inhoud = {
  inleiding: "Welkom aan de Proefstraat 1!",
  secties: [
    { sectie: "wonen", kop: "Wonen", tekst: "Een lichte woonkamer met open haard." },
    { sectie: "afsluiting", kop: "Interesse?", tekst: "Plan een bezichtiging." },
  ],
};

describe("bronnencontrole", () => {
  it("geeft de feiten en de tekst aan het controlemodel, met een eigen promptversie", () => {
    const [systeem, gebruiker] = bronnencontroleBerichten(feiten, inhoud);
    expect(systeem!.content).toContain("niet uit de feiten");
    expect(gebruiker!.content).toContain("- woonkamer: licht, tegelvloer");
    expect(gebruiker!.content).toContain("[wonen] Wonen\nEen lichte woonkamer met open haard.");
    expect(BRONCONTROLE_PROMPT_VERSIE).toBe("tekstcontrole-v1");
  });

  it("heeft een strikt schema met de onderdelen van deze tekst", () => {
    const v = new Ajv2020({ strict: false }).compile(bronnencontroleSchema(inhoud));
    expect(v({ beweringen: [{ onderdeel: "wonen", citaat: "open haard", toelichting: "Staat niet in de invoer." }] })).toBe(true);
    expect(v({ beweringen: [{ onderdeel: "zolder", citaat: "x", toelichting: "y" }] })).toBe(false);
  });

  it("zet beweringen om in controles, alleen als het citaat echt in de tekst staat", () => {
    expect(
      naarBroncontroles(inhoud, {
        beweringen: [
          { onderdeel: "wonen", citaat: "met open haard", toelichting: "Een open haard staat niet in de feiten." },
          { onderdeel: "wonen", citaat: "een sauna", toelichting: "Verzonnen door de controle zelf." },
          { onderdeel: "inleiding", citaat: "Proefstraat 1", toelichting: "x" },
        ],
      }),
    ).toEqual([
      { soort: "bron", sectie: "wonen", melding: "'met open haard': Een open haard staat niet in de feiten." },
      { soort: "bron", sectie: "inleiding", melding: "'Proefstraat 1': x" },
    ]);
  });
});

describe("leesTekstuitvoer", () => {
  it("accepteert uitvoer in de juiste vorm en weigert al het andere", () => {
    expect(leesTekstuitvoer({ ...inhoud, gebruikte_feiten: [], aannames: [] })).toEqual({ ...inhoud, gebruikte_feiten: [], aannames: [] });
    expect(leesTekstuitvoer({ inleiding: 1, secties: [] })).toBeNull();
    expect(leesTekstuitvoer({ inleiding: "x", secties: [{ sectie: "a" }] })).toBeNull();
    expect(leesTekstuitvoer(null)).toBeNull();
  });
});

describe("vervangSectie", () => {
  const nieuw = { inleiding: "Nieuwe inleiding.", secties: [{ sectie: "wonen", kop: "Wonen", tekst: "Nieuw." }, { sectie: "afsluiting", kop: "X", tekst: "Ander slot." }] };

  it("neemt alleen de gevraagde sectie over en laat de rest staan", () => {
    expect(vervangSectie(inhoud, nieuw, "wonen")).toEqual({ inleiding: inhoud.inleiding, secties: [{ sectie: "wonen", kop: "Wonen", tekst: "Nieuw." }, inhoud.secties[1]] });
  });

  it("vervangt de inleiding als die gevraagd is, en laat alles staan als de sectie ontbreekt in de nieuwe tekst", () => {
    expect(vervangSectie(inhoud, nieuw, "inleiding").inleiding).toBe("Nieuwe inleiding.");
    expect(vervangSectie(inhoud, { inleiding: "", secties: [] }, "wonen")).toEqual(inhoud);
  });
});
