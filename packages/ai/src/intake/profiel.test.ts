import { describe, expect, it } from "vitest";
import { leesVeldwaarde, padLabel, profielOverzicht, toonWaarde } from "./profiel";

describe("padLabel", () => {
  it("maakt een leesbare naam met groep, onderdeel en rijnummer", () => {
    expect(padLabel("installaties.cv.merk")).toBe("Installaties › Cv-ketel › Merk");
    expect(padLabel("keuken.apparatuur[1].soort")).toBe("Keuken › Apparatuur 2 › Soort");
    expect(padLabel("object.woonoppervlakte_m2")).toBe("Woning › Woonoppervlakte (m²)");
    expect(padLabel("verkoopargumenten[0]")).toBe("Verkoopargumenten 1");
    expect(padLabel("indeling[0].ruimtes[2].naam")).toBe("Verdiepingen › Indeling 1 › Ruimtes 3 › Naam");
  });
});

describe("toonWaarde", () => {
  it("toont ja/nee, getallen in Nederlandse notatie en tekst ongewijzigd", () => {
    expect(toonWaarde(true)).toBe("ja");
    expect(toonWaarde(false)).toBe("nee");
    expect(toonWaarde(121.5)).toBe("121,5");
    expect(toonWaarde(1978)).toBe("1978");
    expect(toonWaarde("hoekwoning")).toBe("hoekwoning");
  });
});

describe("leesVeldwaarde", () => {
  it("leest een correctie volgens het schema van het pad, ook voor velden die niet in de checklist staan", () => {
    expect(leesVeldwaarde("object.woonoppervlakte_m2", "121,5")).toEqual({ waarde: 121.5 });
    expect(leesVeldwaarde("installaties.isolatie.dak", "ja")).toEqual({ waarde: true });
    expect(leesVeldwaarde("indeling[0].ruimtes[1].naam", "woonkamer")).toEqual({ waarde: "woonkamer" });
    expect(leesVeldwaarde("sanitair[0].voorzieningen[1]", "bad")).toEqual({ waarde: "bad" });
  });

  it("geeft een melding bij ongeldige of lege invoer en bij een onbekend pad", () => {
    expect(leesVeldwaarde("object.bouwjaar", "3000")).toEqual({ melding: "Vul een waarde van 1000 tot en met 2100 in." });
    expect(leesVeldwaarde("object.bouwjaar", "  ")).toEqual({ melding: "Vul een waarde in, of wijs het veld af." });
    expect(leesVeldwaarde("object.burgerlijke_staat", "x")).toEqual({ melding: "Onbekend veld." });
  });
});

describe("profielOverzicht", () => {
  const rij = (id: string, pad: string, waarde: unknown, status: "voorstel" | "bevestigd" | "conflict" | "afgewezen") => ({ id, pad, waarde, status });

  it("groepeert per onderdeel in de volgorde van het schema, met rijen in volgorde van het pad", () => {
    const o = profielOverzicht([
      rij("1", "keuken.apparatuur[1].soort", "koelkast", "voorstel"),
      rij("2", "object.bouwjaar", 1978, "bevestigd"),
      rij("3", "keuken.apparatuur[0].soort", "vaatwasser", "voorstel"),
      rij("4", "keuken.stijl", "modern", "voorstel"),
    ]);
    expect(o.groepen.map((g) => g.sleutel)).toEqual(["object", "keuken"]);
    expect(o.groepen[1]!.velden.map((v) => v.pad)).toEqual(["keuken.stijl", "keuken.apparatuur[0].soort", "keuken.apparatuur[1].soort"]);
    expect(o.groepen[0]!.velden[0]).toMatchObject({ label: "Woning › Bouwjaar", status: "bevestigd" });
    expect(o.teBeoordelen).toBe(3);
  });

  it("zet conflicten apart bovenaan en laat afgewezen waarden weg", () => {
    const o = profielOverzicht([
      rij("1", "installaties.cv.merk", "Nefit", "conflict"),
      rij("2", "installaties.cv.merk", "Remeha", "conflict"),
      rij("3", "object.ligging", "park", "afgewezen"),
      rij("4", "object.bouwjaar", 1978, "voorstel"),
    ]);
    expect(o.conflicten.map((v) => [v.pad, v.rijen.map((r) => r.id)])).toEqual([["installaties.cv.merk", ["1", "2"]]]);
    expect(o.groepen.flatMap((g) => g.velden.map((v) => v.pad))).toEqual(["object.bouwjaar"]);
  });

  it("geeft een veld met een bevestigde waarde en een nieuw conflicterend voorstel de status conflict", () => {
    const o = profielOverzicht([rij("1", "object.bouwjaar", 1978, "bevestigd"), rij("2", "object.bouwjaar", 1980, "conflict")]);
    expect(o.conflicten[0]).toMatchObject({ pad: "object.bouwjaar", status: "conflict" });
  });
});
