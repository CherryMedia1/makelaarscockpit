import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { bladen, extractieSchema, naarVeldvoorstellen, profielUitVelden, valideerProfiel, type JsonSchema } from "./schema";

const fixture = (naam: string): unknown => JSON.parse(readFileSync(new URL(`../../fixtures/intake/dossier-01/${naam}`, import.meta.url), "utf8"));
const bewijs = (citaat: string) => ({ citaat, tijdstempel: "00:01:00", pagina: null });

describe("gegenereerde types", () => {
  it("zijn actueel ten opzichte van het schema", () => {
    expect(() => execFileSync("node", [new URL("../../scripts/genereer-types.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});

describe("valideerProfiel", () => {
  it("accepteert de ingevulde checklist", () => {
    expect(valideerProfiel(fixture("checklist.json"))).toMatchObject({ geldig: true });
  });

  it("weigert een onbekend woningtype, een negatieve oppervlakte en onbekende velden", () => {
    const uitkomst = valideerProfiel({ object: { woningtype: "villa", woonoppervlakte_m2: -1 }, burgerlijke_staat: "gescheiden" });
    expect(uitkomst.geldig).toBe(false);
    if (!uitkomst.geldig) expect(uitkomst.fouten).toHaveLength(3);
  });
});

describe("bladen", () => {
  it("geeft elk bladveld met pad en groep, met [] voor lijsten", () => {
    const paden = bladen().map((b) => b.pad);
    expect(paden).toContain("installaties.cv.merk");
    expect(paden).toContain("keuken.apparatuur[].merk");
    expect(paden).toContain("indeling[].ruimtes[].omschrijving");
    expect(paden).toContain("verkoopargumenten[]");
    expect(bladen().find((b) => b.pad === "zaken.mee_te_nemen[]")?.groep).toBe("zaken");
  });
});

describe("extractieSchema", () => {
  const schema = extractieSchema();
  const objecten = (s: JsonSchema): JsonSchema[] => [
    ...(s.type === "object" ? [s] : []),
    ...Object.values(s.properties ?? {}).flatMap(objecten),
    ...(s.items ? objecten(s.items) : []),
    ...(s.anyOf ?? []).flatMap(objecten),
  ];

  it("voldoet aan strikte modus: elk object heeft alle eigenschappen verplicht en geen extra eigenschappen", () => {
    for (const o of objecten(schema)) {
      expect(o.additionalProperties).toBe(false);
      expect(o.required).toEqual(Object.keys(o.properties ?? {}));
    }
  });

  it("bevat geen minimum of maximum (die controleert valideerProfiel achteraf)", () => {
    expect(JSON.stringify(schema)).not.toMatch(/"minimum"|"maximum"/);
  });

  it("past op het opgenomen modelantwoord in de fixture", () => {
    const valideer = new Ajv2020({ strict: false }).compile(schema);
    expect(valideer(fixture("extractie.json")), JSON.stringify(valideer.errors)).toBe(true);
  });
});

describe("naarVeldvoorstellen", () => {
  it("zet het modelantwoord om in voorstellen met concrete paden en slaat lege bladen over", () => {
    const { voorstellen, weggegooid } = naarVeldvoorstellen(fixture("extractie.json"));
    expect(weggegooid).toEqual([]);
    expect(voorstellen.find((v) => v.pad === "keuken.apparatuur[1].soort")?.waarde).toBe("vaatwasser");
    expect(voorstellen.find((v) => v.pad === "sanitair[0].voorzieningen[1]")?.waarde).toBe("zwevend toilet");
    expect(voorstellen.find((v) => v.pad === "installaties.cv.merk")).toEqual({ pad: "installaties.cv.merk", waarde: "Remeha", bewijs: { citaat: "We hebben een Remeha Tzerra uit 2019", tijdstempel: "00:01:05", pagina: null }, zekerheid: 0.9 });
    expect(voorstellen.some((v) => v.pad === "object.woonoppervlakte_m2")).toBe(false);
  });

  it("gooit bladen zonder citaat of met een ongeldige waarde weg en meldt alleen het pad", () => {
    const { voorstellen, weggegooid } = naarVeldvoorstellen({
      object: {
        bouwjaar: { waarde: 3000, bewijs: bewijs("gebouwd in 3000"), zekerheid: 0.9 },
        woningtype: { waarde: "villa", bewijs: bewijs("een villa"), zekerheid: 0.9 },
        perceel_m2: { waarde: 200, bewijs: bewijs("  "), zekerheid: 0.9 },
        aantal_kamers: { waarde: 4, bewijs: bewijs("vier kamers"), zekerheid: 1.4 },
      },
    });
    expect(weggegooid).toEqual([
      { pad: "object.bouwjaar", reden: "ongeldige waarde" },
      { pad: "object.woningtype", reden: "ongeldige waarde" },
      { pad: "object.perceel_m2", reden: "geen bewijs" },
    ]);
    expect(voorstellen).toEqual([{ pad: "object.aantal_kamers", waarde: 4, bewijs: bewijs("vier kamers"), zekerheid: 1 }]);
  });
});

describe("profielUitVelden", () => {
  it("bouwt uit de voorstellen weer een geldig profiel", () => {
    const profiel = profielUitVelden(naarVeldvoorstellen(fixture("extractie.json")).voorstellen);
    expect(valideerProfiel(profiel)).toMatchObject({ geldig: true });
    expect(profiel.keuken?.apparatuur?.[0]).toEqual({ soort: "inductiekookplaat", merk: "Bosch", staat: "goed" });
    expect(profiel.verkoopargumenten).toEqual(["het licht in de woonkamer", "ligging aan het park"]);
  });

  it("maakt lijsten met gaten aaneengesloten", () => {
    expect(profielUitVelden([{ pad: "onderhoud[2].wat", waarde: "dak" }, { pad: "onderhoud[2].jaar", waarde: 2015 }])).toEqual({ onderhoud: [{ wat: "dak", jaar: 2015 }] });
  });
});
