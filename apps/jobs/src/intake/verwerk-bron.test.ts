import { describe, expect, it } from "vitest";
import { leesBericht } from "./verwerk-bron";

const id = "8f0c2a3e-1b2c-4d5e-8f90-123456789abc";

describe("leesBericht", () => {
  it("accepteert een bericht met drie uuid's", () => {
    expect(leesBericht({ tenantId: id, dossierId: id, bronId: id })).toEqual({ tenantId: id, dossierId: id, bronId: id });
  });

  it("weigert een bericht met ontbrekende of ongeldige id's of extra velden", () => {
    expect(leesBericht({ tenantId: id, dossierId: id })).toBeNull();
    expect(leesBericht({ tenantId: "x", dossierId: id, bronId: id })).toBeNull();
    expect(leesBericht("tekst")).toBeNull();
    expect(leesBericht(null)).toBeNull();
    expect(leesBericht({ tenantId: id, dossierId: id, bronId: id, transcript: "..." })).toBeNull();
  });
});
