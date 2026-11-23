import { describe, expect, it } from "vitest";
import { STANDAARD_FASES, valideerFase, verplaatsFase, type PijplijnFase } from "./pijplijn";

const fase = (id: string, naam: string, volgorde: number, over: Partial<PijplijnFase> = {}): PijplijnFase => ({ id, naam, volgorde, soort: "open", actief: true, ...over });
const FASES = [fase("a", "Social media marketing", 1), fase("b", "Telefonisch benaderd", 2), fase("c", "Gewonnen", 3, { soort: "gewonnen" })];

describe("valideerFase", () => {
  it("accepteert een naam en een soort, en haalt spaties rond de naam weg", () => {
    expect(valideerFase({ naam: "  Voorstel gestuurd ", soort: "open" }, FASES)).toEqual({ ok: true, waarde: { naam: "Voorstel gestuurd", soort: "open" } });
  });

  it("weigert een lege of te lange naam en een onbekende soort", () => {
    expect(valideerFase({ naam: "   ", soort: "open" }, FASES)).toEqual({ ok: false, fout: "naam-leeg" });
    expect(valideerFase({ naam: "x".repeat(41), soort: "open" }, FASES)).toEqual({ ok: false, fout: "naam-te-lang" });
    expect(valideerFase({ naam: "Nieuw", soort: "misschien" }, FASES)).toEqual({ ok: false, fout: "soort" });
  });

  it("weigert een naam die het kantoor al heeft, ongeacht hoofdletters", () => {
    expect(valideerFase({ naam: "telefonisch BENADERD", soort: "open" }, FASES)).toEqual({ ok: false, fout: "naam-bestaat" });
  });

  it("laat een fase haar eigen naam houden bij wijzigen", () => {
    expect(valideerFase({ naam: "Telefonisch benaderd", soort: "verloren" }, FASES, "b")).toEqual({ ok: true, waarde: { naam: "Telefonisch benaderd", soort: "verloren" } });
    expect(valideerFase({ naam: "Gewonnen", soort: "open" }, FASES, "b")).toEqual({ ok: false, fout: "naam-bestaat" });
  });
});

describe("verplaatsFase", () => {
  it("wisselt een fase met haar buur", () => {
    expect(verplaatsFase(FASES, "b", "omhoog")).toEqual(["b", "a", "c"]);
    expect(verplaatsFase(FASES, "b", "omlaag")).toEqual(["a", "c", "b"]);
  });

  it("laat de volgorde staan aan de rand of bij een onbekende fase", () => {
    expect(verplaatsFase(FASES, "a", "omhoog")).toEqual(["a", "b", "c"]);
    expect(verplaatsFase(FASES, "c", "omlaag")).toEqual(["a", "b", "c"]);
    expect(verplaatsFase(FASES, "x", "omlaag")).toEqual(["a", "b", "c"]);
  });

  it("gaat uit van de volgorde, niet van de plek in de lijst", () => {
    expect(verplaatsFase([FASES[2]!, FASES[0]!, FASES[1]!], "c", "omhoog")).toEqual(["a", "c", "b"]);
  });
});

describe("STANDAARD_FASES", () => {
  it("is een geldige startset met precies één gewonnen- en één verloren-fase", () => {
    expect(STANDAARD_FASES.filter((f) => f.soort === "gewonnen")).toHaveLength(1);
    expect(STANDAARD_FASES.filter((f) => f.soort === "verloren")).toHaveLength(1);
    expect(new Set(STANDAARD_FASES.map((f) => f.naam.toLowerCase())).size).toBe(STANDAARD_FASES.length);
  });
});
