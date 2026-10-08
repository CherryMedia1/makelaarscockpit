import { describe, expect, it } from "vitest";
import {
  bepaalStappen, excelCelNaarStap, faseVanObject, stappenVoorSpoor, valideerStapInvoer, voortgang, woningenInVoorbereiding,
  type AgendaSignaal, type RealworksSignalen,
} from "./woningen";

const VANDAAG = "2026-10-08";
const leeg: RealworksSignalen = { heeftFotos: false, heeftPlattegrond: false, energieklasse: null, heeftTekst: false, publicatiedatum: null, transportdatum: null, agenda: [] };
const stap = (uitkomst: ReturnType<typeof bepaalStappen>, sleutel: string) => uitkomst.find((s) => s.sleutel === sleutel)!;

describe("stappenVoorSpoor", () => {
  it("geeft de elf stappen uit de Excel 'Woningen in verkoop', in dezelfde volgorde", () => {
    expect(stappenVoorSpoor("verkoop").map((s) => s.sleutel)).toEqual([
      "fotos", "video", "energielabel", "styling", "tekst", "woningzoeker", "socials", "funda", "reel", "bord", "verkoopgesprek",
    ]);
  });
});

describe("bepaalStappen", () => {
  it("zet alles op open als Realworks niets weet en er niets is ingevuld", () => {
    const u = bepaalStappen("verkoop", leeg, [], VANDAAG);
    expect(u).toHaveLength(11);
    expect(u.every((s) => s.status === "open" && s.bron === null && s.datum === null)).toBe(true);
  });

  it("vinkt af wat Realworks ziet: foto's, energielabel, tekst en publicatie", () => {
    const u = bepaalStappen("verkoop", { ...leeg, heeftFotos: true, energieklasse: "A", heeftTekst: true, publicatiedatum: "2026-10-01" }, [], VANDAAG);
    expect(stap(u, "fotos")).toMatchObject({ status: "klaar", bron: "realworks" });
    expect(stap(u, "energielabel")).toMatchObject({ status: "klaar", bron: "realworks" });
    expect(stap(u, "tekst")).toMatchObject({ status: "klaar", bron: "realworks" });
    expect(stap(u, "funda")).toEqual({ sleutel: "funda", status: "klaar", datum: "2026-10-01", bron: "realworks", teLaat: false });
    expect(stap(u, "styling").status).toBe("open");
  });

  it("toont een publicatie in de toekomst als gepland", () => {
    expect(stap(bepaalStappen("verkoop", { ...leeg, publicatiedatum: "2026-10-20" }, [], VANDAAG), "funda")).toMatchObject({ status: "gepland", datum: "2026-10-20", bron: "realworks" });
  });

  it("leest planning uit de agenda: een verkoopgesprek dat geweest is, is klaar; een fotoafspraak in de toekomst is gepland", () => {
    const agenda: AgendaSignaal[] = [
      { type: "Verkoopgesprek", datum: "2026-09-20", status: "Definitief" },
      { type: "Foto's/video maken", datum: "2026-10-15", status: "Definitief" },
      { type: "Video Luna", datum: "2026-10-16", status: "Geannuleerd" },
    ];
    const u = bepaalStappen("verkoop", { ...leeg, agenda }, [], VANDAAG);
    expect(stap(u, "verkoopgesprek")).toMatchObject({ status: "klaar", datum: "2026-09-20", bron: "realworks" });
    expect(stap(u, "fotos")).toMatchObject({ status: "gepland", datum: "2026-10-15", bron: "realworks" });
    expect(stap(u, "video").status).toBe("open");
  });

  it("een fotoafspraak die geweest is zonder foto's in Realworks blijft open", () => {
    const u = bepaalStappen("verkoop", { ...leeg, agenda: [{ type: "Foto's/video maken", datum: "2026-10-01", status: "Definitief" }] }, [], VANDAAG);
    expect(stap(u, "fotos").status).toBe("open");
  });

  it("neemt handmatige invoer over voor stappen die Realworks niet kent", () => {
    const u = bepaalStappen("verkoop", leeg, [{ stap: "styling", status: "nvt", datum: null }, { stap: "bord", status: "gepland", datum: "2026-10-12" }, { stap: "reel", status: "klaar", datum: "2026-10-02" }], VANDAAG);
    expect(stap(u, "styling")).toMatchObject({ status: "nvt", bron: "handmatig" });
    expect(stap(u, "bord")).toMatchObject({ status: "gepland", datum: "2026-10-12", bron: "handmatig", teLaat: false });
    expect(stap(u, "reel")).toMatchObject({ status: "klaar", datum: "2026-10-02", bron: "handmatig" });
  });

  it("Realworks is leidend: klaar volgens Realworks wint van handmatige invoer", () => {
    const u = bepaalStappen("verkoop", { ...leeg, heeftTekst: true }, [{ stap: "tekst", status: "nvt", datum: null }], VANDAAG);
    expect(stap(u, "tekst")).toMatchObject({ status: "klaar", bron: "realworks" });
  });

  it("handmatig klaar wint van een planning uit de agenda", () => {
    const u = bepaalStappen("verkoop", { ...leeg, agenda: [{ type: "Foto's/video maken", datum: "2026-10-15", status: "Definitief" }] }, [{ stap: "fotos", status: "klaar", datum: "2026-10-07" }], VANDAAG);
    expect(stap(u, "fotos")).toMatchObject({ status: "klaar", bron: "handmatig" });
  });

  it("markeert een handmatig geplande stap met een datum in het verleden als te laat", () => {
    expect(stap(bepaalStappen("verkoop", leeg, [{ stap: "bord", status: "gepland", datum: "2026-10-01" }], VANDAAG), "bord")).toMatchObject({ status: "gepland", teLaat: true });
  });
});

describe("voortgang", () => {
  it("telt klaar en niet van toepassing als afgerond", () => {
    const u = bepaalStappen("verkoop", { ...leeg, heeftFotos: true }, [{ stap: "styling", status: "nvt", datum: null }, { stap: "bord", status: "gepland", datum: "2026-10-12" }], VANDAAG);
    expect(voortgang(u)).toEqual({ afgerond: 2, totaal: 11, open: 9 });
  });
});

describe("faseVanObject", () => {
  it("leidt de fase af van de status in Realworks", () => {
    expect(faseVanObject("BESCHIKBAAR")).toBe("in_verkoop");
    expect(faseVanObject("ONDER_BOD")).toBe("in_verkoop");
    expect(faseVanObject("VERKOCHT_ONDER_VOORBEHOUD")).toBe("verkocht_ov");
    expect(faseVanObject("VERKOCHT")).toBe("verkocht");
    expect(faseVanObject("INGETROKKEN_TIJDELIJK")).toBeNull();
    expect(faseVanObject("VERHUURD")).toBeNull();
    expect(faseVanObject(null)).toBe("in_verkoop");
  });
});

describe("woningenInVoorbereiding", () => {
  const punt = (o: Partial<Parameters<typeof woningenInVoorbereiding>[0][number]>) => ({
    projectcode: "RL200001", projecttype: "WONEN", agendatype: "Verkoopgesprek", datum: "2026-09-25", status: "Definitief",
    locatie: "4701 AB  Roosendaal Voorbeeldstraat 1", medewerkerRealworksId: 39227406, ...o,
  });

  it("herkent een woning in voorbereiding aan een recent verkoopgesprek of fotoafspraak zonder object in Realworks", () => {
    const r = woningenInVoorbereiding([punt({}), punt({ agendatype: "Foto's/video maken", datum: "2026-10-12" })], new Set(), VANDAAG);
    expect(r).toEqual([{ projectcode: "RL200001", locatie: "4701 AB  Roosendaal Voorbeeldstraat 1", medewerkerRealworksId: 39227406 }]);
  });

  it("slaat woningen over die Realworks al als object kent, oude afspraken, andere types en geannuleerde afspraken", () => {
    expect(woningenInVoorbereiding([punt({})], new Set(["RL200001"]), VANDAAG)).toEqual([]);
    expect(woningenInVoorbereiding([punt({ datum: "2026-06-01" })], new Set(), VANDAAG)).toEqual([]);
    expect(woningenInVoorbereiding([punt({ agendatype: "1e bezichtiging" })], new Set(), VANDAAG)).toEqual([]);
    expect(woningenInVoorbereiding([punt({ status: "Geannuleerd" })], new Set(), VANDAAG)).toEqual([]);
    expect(woningenInVoorbereiding([punt({ projecttype: "NIEUWBOUW" })], new Set(), VANDAAG)).toEqual([]);
    expect(woningenInVoorbereiding([punt({ projectcode: null })], new Set(), VANDAAG)).toEqual([]);
  });
});

describe("excelCelNaarStap", () => {
  it("leest de vrije tekst uit de Excel: V is klaar, X is niet van toepassing, een datum is klaar of gepland", () => {
    expect(excelCelNaarStap("V", VANDAAG)).toEqual({ status: "klaar", datum: null });
    expect(excelCelNaarStap(" ja ", VANDAAG)).toEqual({ status: "klaar", datum: null });
    expect(excelCelNaarStap("V 27-8 Luna", VANDAAG)).toEqual({ status: "klaar", datum: null });
    expect(excelCelNaarStap("x", VANDAAG)).toEqual({ status: "nvt", datum: null });
    expect(excelCelNaarStap("NVT", VANDAAG)).toEqual({ status: "nvt", datum: null });
    expect(excelCelNaarStap(new Date(Date.UTC(2026, 8, 30)), VANDAAG)).toEqual({ status: "klaar", datum: "2026-09-30" });
    expect(excelCelNaarStap(new Date(Date.UTC(2026, 9, 20)), VANDAAG)).toEqual({ status: "gepland", datum: "2026-10-20" });
  });

  it("laat onduidelijke tekst en lege cellen open", () => {
    expect(excelCelNaarStap("Zibber", VANDAAG)).toBeNull();
    expect(excelCelNaarStap("nog indienen", VANDAAG)).toBeNull();
    expect(excelCelNaarStap("Verder afstemmen", VANDAAG)).toBeNull();
    expect(excelCelNaarStap("", VANDAAG)).toBeNull();
    expect(excelCelNaarStap(null, VANDAAG)).toBeNull();
  });
});

describe("valideerStapInvoer", () => {
  it("accepteert een status, met een datum bij gepland of klaar", () => {
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "gepland", datum: "2026-10-12" })).toEqual({ ok: true, waarde: { stap: "bord", status: "gepland", datum: "2026-10-12" } });
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "nvt", datum: "2026-10-12" })).toEqual({ ok: true, waarde: { stap: "bord", status: "nvt", datum: null } });
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "klaar", datum: "" })).toEqual({ ok: true, waarde: { stap: "bord", status: "klaar", datum: null } });
  });

  it("weigert een onbekende stap, status of datum", () => {
    expect(valideerStapInvoer("verkoop", { stap: "zwembad", status: "klaar", datum: "" })).toEqual({ ok: false, fout: "Deze stap bestaat niet." });
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "bijna", datum: "" })).toEqual({ ok: false, fout: "Kies een status." });
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "gepland", datum: "12-10-2026" })).toEqual({ ok: false, fout: "Vul een geldige datum in." });
    expect(valideerStapInvoer("verkoop", { stap: "bord", status: "gepland", datum: "" })).toEqual({ ok: false, fout: "Vul bij 'gepland' een datum in." });
  });
});
