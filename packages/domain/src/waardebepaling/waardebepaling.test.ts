import { describe, expect, it } from "vitest";
import type { AgendapuntGegevens, ObjectGegevens } from "../realworks-gegevens";
import {
  excelRijNaarWaardebepaling, leesLocatie, locatieBevatAdres, naarWaardebepaling, pastBijObject, valideerWaardebepalingInvoer, waardebepalingDashboard,
  type Waardebepaling,
} from "./waardebepaling";

const agendapunt = (o: Partial<AgendapuntGegevens> = {}): AgendapuntGegevens => ({
  realworksId: 239641166, agendatype: "Waardebepaling", status: "Definitief", begintijd: "2026-01-12 16:00:00", eindtijd: "2026-01-12 17:00:00",
  locatie: "4701 AB  Roosendaal Steenovenstraat 5", projectcode: "RL103486", medewerkerRealworksId: 39227406, relatieId: 41785305,
  realworksGewijzigdOp: "2026-01-12 16:46:13", ...o,
});

describe("naarWaardebepaling", () => {
  it("maakt van een agendapunt van het type Waardebepaling een waardebepaling", () => {
    expect(naarWaardebepaling(agendapunt())).toEqual({
      realworksAgendaId: 239641166, datum: "2026-01-12", locatie: "4701 AB  Roosendaal Steenovenstraat 5", projectcode: "RL103486",
      medewerkerRealworksId: 39227406, relatieId: 41785305, agendaStatus: "Definitief", realworksGewijzigdOp: "2026-01-12 16:46:13",
    });
  });

  it("slaat andere agendatypes over", () => {
    expect(naarWaardebepaling(agendapunt({ agendatype: "1e bezichtiging" }))).toBeNull();
    expect(naarWaardebepaling(agendapunt({ agendatype: null }))).toBeNull();
  });
});

describe("leesLocatie", () => {
  const plaatsen = ["Roosendaal", "Bergen op Zoom", "Oud Gastel"];

  it("haalt postcode, plaats en adres uit de locatie van Realworks", () => {
    expect(leesLocatie("4701 AB  Roosendaal Steenovenstraat 5", plaatsen)).toEqual({ postcode: "4701 AB", plaats: "Roosendaal", adres: "Steenovenstraat 5" });
    expect(leesLocatie("4611 AA  Bergen op Zoom Grote Markt 1 A", plaatsen)).toEqual({ postcode: "4611 AA", plaats: "Bergen op Zoom", adres: "Grote Markt 1 A" });
  });

  it("neemt het eerste woord als plaats als de plaats onbekend is", () => {
    expect(leesLocatie("4731 AA  Nispen Dorpsstraat 8", plaatsen)).toEqual({ postcode: "4731 AA", plaats: "Nispen", adres: "Dorpsstraat 8" });
  });

  it("werkt ook zonder postcode of zonder locatie", () => {
    expect(leesLocatie("Kade 9", plaatsen)).toEqual({ postcode: null, plaats: null, adres: "Kade 9" });
    expect(leesLocatie("", plaatsen)).toEqual({ postcode: null, plaats: null, adres: null });
    expect(leesLocatie(null, plaatsen)).toEqual({ postcode: null, plaats: null, adres: null });
  });
});

const object = (o: Partial<ObjectGegevens> = {}): ObjectGegevens => ({
  realworksId: 1, objectcode: "RL103486", afdelingscode: "935773", straat: "Steenovenstraat", huisnummer: "5", huisnummertoevoeging: null,
  postcode: "4701AB", plaats: "Roosendaal", status: "BESCHIKBAAR", actief: true, vraagprijs: 300000, transactieprijs: null, transactiedatum: null,
  transportdatum: null, publicatiedatum: "2026-02-01", gekoppeldeMakelaarCode: "116177", realworksGewijzigdOp: null, ...o,
});

describe("pastBijObject", () => {
  const w = { datum: "2026-01-12", locatie: "4701 AB  Roosendaal Steenovenstraat 5", projectcode: "RL103486" };

  it("koppelt op projectcode", () => {
    expect(pastBijObject(w, object())).toBe(true);
    expect(pastBijObject({ ...w, locatie: "" }, object())).toBe(true);
  });

  it("koppelt anders op adres en plaats, als de woning ná de waardebepaling is gepubliceerd", () => {
    expect(pastBijObject({ ...w, projectcode: null }, object({ objectcode: "ANDERS" }))).toBe(true);
    expect(pastBijObject({ ...w, projectcode: null }, object({ objectcode: "ANDERS", huisnummertoevoeging: "A" }))).toBe(false);
    expect(pastBijObject({ ...w, projectcode: null }, object({ objectcode: "ANDERS", plaats: "Wouw" }))).toBe(false);
    expect(pastBijObject({ ...w, projectcode: null }, object({ objectcode: "ANDERS", publicatiedatum: "2025-12-01" }))).toBe(false);
    expect(pastBijObject({ ...w, projectcode: null }, object({ objectcode: "ANDERS", publicatiedatum: null }))).toBe(true);
  });

  it("is niet gevoelig voor hoofdletters en dubbele spaties", () => {
    expect(pastBijObject({ ...w, projectcode: null, locatie: "4701 AB  ROOSENDAAL  steenovenstraat 5" }, object({ objectcode: "X" }))).toBe(true);
  });
});

describe("locatieBevatAdres", () => {
  it("vindt een Excel-adres terug in de locatie van Realworks", () => {
    expect(locatieBevatAdres("4701 AB  Roosendaal Steenovenstraat 5", "Steenovenstraat 5", "Roosendaal")).toBe(true);
    expect(locatieBevatAdres("4701 AB  Roosendaal Steenovenstraat 5", "steenovenstraat 5")).toBe(true);
    expect(locatieBevatAdres("4701 AB  Roosendaal Steenovenstraat 55", "Steenovenstraat 5")).toBe(false);
    expect(locatieBevatAdres("4701 AB  Roosendaal Steenovenstraat 5", "Steenovenstraat 5", "Wouw")).toBe(false);
    expect(locatieBevatAdres(null, "Steenovenstraat 5")).toBe(false);
  });
});

describe("excelRijNaarWaardebepaling", () => {
  it("zet een rij uit de Waardebepaallijst om, met de status als code", () => {
    expect(excelRijNaarWaardebepaling({ rij: 2, datum: new Date(Date.UTC(2026, 0, 2)), makelaar: "Lisa", adres: "Steenovenstraat 5", plaats: "Roosendaal", status: "Oriënterend ", verlorenAan: null, via: "Telefonisch" })).toEqual({
      importRij: 2, datum: "2026-01-02", makelaar: "Lisa", adres: "Steenovenstraat 5", plaats: "Roosendaal", status: "orienterend", verlorenAan: null, binnengehaaldVia: "Telefonisch",
    });
  });

  it("kent alle statussen uit de Excel", () => {
    const status = (s: string) => excelRijNaarWaardebepaling({ rij: 1, datum: new Date(Date.UTC(2026, 0, 2)), makelaar: "A", adres: "X 1", plaats: "Y", status: s, verlorenAan: "Vermunt", via: null })?.status;
    expect(status("Gewonnen")).toBe("gewonnen");
    expect(status("In afwachting")).toBe("in_afwachting");
    expect(status("Verloren")).toBe("verloren");
    expect(status("Blijven er wonen")).toBe("blijft_wonen");
    expect(status("Uit de verkoop gehaald")).toBe("uit_verkoop");
    expect(status("Zelf verkocht")).toBe("zelf_verkocht");
    expect(status("Staat bij andere makelaar")).toBe("andere_makelaar");
    expect(status("")).toBe("in_afwachting");
    expect(() => status("Onzin")).toThrow(/rij 1/);
  });

  it("slaat rijen zonder datum of adres over", () => {
    expect(excelRijNaarWaardebepaling({ rij: 3, datum: null, makelaar: "A", adres: "X 1", plaats: "Y", status: "Gewonnen", verlorenAan: null, via: null })).toBeNull();
    expect(excelRijNaarWaardebepaling({ rij: 3, datum: new Date(), makelaar: "A", adres: null, plaats: "Y", status: "Gewonnen", verlorenAan: null, via: null })).toBeNull();
  });
});

describe("valideerWaardebepalingInvoer", () => {
  it("accepteert een status met toelichting", () => {
    expect(valideerWaardebepalingInvoer({ status: "verloren", verlorenAan: " Vermunt ", binnengehaaldVia: "Telefonisch" })).toEqual({
      ok: true, waarde: { status: "verloren", verlorenAan: "Vermunt", binnengehaaldVia: "Telefonisch" },
    });
  });

  it("weigert een onbekende status en maakt 'verloren aan' leeg als de status niet verloren is", () => {
    expect(valideerWaardebepalingInvoer({ status: "misschien", verlorenAan: "", binnengehaaldVia: "" })).toEqual({ ok: false, fouten: { status: "Kies een status." } });
    const r = valideerWaardebepalingInvoer({ status: "gewonnen", verlorenAan: "Vermunt", binnengehaaldVia: "" });
    expect(r.ok && r.waarde).toEqual({ status: "gewonnen", verlorenAan: null, binnengehaaldVia: null });
  });
});

describe("waardebepalingDashboard", () => {
  const regel = (o: Partial<Waardebepaling>): Waardebepaling => ({
    id: "x", datum: "2026-01-10", adres: "A 1", plaats: "P", makelaar: "Lisa", status: "in_afwachting", verlorenAan: null, binnengehaaldVia: null, objectId: null, ...o,
  });
  const regels = [
    regel({ status: "gewonnen", binnengehaaldVia: "Telefonisch" }),
    regel({ status: "gewonnen", datum: "2026-02-03", binnengehaaldVia: "Telefonisch" }),
    regel({ status: "verloren", datum: "2026-02-20", makelaar: "Coen", verlorenAan: "Vermunt", binnengehaaldVia: "Eigen netwerk" }),
    regel({ status: "in_afwachting", datum: "2026-03-01", makelaar: "Coen" }),
    regel({ status: "orienterend", datum: "2026-03-02" }),
    regel({ status: "blijft_wonen", datum: "2026-03-03" }),
    regel({ status: "gewonnen", datum: "2025-01-15" }),
    regel({ status: "verloren", datum: "2025-03-15" }),
    regel({ status: "gewonnen", datum: "2026-04-15" }),
  ];
  const d = waardebepalingDashboard({ regels, jaar: 2026, totEnMetMaand: 3 });

  it("telt waardebepalingen per maand, dit jaar tot en met de huidige maand en vorig jaar volledig", () => {
    expect(d.perMaand.ditJaar.slice(0, 5)).toEqual([1, 2, 3, null, null]);
    expect(d.perMaand.gewonnenDitJaar.slice(0, 4)).toEqual([1, 1, 0, null]);
    expect(d.perMaand.vorigJaar[0]).toBe(1);
    expect(d.perMaand.vorigJaar[2]).toBe(1);
  });

  it("geeft de score per makelaar als gewonnen gedeeld door gewonnen plus verloren, zoals de Excel", () => {
    expect(d.perMakelaar).toEqual([
      { naam: "Lisa", aantal: 4, gewonnen: 2, verloren: 0, open: 1, score: 1 },
      { naam: "Coen", aantal: 2, gewonnen: 0, verloren: 1, open: 1, score: 0 },
    ]);
  });

  it("rekent de kerncijfers over dezelfde maanden in beide jaren", () => {
    expect(d.kern).toEqual({ aantal: 6, aantalVorigJaar: 2, gewonnen: 2, verloren: 1, score: 2 / 3, scoreVorigJaar: 0.5, open: 2 });
  });

  it("telt hoe de waardebepalingen zijn binnengehaald", () => {
    expect(d.via).toEqual([
      { naam: "Telefonisch", aantal: 2 },
      { naam: "Eigen netwerk", aantal: 1 },
      { naam: "Onbekend", aantal: 3 },
    ]);
  });
});
