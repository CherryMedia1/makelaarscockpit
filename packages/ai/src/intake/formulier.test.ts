import { describe, expect, it } from "vitest";
import { checklistFormulier, leesChecklistFormulier } from "./formulier";

const veld = (groepen: ReturnType<typeof checklistFormulier>, pad: string) => groepen.flatMap((g) => g.velden).find((v) => v.pad === pad);

describe("checklistFormulier", () => {
  const groepen = checklistFormulier([]);

  it("volgt de volgorde van het papieren intakeformulier van C&R", () => {
    expect(groepen.map((g) => g.sleutel)).toEqual([
      "object", "indeling", "keuken", "sanitair", "installaties", "kozijnen", "dak", "onderhoud", "gebreken", "vve", "zaken", "verkoopargumenten", "planning", "opmerkingen",
    ]);
    expect(groepen.map((g) => g.titel).slice(0, 2)).toEqual(["Woning", "Verdiepingen"]);
  });

  it("vraagt per verdieping de afwerking, maar niet de losse ruimtes (die komen uit gesprek en meetrapport)", () => {
    expect(veld(groepen, "indeling[0].vloerconstructie")).toMatchObject({ soort: "keuze", opties: ["beton", "hout"], sectie: "Indeling 1" });
    expect(veld(groepen, "indeling[0].vloerafwerking")).toMatchObject({ soort: "meerkeuze", opties: expect.arrayContaining(["laminaat", "pvc"]) });
    expect(groepen.flatMap((g) => g.velden).some((v) => v.pad.includes("ruimtes"))).toBe(false);
  });

  it("kiest per veld het soort invoer uit het schema", () => {
    expect(veld(groepen, "object.woonoppervlakte_m2")).toMatchObject({ label: "Woonoppervlakte (m²)", soort: "getal", hint: "Gebruiksoppervlakte wonen in m²." });
    expect(veld(groepen, "object.bouwjaar")).toMatchObject({ soort: "geheel" });
    expect(veld(groepen, "object.woningtype")).toMatchObject({ soort: "keuze", opties: expect.arrayContaining(["hoekwoning", "appartement"]) });
    expect(veld(groepen, "installaties.isolatie.dak")).toMatchObject({ soort: "janee", sectie: "Isolatie" });
    expect(veld(groepen, "installaties.cv.merk")).toMatchObject({ soort: "tekst", sectie: "Cv-ketel" });
    expect(veld(groepen, "verkoopargumenten")).toMatchObject({ soort: "regels" });
    expect(veld(groepen, "keuken.apparatuur[0].soort")).toMatchObject({ soort: "keuze", opties: expect.arrayContaining(["quooker", "inductiekookplaat"]) });
    expect(veld(groepen, "object.tuin.kenmerken")).toMatchObject({ soort: "meerkeuze", sectie: "Tuin of buitenruimte" });
    expect(veld(groepen, "zaken.mee_te_nemen")).toMatchObject({ soort: "regels", label: "Mee te nemen" });
  });

  it("geeft lijsten met items één lege rij om aan te vullen", () => {
    expect(veld(groepen, "keuken.apparatuur[0].merk")).toMatchObject({ sectie: "Apparatuur 1" });
    expect(veld(groepen, "keuken.apparatuur[1].merk")).toBeUndefined();
    expect(veld(groepen, "sanitair[0].voorzieningen")).toMatchObject({ soort: "meerkeuze", sectie: "Sanitair 1" });
  });

  it("vult bestaande waarden in en zet een lege rij achter de bestaande rijen", () => {
    const gevuld = checklistFormulier([
      { pad: "object.bouwjaar", waarde: 1978 },
      { pad: "installaties.isolatie.dak", waarde: true },
      { pad: "keuken.apparatuur[0].soort", waarde: "vaatwasser" },
      { pad: "keuken.apparatuur[1].soort", waarde: "koelkast" },
      { pad: "verkoopargumenten[0]", waarde: "licht" },
      { pad: "verkoopargumenten[1]", waarde: "tuin" },
      { pad: "object.tuin.kenmerken[0]", waarde: "vijver" },
      { pad: "object.tuin.kenmerken[1]", waarde: "schuur" },
    ]);
    expect(veld(gevuld, "object.bouwjaar")?.waarde).toBe("1978");
    expect(veld(gevuld, "installaties.isolatie.dak")?.waarde).toBe("ja");
    expect(veld(gevuld, "keuken.apparatuur[1].soort")?.waarde).toBe("koelkast");
    expect(veld(gevuld, "keuken.apparatuur[2].soort")).toMatchObject({ waarde: "", sectie: "Apparatuur 3" });
    expect(veld(gevuld, "verkoopargumenten")?.waarde).toBe("licht\ntuin");
    expect(veld(gevuld, "object.tuin.kenmerken")?.gekozen).toEqual(["vijver", "schuur"]);
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
      ["object.tuin.kenmerken", "vijver"],
      ["object.tuin.kenmerken", "schuur"],
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
      { pad: "object.tuin.kenmerken[0]", waarde: "vijver" },
      { pad: "object.tuin.kenmerken[1]", waarde: "schuur" },
    ]);
  });

  it("geeft per veld een foutmelding bij ongeldige invoer", () => {
    const { velden, fouten } = leesChecklistFormulier([
      ["object.woonoppervlakte_m2", "groot"],
      ["object.aantal_kamers", "4,5"],
      ["object.bouwjaar", "3000"],
      ["object.woningtype", "villa"],
      ["object.tuin.kenmerken", "zwembad"],
    ]);
    expect(velden).toEqual([]);
    expect(fouten).toEqual([
      { pad: "object.woonoppervlakte_m2", melding: "Vul een getal in." },
      { pad: "object.aantal_kamers", melding: "Vul een heel getal in." },
      { pad: "object.bouwjaar", melding: "Vul een waarde van 1000 tot en met 2100 in." },
      { pad: "object.woningtype", melding: "Kies een waarde uit de lijst." },
      { pad: "object.tuin.kenmerken", melding: "Kies een waarde uit de lijst." },
    ]);
  });
});
