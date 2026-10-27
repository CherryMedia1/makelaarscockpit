import { describe, expect, it } from "vitest";
import { leesTekstBericht } from "./schrijf-tekst";

const id = "8f0c2a3e-1b2c-4d5e-8f90-123456789abc";

describe("leesTekstBericht", () => {
  it("accepteert een hele tekst of één sectie", () => {
    expect(leesTekstBericht({ tenantId: id, woningtekstId: id, sectie: null })).toEqual({ tenantId: id, woningtekstId: id, sectie: null });
    expect(leesTekstBericht({ tenantId: id, woningtekstId: id, sectie: "wonen_koken" })).toEqual({ tenantId: id, woningtekstId: id, sectie: "wonen_koken" });
  });

  it("weigert ongeldige id's, een ongeldige sectie en extra velden", () => {
    expect(leesTekstBericht({ tenantId: "x", woningtekstId: id, sectie: null })).toBeNull();
    expect(leesTekstBericht({ tenantId: id, woningtekstId: id, sectie: "Wonen & Koken" })).toBeNull();
    expect(leesTekstBericht({ tenantId: id, woningtekstId: id })).toBeNull();
    expect(leesTekstBericht({ tenantId: id, woningtekstId: id, sectie: null, tekst: "..." })).toBeNull();
  });
});
