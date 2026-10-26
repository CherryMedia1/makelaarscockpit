import { describe, expect, it } from "vitest";
import { bronPrioriteit, vergelijkWaarden, voegSamen, type BestaandVeld, type Bron } from "./samenvoegen";

const gesprek: Bron = { id: "b-gesprek", type: "plaud_transcript" };
const checklist: Bron = { id: "b-checklist", type: "checklist_form" };
const bag: Bron = { id: "b-bag", type: "bag" };
const meetrapport: Bron = { id: "b-meet", type: "meetrapport" };

let teller = 0;
const veld = (bron: Bron, pad: string, waarde: unknown, status: BestaandVeld["status"] = "voorstel"): BestaandVeld => ({ id: `v${++teller}`, pad, waarde, status, bronId: bron.id, bronType: bron.type });

describe("bronPrioriteit", () => {
  it("meetrapport > BAG > checklist > gesprek", () => {
    const volgorde = (["gespreksverslag_pdf", "plaud_transcript", "checklist_pdf", "checklist_form", "bag", "meetrapport"] as const).map(bronPrioriteit);
    expect(volgorde).toEqual([1, 1, 2, 2, 3, 4]);
  });
});

describe("vergelijkWaarden", () => {
  it("vergelijkt tekst zonder hoofdletters en overbodige spaties", () => {
    expect(vergelijkWaarden("object.parkeren", "  Eigen  oprit", "eigen oprit")).toBe("gelijk");
  });

  it("staat bij oppervlakte en inhoud 5% verschil toe, bij andere getallen niets", () => {
    expect(vergelijkWaarden("object.woonoppervlakte_m2", 120, 124)).toBe("binnen_drempel");
    expect(vergelijkWaarden("object.woonoppervlakte_m2", 120, 130)).toBe("verschil");
    expect(vergelijkWaarden("object.inhoud_m3", 400, 410)).toBe("binnen_drempel");
    expect(vergelijkWaarden("object.bouwjaar", 1978, 1979)).toBe("verschil");
  });

  it("vergelijkt booleans en enums exact", () => {
    expect(vergelijkWaarden("installaties.isolatie.dak", true, true)).toBe("gelijk");
    expect(vergelijkWaarden("installaties.energielabel", "A", "B")).toBe("verschil");
  });
});

describe("voegSamen", () => {
  it("voegt een nieuwe waarde toe als voorstel als er nog niets is", () => {
    expect(voegSamen([], gesprek, [{ pad: "installaties.cv.merk", waarde: "Remeha" }])).toEqual([
      { soort: "toevoegen", veld: { pad: "installaties.cv.merk", waarde: "Remeha" }, status: "voorstel" },
    ]);
  });

  it("slaat dezelfde waarde uit een gelijke of zwakkere bron over", () => {
    const bestaand = [veld(checklist, "installaties.cv.merk", "Remeha")];
    expect(voegSamen(bestaand, gesprek, [{ pad: "installaties.cv.merk", waarde: "remeha" }])).toEqual([
      { soort: "overslaan", pad: "installaties.cv.merk", reden: "zelfde waarde" },
    ]);
  });

  it("vervangt dezelfde waarde uit een zwakkere bron door de sterkere bron", () => {
    const bestaand = [veld(gesprek, "object.woonoppervlakte_m2", 120)];
    expect(voegSamen(bestaand, bag, [{ pad: "object.woonoppervlakte_m2", waarde: 120 }])).toEqual([
      { soort: "vervangen", id: bestaand[0]!.id, veld: { pad: "object.woonoppervlakte_m2", waarde: 120 } },
    ]);
  });

  it("laat bij een klein verschil de sterkere bron winnen, zonder conflict", () => {
    const bestaand = [veld(bag, "object.woonoppervlakte_m2", 120)];
    expect(voegSamen(bestaand, meetrapport, [{ pad: "object.woonoppervlakte_m2", waarde: 123 }])).toEqual([
      { soort: "vervangen", id: bestaand[0]!.id, veld: { pad: "object.woonoppervlakte_m2", waarde: 123 } },
    ]);
    expect(voegSamen(bestaand, gesprek, [{ pad: "object.woonoppervlakte_m2", waarde: 118 }])).toEqual([
      { soort: "overslaan", pad: "object.woonoppervlakte_m2", reden: "binnen drempel" },
    ]);
  });

  it("maakt bij een verschil boven de drempel een conflict, ook als de nieuwe bron sterker is", () => {
    const bestaand = [veld(gesprek, "installaties.cv.merk", "Nefit")];
    expect(voegSamen(bestaand, checklist, [{ pad: "installaties.cv.merk", waarde: "Remeha" }])).toEqual([
      { soort: "markeerConflict", id: bestaand[0]!.id },
      { soort: "toevoegen", veld: { pad: "installaties.cv.merk", waarde: "Remeha" }, status: "conflict" },
    ]);
  });

  it("overschrijft een bevestigd veld nooit: afwijking wordt een conflict, gelijke waarde wordt overgeslagen", () => {
    const bestaand = [veld(gesprek, "object.bouwjaar", 1978, "bevestigd")];
    expect(voegSamen(bestaand, bag, [{ pad: "object.bouwjaar", waarde: 1978 }])).toEqual([{ soort: "overslaan", pad: "object.bouwjaar", reden: "al bevestigd" }]);
    expect(voegSamen(bestaand, bag, [{ pad: "object.bouwjaar", waarde: 1980 }])).toEqual([
      { soort: "toevoegen", veld: { pad: "object.bouwjaar", waarde: 1980 }, status: "conflict" },
    ]);
  });

  it("negeert afgewezen velden", () => {
    const bestaand = [veld(gesprek, "installaties.cv.merk", "Nefit", "afgewezen")];
    expect(voegSamen(bestaand, checklist, [{ pad: "installaties.cv.merk", waarde: "Remeha" }])).toEqual([
      { soort: "toevoegen", veld: { pad: "installaties.cv.merk", waarde: "Remeha" }, status: "voorstel" },
    ]);
  });

  it("vervangt bij een tweede verwerking van dezelfde bron de eigen open waarde", () => {
    const bestaand = [veld(checklist, "object.aantal_kamers", 4)];
    expect(voegSamen(bestaand, checklist, [{ pad: "object.aantal_kamers", waarde: 5 }])).toEqual([
      { soort: "vervangen", id: bestaand[0]!.id, veld: { pad: "object.aantal_kamers", waarde: 5 } },
    ]);
  });

  it("geeft extra velden van de nieuwe bron door aan het besluit", () => {
    const nieuw = { pad: "object.ligging", waarde: "aan park", zekerheid: 0.7, bewijs: { citaat: "aan het park" } };
    expect(voegSamen([], gesprek, [nieuw])).toEqual([{ soort: "toevoegen", veld: nieuw, status: "voorstel" }]);
  });

  describe("lijsten", () => {
    it("zet items uit een nieuwe bron achter de bestaande items, zodat indexen van verschillende bronnen niet botsen", () => {
      const bestaand = [veld(gesprek, "keuken.apparatuur[0].soort", "vaatwasser"), veld(gesprek, "keuken.apparatuur[1].soort", "inductiekookplaat")];
      expect(voegSamen(bestaand, checklist, [{ pad: "keuken.apparatuur[0].soort", waarde: "koelkast" }, { pad: "keuken.apparatuur[0].merk", waarde: "Siemens" }])).toEqual([
        { soort: "toevoegen", veld: { pad: "keuken.apparatuur[2].soort", waarde: "koelkast" }, status: "voorstel" },
        { soort: "toevoegen", veld: { pad: "keuken.apparatuur[2].merk", waarde: "Siemens" }, status: "voorstel" },
      ]);
    });

    it("houdt binnen een item de indexen van geneste lijsten", () => {
      const bestaand = [veld(gesprek, "indeling[0].verdieping", "begane grond")];
      expect(voegSamen(bestaand, checklist, [{ pad: "indeling[0].ruimtes[1].naam", waarde: "woonkamer" }])).toEqual([
        { soort: "toevoegen", veld: { pad: "indeling[1].ruimtes[1].naam", waarde: "woonkamer" }, status: "voorstel" },
      ]);
    });

    it("houdt de eigen indexen van een bron die opnieuw wordt verwerkt", () => {
      const bestaand = [veld(checklist, "onderhoud[0].wat", "dak"), veld(gesprek, "onderhoud[1].wat", "kozijnen")];
      expect(voegSamen(bestaand, checklist, [{ pad: "onderhoud[0].wat", waarde: "dakgoten" }])).toEqual([
        { soort: "vervangen", id: bestaand[0]!.id, veld: { pad: "onderhoud[0].wat", waarde: "dakgoten" } },
      ]);
    });

    it("slaat een losse lijstwaarde over die er al staat, en zet een nieuwe achteraan", () => {
      const bestaand = [veld(gesprek, "verkoopargumenten[0]", "Het licht in de woonkamer")];
      expect(voegSamen(bestaand, checklist, [{ pad: "verkoopargumenten[0]", waarde: "het licht in de woonkamer" }, { pad: "verkoopargumenten[1]", waarde: "rustige straat" }])).toEqual([
        { soort: "overslaan", pad: "verkoopargumenten[0]", reden: "zelfde waarde" },
        { soort: "toevoegen", veld: { pad: "verkoopargumenten[1]", waarde: "rustige straat" }, status: "voorstel" },
      ]);
    });
  });
});
