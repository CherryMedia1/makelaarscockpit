import { describe, expect, it } from "vitest";
import { MAX_LEAD_NOTITIE, valideerLeadInvoer } from "./lead";
import type { PijplijnFase } from "./pijplijn";

const fase = (id: string, over: Partial<PijplijnFase> = {}): PijplijnFase => ({ id, naam: `Fase ${id}`, volgorde: 1, soort: "open", actief: true, ...over });
const FASES = [fase("a"), fase("b"), fase("uit", { actief: false })];
const MEDEWERKERS = ["m-1", "m-2"];
const invoer = (over: Partial<Parameters<typeof valideerLeadInvoer>[0]> = {}) => ({ faseId: "a", eigenaarId: "", notitie: "", ...over });

describe("valideerLeadInvoer", () => {
  it("accepteert een fase zonder eigenaar en notitie", () => {
    expect(valideerLeadInvoer(invoer(), FASES, MEDEWERKERS, null)).toEqual({ ok: true, waarde: { faseId: "a", eigenaarId: null, notitie: null } });
  });

  it("neemt eigenaar en notitie over en haalt spaties rond de notitie weg", () => {
    expect(valideerLeadInvoer(invoer({ eigenaarId: "m-2", notitie: "  belt liever 's avonds " }), FASES, MEDEWERKERS, null)).toEqual({
      ok: true, waarde: { faseId: "a", eigenaarId: "m-2", notitie: "belt liever 's avonds" },
    });
  });

  it("weigert een fase die het kantoor niet heeft en een onbekende eigenaar", () => {
    expect(valideerLeadInvoer(invoer({ faseId: "x" }), FASES, MEDEWERKERS, null)).toEqual({ ok: false, fout: "fase" });
    expect(valideerLeadInvoer(invoer({ faseId: "" }), FASES, MEDEWERKERS, null)).toEqual({ ok: false, fout: "fase" });
    expect(valideerLeadInvoer(invoer({ eigenaarId: "m-9" }), FASES, MEDEWERKERS, null)).toEqual({ ok: false, fout: "eigenaar" });
  });

  it("laat een uitgezette fase alleen toe als de lead er al in zit", () => {
    expect(valideerLeadInvoer(invoer({ faseId: "uit" }), FASES, MEDEWERKERS, null)).toEqual({ ok: false, fout: "fase" });
    expect(valideerLeadInvoer(invoer({ faseId: "uit" }), FASES, MEDEWERKERS, "uit")).toMatchObject({ ok: true });
  });

  it("weigert een te lange notitie", () => {
    expect(valideerLeadInvoer(invoer({ notitie: "x".repeat(MAX_LEAD_NOTITIE + 1) }), FASES, MEDEWERKERS, null)).toEqual({ ok: false, fout: "notitie" });
  });
});
