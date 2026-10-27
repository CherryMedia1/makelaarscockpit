import { describe, expect, it } from "vitest";
import { checklistFormulier, leesChecklistFormulier } from "./formulier";

const veld = (groepen: ReturnType<typeof checklistFormulier>, pad: string) => groepen.flatMap((g) => g.velden).find((v) => v.pad === pad);

describe("checklistFormulier", () => {
  const groepen = checklistFormulier([]);

  it("maakt een groep per onderdeel van het profiel, zonder de indeling (die komt uit gesprek en meetrapport)", () => {
    expect(groepen.map((g) => g.sleutel)).toEqual(["object", "installaties", "keuken", "sanitair", "onderhoud", "verkoopargumenten", "zaken", "planning"]);
    expect(groepen[0]!.titel).toBe("Woning");
  });

  it("kiest per veld het soort invoer uit het schema", () => {
    expect(veld(groepen, "object.woonoppervlakte_m2")).toMatchObject({ label: "Woonoppervlakte (m²)", soort: "getal", hint: "Gebruiksoppervlakte wonen in m²." });
    expect(veld(groepen, "object.bouwjaar")).toMatchObject({ soort: "geheel" });
    expect(veld(groepen, "object.woningtype")).toMatchObject({ soort: "keuze", opties: expect.arrayContaining(["hoekwoning", "appartement"]) });
    expect(veld(groepen, "installaties.isolatie.dak")).toMatchObject({ soort: "janee", sectie: "Isolatie" });
    expect(veld(groepen, "installaties.cv.merk")).toMatchObject({ soort: "tekst", sectie: "Cv-ketel" });
    expect(veld(groepen, "verkoopargumenten")).toMatchObject({ soort: "regels" });
    expect(veld(groepen, "zaken.mee_te_nemen")).toMatchObject({ soort: "regels", label: "Mee te nemen" });
  });

  it("geeft lijsten met items één lege rij om aan te vullen", () => {
    expect(veld(groepen, "keuken.apparatuur[0].merk")).toMatchObject({ sectie: "Apparatuur 1" });
    expect(veld(groepen, "keuken.apparatuur[1].merk")).toBeUndefined();
    expect(veld(groepen, "sanitair[0].voorzieningen")).toMatchObject({ soort: "regels", sectie: "Sanitair 1" });
  });

  it("vult bestaande waarden in en zet een lege rij achter de bestaande rijen", () => {
    const gevuld = checklistFormulier([
      { pad: "object.bouwjaar", waarde: 1978 },
      { pad: "installaties.isolatie.dak", waarde: true },
      { pad: "keuken.apparatuur[0].soort", waarde: "vaatwasser" },
      { pad: "keuken.apparatuur[1].soort", waarde: "koelkast" },
      { pad: "verkoopargumenten[0]", waarde: "licht" },
      { pad: "verkoopargumenten[1]", waarde: "tuin" },
    ]);
    expect(veld(gevuld, "object.bouwjaar")?.waarde).toBe("1978");
    expect(veld(gevuld, "installaties.isolatie.dak")?.waarde).toBe("ja");
    expect(veld(gevuld, "keuken.apparatuur[1].soort")?.waarde).toBe("koelkast");
    expect(veld(gevuld, "keuken.apparatuur[2].soort")).toMatchObject({ waarde: "", sectie: "Apparatuur 3" });
    expect(veld(gevuld, "verkoopargumenten")?.waarde).toBe("licht\ntuin");
  });
});

describe("leesChecklistFormulier", () => {
  it("zet invoer om naar waarden van het juiste type en slaat lege velden over", () => {
    const { velden, fouten } = leesChecklistFormulier([
      ["object.woonoppervlakte_m2", "121,5"],
      ["object.bouwjaar", " 1978 "],
      ["object.woningtype", "hoekwoning"],
      ["object.ligging", ""],
      ["installaties.isolatie.dak", "ja"],
      ["installaties.isolatie.gevel", "nee"],
      ["installaties.isolatie.vloer", ""],
      ["keuken.apparatuur[2].merk", "Bosch"],
      ["verkoopargumenten", "het licht\n\n  de tuin  \n"],
      ["$ACTION_ID_abc", ""],
      ["onbekend.veld", "x"],
    ]);
    expect(fouten).toEqual([]);
    expect(velden).toEqual([
      { pad: "object.woonoppervlakte_m2", waarde: 121.5 },
      { pad: "object.bouwjaar", waarde: 1978 },
      { pad: "object.woningtype", waarde: "hoekwoning" },
      { pad: "installaties.isolatie.dak", waarde: true },
      { pad: "installaties.isolatie.gevel", waarde: false },
      { pad: "keuken.apparatuur[2].merk", waarde: "Bosch" },
      { pad: "verkoopargumenten[0]", waarde: "het licht" },
      { pad: "verkoopargumenten[1]", waarde: "de tuin" },
    ]);
  });

  it("geeft per veld een foutmelding bij ongeldige invoer", () => {
    const { velden, fouten } = leesChecklistFormulier([
      ["object.woonoppervlakte_m2", "groot"],
      ["object.aantal_kamers", "4,5"],
      ["object.bouwjaar", "3000"],
      ["object.woningtype", "villa"],
    ]);
    expect(velden).toEqual([]);
    expect(fouten).toEqual([
      { pad: "object.woonoppervlakte_m2", melding: "Vul een getal in." },
      { pad: "object.aantal_kamers", melding: "Vul een heel getal in." },
      { pad: "object.bouwjaar", melding: "Vul een waarde van 1000 tot en met 2100 in." },
      { pad: "object.woningtype", melding: "Kies een waarde uit de lijst." },
    ]);
  });
});
