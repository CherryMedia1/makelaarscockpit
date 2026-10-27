import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citaatKomtVoor, documentAlsTekst, extractieBerichten, kostenEur } from "./extractie";
import { naarVeldvoorstellen } from "./schema";

const transcript = readFileSync(new URL("../../fixtures/intake/dossier-01/transcript.txt", import.meta.url), "utf8");
const extractie: unknown = JSON.parse(readFileSync(new URL("../../fixtures/intake/dossier-01/extractie.json", import.meta.url), "utf8"));

describe("documentAlsTekst", () => {
  it("zet de tekst per pagina onder een kop, met de spans uit Content Understanding", () => {
    const markdown = "Bouwjaar 1978\nHoekwoning\nCv Remeha";
    expect(documentAlsTekst({ markdown, pages: [{ pageNumber: 1, spans: [{ offset: 0, length: 24 }] }, { pageNumber: 2, spans: [{ offset: 25, length: 10 }] }] }))
      .toBe("=== Pagina 1 ===\nBouwjaar 1978\nHoekwoning\n\n=== Pagina 2 ===\nCv Remeha");
  });

  it("telt spans in tekens (codepoints), ook na een emoji of ander teken buiten het basisbereik", () => {
    const markdown = "👍 ok\nTweede";
    expect(documentAlsTekst({ markdown, pages: [{ pageNumber: 1, spans: [{ offset: 0, length: 4 }] }, { pageNumber: 2, spans: [{ offset: 5, length: 6 }] }] }))
      .toBe("=== Pagina 1 ===\n👍 ok\n\n=== Pagina 2 ===\nTweede");
  });

  it("valt zonder pagina-informatie terug op de hele tekst als pagina 1", () => {
    expect(documentAlsTekst({ markdown: "Alles" })).toBe("=== Pagina 1 ===\nAlles");
    expect(documentAlsTekst({ markdown: "Alles", pages: [{ pageNumber: 1 }] })).toBe("=== Pagina 1 ===\nAlles");
  });
});

describe("extractieBerichten", () => {
  it("geeft een systeembericht met de werkwijze en de bron als gebruikersbericht", () => {
    const [systeem, gebruiker] = extractieBerichten("transcript", transcript);
    expect(systeem!.role).toBe("system");
    expect(systeem!.content).toContain("letterlijk");
    expect(gebruiker!.role).toBe("user");
    expect(gebruiker!.content).toContain("intakegesprek");
    expect(gebruiker!.content).toContain(transcript.trim());
  });

  it("noemt bij een document de paginakoppen in plaats van tijdstempels", () => {
    expect(extractieBerichten("document", "=== Pagina 1 ===\nx")[1]!.content).toContain("=== Pagina N ===");
  });
});

describe("citaatKomtVoor", () => {
  it("vindt een citaat ongeacht hoofdletters, witruimte en typografische aanhalingstekens", () => {
    expect(citaatKomtVoor(transcript, "die is van onszelf,   niet gehuurd")).toBe(true);
    expect(citaatKomtVoor("Hij zei: ‘prima’", "Hij zei: 'Prima'")).toBe(true);
    expect(citaatKomtVoor(transcript, "de ketel is gehuurd")).toBe(false);
  });
});

describe("naarVeldvoorstellen met brontekst", () => {
  it("houdt het opgenomen modelantwoord heel: elk citaat staat in het transcript", () => {
    expect(naarVeldvoorstellen(extractie, undefined, transcript).weggegooid).toEqual([]);
  });

  it("gooit een veld weg waarvan het citaat niet in de bron staat", () => {
    const { voorstellen, weggegooid } = naarVeldvoorstellen(
      { object: { bouwjaar: { waarde: 1980, bewijs: { citaat: "gebouwd in 1980", tijdstempel: null, pagina: null }, zekerheid: 0.9 } } },
      undefined,
      transcript,
    );
    expect(voorstellen).toEqual([]);
    expect(weggegooid).toEqual([{ pad: "object.bouwjaar", reden: "citaat niet in bron" }]);
  });
});

describe("kostenEur", () => {
  it("rekent met de tarieven per miljoen tokens, met korting op gecachete invoer", () => {
    expect(kostenEur("gpt-5.4", { input: 1_000_000, gecachet: 0, output: 0 })).toBeCloseTo(2.4199, 4);
    expect(kostenEur("gpt-5.4", { input: 1_000_000, gecachet: 1_000_000, output: 1_000_000 })).toBeCloseTo(0.242 + 14.5195, 4);
    expect(kostenEur("gpt-5.4-mini", { input: 20_000, gecachet: 0, output: 5_000 })).toBeCloseTo(0.0363, 4);
  });

  it("weigert een onbekend model, zodat kosten nooit stilletjes op nul uitkomen", () => {
    expect(() => kostenEur("gpt-9", { input: 1, gecachet: 0, output: 1 })).toThrow("onbekend model");
  });
});
