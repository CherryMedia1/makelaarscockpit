import { describe, expect, it } from "vitest";
import { leesSyncBericht } from "./bezichtigers";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SYNC = "22222222-2222-4222-8222-222222222222";

describe("leesSyncBericht", () => {
  it("accepteert een bericht met precies een tenant-id en een sync-id", () => {
    expect(leesSyncBericht({ tenantId: TENANT, syncId: SYNC })).toEqual({ tenantId: TENANT, syncId: SYNC });
  });

  it("accepteert een bericht voor de contactgegevens van één lead", () => {
    expect(leesSyncBericht({ tenantId: TENANT, leadId: SYNC })).toEqual({ tenantId: TENANT, leadId: SYNC });
  });

  it("weigert alles wat daarvan afwijkt", () => {
    expect(leesSyncBericht(null)).toBeNull();
    expect(leesSyncBericht("tekst")).toBeNull();
    expect(leesSyncBericht({ tenantId: TENANT })).toBeNull();
    expect(leesSyncBericht({ tenantId: TENANT, leadId: "geen-uuid" })).toBeNull();
    expect(leesSyncBericht({ syncId: SYNC, leadId: SYNC })).toBeNull();
    expect(leesSyncBericht({ tenantId: "cr", syncId: SYNC })).toBeNull();
    expect(leesSyncBericht({ tenantId: TENANT, syncId: SYNC, naam: "extra veld" })).toBeNull();
  });
});
