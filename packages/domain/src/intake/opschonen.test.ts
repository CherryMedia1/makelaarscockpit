import { describe, expect, it } from "vitest";
import { opschoonActie, type DossierVoorOpschonen } from "./opschonen";

const VANDAAG = "2026-10-27";
const dossier = (d: Partial<DossierVoorOpschonen> = {}): DossierVoorOpschonen => ({ status: "open", fase: "in_verkoop", transportdatum: null, zichtbaar: true, nietZichtbaarSinds: null, ...d });

describe("opschoonActie", () => {
  it("laat een woning in verkoop met rust", () => {
    expect(opschoonActie(dossier(), VANDAAG)).toBeNull();
  });

  it("schoont op zodra de transportdatum verstreken is, niet op de dag zelf", () => {
    expect(opschoonActie(dossier({ fase: "verkocht", transportdatum: "2026-10-27" }), VANDAAG)).toBeNull();
    expect(opschoonActie(dossier({ fase: "verkocht", transportdatum: "2026-10-26" }), VANDAAG)).toBe("na-verkoop");
  });

  it("schoont een verkochte woning die van het bord verdwijnt op na verkoop, ook zonder bekende transportdatum", () => {
    expect(opschoonActie(dossier({ fase: "verkocht", zichtbaar: false, nietZichtbaarSinds: "2026-10-20" }), VANDAAG)).toBe("na-verkoop");
    expect(opschoonActie(dossier({ fase: "verkocht_ov", zichtbaar: false, nietZichtbaarSinds: "2026-10-26" }), VANDAAG)).toBe("na-verkoop");
  });

  it("verwijdert een ingetrokken woning pas na 30 dagen van het bord", () => {
    expect(opschoonActie(dossier({ fase: "in_verkoop", zichtbaar: false, nietZichtbaarSinds: "2026-09-28" }), VANDAAG)).toBeNull();
    expect(opschoonActie(dossier({ fase: "in_verkoop", zichtbaar: false, nietZichtbaarSinds: "2026-09-27" }), VANDAAG)).toBe("verwijderen");
    expect(opschoonActie(dossier({ fase: "voorbereiding", zichtbaar: false, nietZichtbaarSinds: "2026-08-01" }), VANDAAG)).toBe("verwijderen");
  });

  it("houdt een woning die terug op het bord staat", () => {
    expect(opschoonActie(dossier({ zichtbaar: true, nietZichtbaarSinds: null }), VANDAAG)).toBeNull();
  });

  it("doet niets meer met een opgeschoond dossier", () => {
    expect(opschoonActie(dossier({ status: "opgeschoond", fase: "verkocht", transportdatum: "2026-01-01" }), VANDAAG)).toBeNull();
    expect(opschoonActie(dossier({ status: "opgeschoond", fase: "verkocht", zichtbaar: false, nietZichtbaarSinds: "2026-01-01" }), VANDAAG)).toBeNull();
  });
});
