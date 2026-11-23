import { describe, expect, it } from "vitest";
import type { AgendapuntGegevens } from "../realworks-gegevens";
import { filterLeads, groepeerLeads, isBezichtigingType, leadCijfers, naarBezichtiging, type BezichtigingRegel } from "./bezichtigers";

const VANDAAG = "2026-11-23";
const MEDEWERKERS = new Set([900, 901]);

const agendapunt = (over: Partial<AgendapuntGegevens> = {}): AgendapuntGegevens => ({
  realworksId: 1, agendatype: "1e bezichtiging", status: "Definitief", begintijd: "2026-11-10 14:00:00", eindtijd: "2026-11-10 14:30:00",
  locatie: "1234 AB  Testdorp Proefstraat 1", projectcode: "P-1", projecttype: "WONEN", medewerkerRealworksId: 900, relatieId: 5001, realworksGewijzigdOp: null, ...over,
});

let teller = 0;
const regel = (over: Partial<BezichtigingRegel> = {}): BezichtigingRegel => ({
  id: `b-${(teller += 1)}`, bezichtigerId: "r-1", naam: "Test Persoon", agendatype: "1e bezichtiging", status: "Definitief", tijdstip: "2026-11-10 14:00",
  projectcode: "P-1", woning: "Proefstraat 1, Testdorp", makelaar: "Makelaar A", ...over,
});

describe("isBezichtigingType", () => {
  it("herkent alle soorten bezichtigingen, ook uit de planner, aankoop, huur en open huis", () => {
    for (const type of ["1e bezichtiging", "2e bezichtiging", "Bezichtiging (planner)", "Bezichtigingsblok (planner)", "Aankoop bezichtiging (incl. makelaar)", "Huur bezichtiging", "Open Huis"]) {
      expect(isBezichtigingType(type)).toBe(true);
    }
  });

  it("herkent andere afspraken niet", () => {
    for (const type of ["Waardebepaling", "Verkoopgesprek", "Privé", "", null]) expect(isBezichtigingType(type)).toBe(false);
  });
});

describe("naarBezichtiging", () => {
  it("neemt type, moment, project en de gekoppelde relatie over, zonder notities", () => {
    expect(naarBezichtiging(agendapunt(), MEDEWERKERS)).toEqual({
      realworksId: 1, relatieId: 5001, agendatype: "1e bezichtiging", status: "Definitief", tijdstip: "2026-11-10 14:00:00",
      projectcode: "P-1", projecttype: "WONEN", locatie: "1234 AB  Testdorp Proefstraat 1", medewerkerRealworksId: 900,
    });
  });

  it("slaat afspraken over die geen bezichtiging zijn, geen moment of geen gekoppelde relatie hebben", () => {
    expect(naarBezichtiging(agendapunt({ agendatype: "Waardebepaling" }), MEDEWERKERS)).toBeNull();
    expect(naarBezichtiging(agendapunt({ begintijd: null }), MEDEWERKERS)).toBeNull();
    expect(naarBezichtiging(agendapunt({ relatieId: null }), MEDEWERKERS)).toBeNull();
  });

  it("telt een medewerker als gekoppelde relatie niet als lead (bijvoorbeeld een bezichtigingsblok)", () => {
    expect(naarBezichtiging(agendapunt({ agendatype: "Bezichtigingsblok (planner)", relatieId: 901 }), MEDEWERKERS)).toBeNull();
  });

  it("slaat geannuleerde afspraken over", () => {
    expect(naarBezichtiging(agendapunt({ status: "Geannuleerd" }), MEDEWERKERS)).toBeNull();
  });
});

describe("groepeerLeads", () => {
  it("zet alle bezichtigingen van dezelfde relatie op één lead", () => {
    const leads = groepeerLeads(
      [
        regel({ tijdstip: "2026-10-01 10:00", projectcode: "P-1" }),
        regel({ tijdstip: "2026-11-10 14:00", projectcode: "P-2", woning: "Voorbeeldlaan 8, Testdorp", makelaar: "Makelaar B" }),
        regel({ bezichtigerId: "r-2", naam: "Ander Persoon", tijdstip: "2026-11-05 09:00" }),
      ],
      VANDAAG,
    );
    expect(leads).toHaveLength(2);
    const eerste = leads[0]!;
    expect(eerste).toMatchObject({ bezichtigerId: "r-1", naam: "Test Persoon", aantal: 2, aantalWoningen: 2, eerste: "2026-10-01 10:00", laatste: "2026-11-10 14:00", komende: null });
    expect(eerste.makelaars).toEqual(["Makelaar B", "Makelaar A"]);
    expect(eerste.bezichtigingen.map((b) => b.tijdstip)).toEqual(["2026-11-10 14:00", "2026-10-01 10:00"]);
  });

  it("sorteert op de meest recente bezichtiging, nieuwste eerst", () => {
    const leads = groepeerLeads([regel({ bezichtigerId: "oud", tijdstip: "2026-01-05 09:00" }), regel({ bezichtigerId: "nieuw", tijdstip: "2026-11-20 09:00" })], VANDAAG);
    expect(leads.map((l) => l.bezichtigerId)).toEqual(["nieuw", "oud"]);
  });

  it("onderscheidt een geplande bezichtiging van wat al geweest is", () => {
    const [lead] = groepeerLeads([regel({ tijdstip: "2026-11-10 14:00" }), regel({ tijdstip: "2026-11-23 16:00" }), regel({ tijdstip: "2026-12-01 10:00" })], VANDAAG);
    // Een afspraak van vandaag telt als geweest; pas vanaf morgen is het een komende bezichtiging.
    expect(lead).toMatchObject({ aantal: 3, laatste: "2026-11-23 16:00", komende: "2026-12-01 10:00" });
  });

  it("geeft een lead met alleen een geplande bezichtiging geen laatste bezichtiging", () => {
    const [lead] = groepeerLeads([regel({ tijdstip: "2026-12-01 10:00" })], VANDAAG);
    expect(lead).toMatchObject({ laatste: null, komende: "2026-12-01 10:00" });
  });

  it("markeert een tweede bezichtiging en een herhaald bezoek aan dezelfde woning", () => {
    const [tweede] = groepeerLeads([regel({ agendatype: "2e bezichtiging" })], VANDAAG);
    expect(tweede).toMatchObject({ aantal: 1, terugNaarZelfdeWoning: true });
    const [herhaald] = groepeerLeads([regel({ tijdstip: "2026-10-01 10:00" }), regel({ tijdstip: "2026-10-20 10:00" })], VANDAAG);
    expect(herhaald).toMatchObject({ aantal: 2, aantalWoningen: 1, terugNaarZelfdeWoning: true });
    const [verschillend] = groepeerLeads([regel({ projectcode: "P-1" }), regel({ projectcode: "P-2" })], VANDAAG);
    expect(verschillend!.terugNaarZelfdeWoning).toBe(false);
  });

  it("telt bezichtigingen zonder project niet als dezelfde woning", () => {
    const [lead] = groepeerLeads([regel({ projectcode: null, woning: null }), regel({ projectcode: null, woning: null })], VANDAAG);
    expect(lead).toMatchObject({ aantal: 2, aantalWoningen: 0, terugNaarZelfdeWoning: false });
  });
});

describe("filterLeads", () => {
  const leads = groepeerLeads(
    [
      regel({ bezichtigerId: "a", tijdstip: "2026-11-15 10:00", projectcode: "P-1", makelaar: "Makelaar A" }),
      regel({ bezichtigerId: "a", tijdstip: "2026-06-01 10:00", projectcode: "P-2", makelaar: "Makelaar B" }),
      regel({ bezichtigerId: "b", tijdstip: "2026-07-01 10:00", projectcode: "P-2", makelaar: "Makelaar B" }),
    ],
    VANDAAG,
  );
  const ids = (f: Parameters<typeof filterLeads>[1]) => filterLeads(leads, f).map((l) => l.bezichtigerId);

  it("geeft zonder filter alles terug", () => {
    expect(ids({})).toEqual(["a", "b"]);
  });

  it("filtert op periode: een lead telt mee als er een bezichtiging op of na de datum is", () => {
    expect(ids({ vanaf: "2026-11-01" })).toEqual(["a"]);
    expect(ids({ vanaf: "2026-07-01" })).toEqual(["a", "b"]);
  });

  it("filtert op woning en op makelaar", () => {
    expect(ids({ projectcode: "P-1" })).toEqual(["a"]);
    expect(ids({ projectcode: "P-2" })).toEqual(["a", "b"]);
    expect(ids({ makelaar: "Makelaar A" })).toEqual(["a"]);
  });

  it("combineert filters op dezelfde bezichtiging", () => {
    // Lead a zag P-2 in juni, niet sinds november: de combinatie hoort hem niet te tonen.
    expect(ids({ vanaf: "2026-11-01", projectcode: "P-2" })).toEqual([]);
  });

  it("toont op verzoek alleen leads met meerdere bezichtigingen", () => {
    expect(ids({ alleenMeerdere: true })).toEqual(["a"]);
  });
});

describe("leadCijfers", () => {
  it("telt leads, terugkerende leads, recente en komende bezichtigingen", () => {
    const leads = groepeerLeads(
      [
        regel({ bezichtigerId: "a", tijdstip: "2026-11-15 10:00" }),
        regel({ bezichtigerId: "a", tijdstip: "2026-06-01 10:00" }),
        regel({ bezichtigerId: "b", tijdstip: "2026-10-23 10:00" }),
        regel({ bezichtigerId: "c", tijdstip: "2026-12-02 10:00" }),
      ],
      VANDAAG,
    );
    expect(leadCijfers(leads, VANDAAG)).toEqual({ leads: 3, meerdere: 1, bezichtigingenLaatste30Dagen: 1, komend: 1 });
  });
});
