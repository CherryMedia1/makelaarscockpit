import { describe, expect, it } from "vitest";
import { bouwBord, type BordStand } from "./bord";
import type { Lead } from "./bezichtigers";
import type { PijplijnFase } from "./pijplijn";

const fase = (id: string, volgorde: number, over: Partial<PijplijnFase> = {}): PijplijnFase => ({ id, naam: `Fase ${id}`, volgorde, soort: "open", actief: true, ...over });
const stand = (bezichtigerId: string, faseId: string, over: Partial<BordStand> = {}): BordStand => ({ bezichtigerId, faseId, naam: `Persoon ${bezichtigerId}`, naamGezocht: true, eigenaar: null, ...over });
const lead = (bezichtigerId: string, laatste: string, woning = "Proefstraat 1, Testdorp"): Lead => ({
  bezichtigerId, naam: `Persoon ${bezichtigerId}`, naamGezocht: true, aantal: 2, aantalWoningen: 1, eerste: laatste, laatste, komende: null, terugNaarZelfdeWoning: false, makelaars: ["Makelaar A"],
  bezichtigingen: [{ id: `b-${bezichtigerId}`, bezichtigerId, naam: `Persoon ${bezichtigerId}`, naamGezocht: true, agendatype: "1e bezichtiging", status: "Definitief", tijdstip: laatste, projectcode: "P-1", woning, makelaar: "Makelaar A" }],
});

describe("bouwBord", () => {
  const fases = [fase("b", 2), fase("a", 1), fase("w", 3, { soort: "gewonnen" })];

  it("geeft een kolom per fase in de volgorde van het kantoor, ook als ze leeg is", () => {
    const bord = bouwBord(fases, [stand("1", "b")], []);
    expect(bord.map((k) => [k.fase.id, k.kaarten.length])).toEqual([["a", 0], ["b", 1], ["w", 0]]);
  });

  it("vult een kaartje met de laatste bezichtiging en de woning als die er zijn", () => {
    const [, kolom] = bouwBord(fases, [stand("1", "b", { eigenaar: "Makelaar B" })], [lead("1", "2026-11-10 14:00")]);
    expect(kolom!.kaarten).toEqual([
      { bezichtigerId: "1", naam: "Persoon 1", naamGezocht: true, eigenaar: "Makelaar B", aantalBezichtigingen: 2, laatsteBezichtiging: "2026-11-10 14:00", woning: "Proefstraat 1, Testdorp" },
    ]);
  });

  it("toont een lead zonder recente bezichtigingen nog steeds, zonder bezichtiging", () => {
    const [, kolom] = bouwBord(fases, [stand("9", "b")], []);
    expect(kolom!.kaarten[0]).toMatchObject({ bezichtigerId: "9", aantalBezichtigingen: 0, laatsteBezichtiging: null, woning: null });
  });

  it("zet binnen een kolom de lead met de meest recente bezichtiging bovenaan, en leads zonder bezichtiging onderaan", () => {
    const [, kolom] = bouwBord(fases, [stand("oud", "b"), stand("geen", "b"), stand("nieuw", "b")], [lead("oud", "2026-08-01 10:00"), lead("nieuw", "2026-11-20 10:00")]);
    expect(kolom!.kaarten.map((k) => k.bezichtigerId)).toEqual(["nieuw", "oud", "geen"]);
  });

  it("laat een uitgezette fase alleen zien als er nog leads in zitten", () => {
    const metUit = [...fases, fase("leeg", 4, { actief: false }), fase("vol", 5, { actief: false })];
    expect(bouwBord(metUit, [stand("1", "vol")], []).map((k) => k.fase.id)).toEqual(["a", "b", "w", "vol"]);
  });

  it("slaat een stand over waarvan de fase niet bij het kantoor hoort", () => {
    expect(bouwBord(fases, [stand("1", "onbekend")], []).every((k) => k.kaarten.length === 0)).toBe(true);
  });
});
