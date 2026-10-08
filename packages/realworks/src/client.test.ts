import { describe, expect, it, vi } from "vitest";
import { RealworksFout, haalAgendapunten, haalMedewerkers, haalWonenObjecten, naarAgendapunt, naarMedewerker, naarObject } from "./index";

// Verzonnen antwoorden in de vorm van de echte API (zie examples/wonen-object-velden.md); geen echte gegevens.
const wonenObject = (id: number, overdracht: Record<string, unknown> = {}) => ({
  id,
  actief: true,
  tijdstipLaatsteWijziging: "2026-09-30 13:47:09",
  adres: { straat: "Voorbeeldstraat", huisnummer: { hoofdnummer: 12, toevoeging: "A" }, postcode: "4701 AA", plaats: "ROOSENDAAL" },
  marketing: { publicatiedatum: "2026-09-30 06:00:00" },
  algemeen: { gekoppeldeMakelaar: "108886" },
  diversen: { diversen: { objectcode: "OBJ-1", afdelingscode: "935773" } },
  financieel: { overdracht: { status: "BESCHIKBAAR", koopprijs: 319000, transactieprijs: null, transactiedatum: null, transportdatum: null, ...overdracht } },
});

const antwoord = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("naarObject", () => {
  it("neemt de velden over die wij bewaren", () => {
    expect(naarObject(wonenObject(1))).toEqual({
      realworksId: 1, objectcode: "OBJ-1", afdelingscode: "935773",
      straat: "Voorbeeldstraat", huisnummer: "12", huisnummertoevoeging: "A", postcode: "4701 AA", plaats: "ROOSENDAAL",
      status: "BESCHIKBAAR", actief: true, vraagprijs: 319000, transactieprijs: null, transactiedatum: null, transportdatum: null,
      publicatiedatum: "2026-09-30", gekoppeldeMakelaarCode: "108886", realworksGewijzigdOp: "2026-09-30 13:47:09",
      heeftFotos: false, heeftPlattegrond: false, energieklasse: null, heeftTekst: false,
    });
  });

  it("leest de signalen voor de checklist: mediasoorten, energielabel en tekst", () => {
    const o = naarObject({
      ...wonenObject(4),
      media: [{ soort: "HOOFDFOTO" }, { soort: "FOTO" }, { soort: "PLATTEGROND" }, { soort: "DOCUMENT" }],
      algemeen: { gekoppeldeMakelaar: "108886", energieklasse: "A_P" },
      teksten: { aanbiedingstekst: "Een verzonnen tekst." },
    });
    expect(o).toMatchObject({ heeftFotos: true, heeftPlattegrond: true, energieklasse: "A_P", heeftTekst: true });
    expect(naarObject({ ...wonenObject(5), media: [{ soort: "DOCUMENT" }], teksten: { aanbiedingstekst: "  " } })).toMatchObject({ heeftFotos: false, heeftTekst: false });
  });

  it("kort datums met tijd in tot de datum en laat lege toevoegingen weg", () => {
    const o = naarObject({ ...wonenObject(2, { status: "VERKOCHT", transactieprijs: 310000, transactiedatum: "2026-08-14 00:00:00", transportdatum: "2026-10-01" }), adres: { straat: "Proeflaan", huisnummer: { hoofdnummer: 8, toevoeging: "" }, postcode: "4702 BB", plaats: "ROOSENDAAL" } });
    expect(o).toMatchObject({ transactiedatum: "2026-08-14", transportdatum: "2026-10-01", transactieprijs: 310000, huisnummertoevoeging: null });
  });

  it("verdraagt ontbrekende secties", () => {
    expect(naarObject({ id: 3 })).toMatchObject({ realworksId: 3, straat: null, status: null, vraagprijs: null, actief: null });
  });

  it("weigert een object zonder id", () => {
    expect(() => naarObject({ adres: {} })).toThrow(/id/);
  });
});

describe("naarMedewerker", () => {
  it("bouwt de weergavenaam uit roepnaam, tussenvoegsel en achternaam", () => {
    expect(naarMedewerker({ id: 21561647, roepnaam: "Sam", tussenvoegsel: "van", achternaam: "Voorbeeld", overige: { relatiecode: "116177" } })).toEqual({
      realworksId: 21561647, relatiecode: "116177", weergavenaam: "Sam van Voorbeeld", roepnaam: "Sam", tussenvoegsel: "van", achternaam: "Voorbeeld",
    });
    expect(naarMedewerker({ id: 7, achternaam: "Zonder" }).relatiecode).toBeNull();
    expect(naarMedewerker({ id: 5, roepnaam: "", tussenvoegsel: null, achternaam: "Test" }).weergavenaam).toBe("Test");
    expect(naarMedewerker({ id: 6 }).weergavenaam).toBe("Medewerker 6");
  });
});

describe("haalWonenObjecten", () => {
  it("volgt de paginering en stuurt het rwauth-token mee", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(antwoord({ resultaten: [wonenObject(1), wonenObject(2)], paginering: { volgende: "https://api.realworks.nl/wonen/v3/objecten?aantal=2&vanaf=2", totaalAantal: 3 } }))
      .mockResolvedValueOnce(antwoord({ resultaten: [wonenObject(3)], paginering: { totaalAantal: 3 } }));
    const paginas = [];
    for await (const pagina of haalWonenObjecten({ token: async () => "geheim", fetch }, { aantal: 2 })) paginas.push(pagina);

    expect(paginas.map((p) => p.objecten.map((o) => o.realworksId))).toEqual([[1, 2], [3]]);
    expect(paginas[0]?.totaal).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.realworks.nl/wonen/v3/objecten?aantal=2");
    expect(fetch.mock.calls[1]![0]).toBe("https://api.realworks.nl/wonen/v3/objecten?aantal=2&vanaf=2");
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe("rwauth geheim");
  });

  it("volgt geen paginering naar een andere host", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(antwoord({ resultaten: [wonenObject(1)], paginering: { volgende: "https://elders.example/wonen?vanaf=1" } }));
    await expect(async () => {
      for await (const pagina of haalWonenObjecten({ token: async () => "geheim", fetch })) void pagina;
    }).rejects.toThrow(/host/);
  });

  it("geeft bij een fout de status en het pad, zonder de inhoud van het antwoord of het token", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(antwoord({ error: "Voor dit token is een IP bereik opgegeven, persoon@voorbeeld.nl" }, 403));
    const poging = (async () => {
      for await (const pagina of haalWonenObjecten({ token: async () => "geheim", fetch })) void pagina;
    })();
    await expect(poging).rejects.toBeInstanceOf(RealworksFout);
    await expect(poging).rejects.toMatchObject({ status: 403, message: expect.not.stringContaining("voorbeeld.nl") });
    await expect(poging).rejects.toMatchObject({ message: expect.not.stringContaining("geheim") });
  });
});

describe("haalMedewerkers", () => {
  it("haalt alle medewerkers op", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(antwoord({ resultaten: [{ id: 1, roepnaam: "A", achternaam: "B" }], paginering: { totaalAantal: 1 } }));
    const medewerkers = await haalMedewerkers({ token: async () => "geheim", fetch });
    expect(medewerkers).toHaveLength(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.realworks.nl/relaties/v1/medewerker?aantal=100");
  });
});

describe("naarAgendapunt", () => {
  it("leest type, tijden, locatie, projectcode en de gekoppelde medewerker en relatie", () => {
    const ruw = {
      id: 239641166, agendatype: "Waardebepaling", status: "Definitief", begintijd: "2026-01-12 16:00:00", eindtijd: "2026-01-12 17:00:00",
      locatie: "4701 AB  Roosendaal Steenovenstraat 5", project: { projectcode: "RL103486", type: "WONEN" }, tijdstipLaatsteWijziging: "2026-01-12 16:46:13",
      relaties: [{ id: 41785305, type: "Id van de gekoppelde relatie" }, { id: 39227406, type: "Agendapunt voor" }, { id: 28253291, type: "Geplaatst door (medewerker)" }],
      extraInfo: "notities die wij niet bewaren",
    };
    expect(naarAgendapunt(ruw)).toEqual({
      realworksId: 239641166, agendatype: "Waardebepaling", status: "Definitief", begintijd: "2026-01-12 16:00:00", eindtijd: "2026-01-12 17:00:00",
      locatie: "4701 AB  Roosendaal Steenovenstraat 5", projectcode: "RL103486", projecttype: "WONEN", medewerkerRealworksId: 39227406, relatieId: 41785305, realworksGewijzigdOp: "2026-01-12 16:46:13",
    });
  });

  it("werkt met lege velden en een relatie zonder id", () => {
    expect(naarAgendapunt({ id: 1, agendatype: "", locatie: "", relaties: [{ id: null, type: "Id van de gekoppelde relatie" }] })).toMatchObject({
      realworksId: 1, agendatype: null, locatie: null, projectcode: null, medewerkerRealworksId: null, relatieId: null,
    });
    expect(() => naarAgendapunt({})).toThrow("agendapunt zonder id");
  });
});

describe("haalAgendapunten", () => {
  it("haalt de agenda van een afdeling op met paginering", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("?aantal=100")) return antwoord({ resultaten: [{ id: 1, agendatype: "Waardebepaling" }], paginering: { totaalAantal: 2, volgende: "https://api.realworks.nl/agenda/v3/afdeling/935773?aantal=100&vanaf=x" } });
      return antwoord({ resultaten: [{ id: 2, agendatype: "1e bezichtiging" }], paginering: { totaalAantal: 2 } });
    });
    const paginas = [];
    for await (const p of haalAgendapunten({ token: async () => "geheim", fetch: fetch as unknown as typeof globalThis.fetch }, "935773")) paginas.push(p);
    expect(paginas).toHaveLength(2);
    expect(paginas[0]!.agendapunten[0]!.realworksId).toBe(1);
    expect(paginas[0]!.totaal).toBe(2);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.realworks.nl/agenda/v3/afdeling/935773?aantal=100");
  });
});
