import { describe, expect, it } from "vitest";
import { beoordeelInlog, normaliseerEmail, type GebruikerVoorInlog } from "./toegang";

const CR_MICROSOFT = "11111111-1111-1111-1111-111111111111";
const PLATFORM_MICROSOFT = "22222222-2222-2222-2222-222222222222";
const VANDAAG = "2026-10-01";

const medewerker: GebruikerVoorInlog = {
  id: "g1", tenantId: "t1", email: "sam@kantoor.example", naam: "Sam", rol: "medewerker", actief: true,
  toegangTot: null, microsoftTenantId: null, kantoorMicrosoftTenantId: CR_MICROSOFT,
};

describe("normaliseerEmail", () => {
  it("maakt kleine letters en haalt spaties weg", () => {
    expect(normaliseerEmail("  Sam@Kantoor.Example ")).toBe("sam@kantoor.example");
  });
  it("geeft null voor iets dat geen e-mailadres is", () => {
    expect(normaliseerEmail("geen-adres")).toBeNull();
    expect(normaliseerEmail("")).toBeNull();
    expect(normaliseerEmail("a@b")).toBeNull();
  });
});

describe("beoordeelInlog", () => {
  it("weigert een onbekend adres", () => {
    expect(beoordeelInlog(null, { methode: "email" }, VANDAAG)).toEqual({ toegestaan: false, reden: "onbekend" });
  });

  it("laat een actieve medewerker toe via de e-maillink", () => {
    expect(beoordeelInlog(medewerker, { methode: "email" }, VANDAAG)).toEqual({ toegestaan: true });
  });

  it("weigert een gedeactiveerde gebruiker", () => {
    expect(beoordeelInlog({ ...medewerker, actief: false }, { methode: "email" }, VANDAAG)).toEqual({ toegestaan: false, reden: "inactief" });
  });

  it("laat tijdelijke toegang toe tot en met de einddatum en weigert daarna (ADR-006)", () => {
    const pilot = { ...medewerker, toegangTot: "2026-10-01" };
    expect(beoordeelInlog(pilot, { methode: "email" }, "2026-10-01")).toEqual({ toegestaan: true });
    expect(beoordeelInlog(pilot, { methode: "email" }, "2026-10-02")).toEqual({ toegestaan: false, reden: "verlopen" });
  });

  it("laat een Microsoft-inlog toe vanuit de organisatie van het kantoor", () => {
    expect(beoordeelInlog(medewerker, { methode: "microsoft", microsoftTenantId: CR_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: true });
  });

  it("weigert een Microsoft-inlog vanuit een andere organisatie, ook met hetzelfde e-mailadres", () => {
    expect(beoordeelInlog(medewerker, { methode: "microsoft", microsoftTenantId: PLATFORM_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: false, reden: "andere-organisatie" });
  });

  it("vergelijkt organisatie-id's zonder op hoofdletters te letten", () => {
    expect(beoordeelInlog({ ...medewerker, kantoorMicrosoftTenantId: CR_MICROSOFT.toUpperCase() }, { methode: "microsoft", microsoftTenantId: CR_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: true });
  });

  it("gebruikt de afwijkende organisatie van de gebruiker als die is vastgelegd, zoals bij het pilot-account", () => {
    const pilot = { ...medewerker, microsoftTenantId: PLATFORM_MICROSOFT };
    expect(beoordeelInlog(pilot, { methode: "microsoft", microsoftTenantId: PLATFORM_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: true });
    expect(beoordeelInlog(pilot, { methode: "microsoft", microsoftTenantId: CR_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: false, reden: "andere-organisatie" });
  });

  it("weigert een Microsoft-inlog als er voor kantoor en gebruiker geen organisatie is vastgelegd", () => {
    const zonder = { ...medewerker, kantoorMicrosoftTenantId: null };
    expect(beoordeelInlog(zonder, { methode: "microsoft", microsoftTenantId: CR_MICROSOFT }, VANDAAG)).toEqual({ toegestaan: false, reden: "andere-organisatie" });
  });
});
