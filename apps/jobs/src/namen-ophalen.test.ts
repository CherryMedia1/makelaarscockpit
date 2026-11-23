import { describe, expect, it } from "vitest";
import { RealworksFout } from "@makelaarscockpit/realworks";
import { haalNamenOp, type NaamUitkomst } from "./namen-ophalen";

// Verzonnen relatie-id's en namen; geen echte gegevens.
function opstelling(gedrag: (relatieId: number, poging: number) => string | null | RealworksFout | Error, budgetMs = 60_000) {
  const bewaard: NaamUitkomst[] = [];
  const pogingen = new Map<number, number>();
  let klok = 0;
  const geslapen: number[] = [];
  return {
    bewaard,
    geslapen,
    start: (ids: number[]) =>
      haalNamenOp(ids, {
        haalNaam: async (relatieId) => {
          const poging = (pogingen.get(relatieId) ?? 0) + 1;
          pogingen.set(relatieId, poging);
          klok += 100;
          const uit = gedrag(relatieId, poging);
          if (uit instanceof Error) throw uit;
          return uit === null ? { gevonden: false } : { gevonden: true, naam: uit };
        },
        bewaar: async (namen) => void bewaard.push(...namen),
        slaap: async (ms) => {
          geslapen.push(ms);
          klok += ms;
        },
        nu: () => klok,
        tegelijk: 2,
        budgetMs,
      }),
  };
}

describe("haalNamenOp", () => {
  it("haalt alle namen op en bewaart ze", async () => {
    const o = opstelling((id) => `Naam ${id}`);
    expect(await o.start([1, 2, 3])).toEqual({ opgehaald: 3, onbekend: 0, geweigerd: 0, open: 0, gestopt: null });
    expect(o.bewaard).toEqual([{ relatieId: 1, naam: "Naam 1" }, { relatieId: 2, naam: "Naam 2" }, { relatieId: 3, naam: "Naam 3" }]);
  });

  it("legt een relatie die niet meer bestaat vast zonder naam", async () => {
    const o = opstelling((id) => (id === 2 ? null : `Naam ${id}`));
    expect(await o.start([1, 2, 3])).toMatchObject({ opgehaald: 2, onbekend: 1, open: 0, gestopt: null });
    expect(o.bewaard).toContainEqual({ relatieId: 2, naam: null });
  });

  it("gaat door als één relatie geweigerd wordt, en legt die vast als niet op te halen", async () => {
    const o = opstelling((id) => (id === 1 ? new RealworksFout(403, "/relaties/v1/{relatieId}") : `Naam ${id}`));
    expect(await o.start([1, 2, 3, 4])).toEqual({ opgehaald: 3, onbekend: 0, geweigerd: 1, open: 0, gestopt: null });
    expect(o.bewaard).toContainEqual({ relatieId: 1, naam: null });
    expect(o.bewaard).toHaveLength(4);
  });

  it("wacht bij een limiet van Realworks en gaat daarna verder", async () => {
    const o = opstelling((id, poging) => (id === 2 && poging === 1 ? new RealworksFout(429, "/relaties/v1/{relatieId}", 3) : `Naam ${id}`));
    expect(await o.start([1, 2, 3])).toEqual({ opgehaald: 3, onbekend: 0, geweigerd: 0, open: 0, gestopt: null });
    expect(o.geslapen).toEqual([3000]);
  });

  it("wacht steeds langer zonder Retry-After en stopt als de limiet blijft", async () => {
    const o = opstelling(() => new RealworksFout(429, "/relaties/v1/{relatieId}"));
    expect(await o.start([1, 2, 3])).toEqual({ opgehaald: 0, onbekend: 0, geweigerd: 0, open: 3, gestopt: "Realworks gaf status 429" });
    expect(o.geslapen).toEqual([2000, 4000, 8000, 16000]);
    expect(o.bewaard).toEqual([]);
  });

  it("legt niets vast als geen enkele naam op te halen is: dan klopt de koppeling niet", async () => {
    const o = opstelling(() => new RealworksFout(403, "/relaties/v1/{relatieId}"));
    const ids = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(await o.start(ids)).toEqual({ opgehaald: 0, onbekend: 0, geweigerd: 0, open: 40, gestopt: "geen enkele naam op te halen (status 403)" });
    expect(o.bewaard).toEqual([]);
  });

  it("legt ook 'niet gevonden' pas vast nadat er een naam is opgehaald", async () => {
    const o = opstelling((id) => (id <= 2 ? null : `Naam ${id}`));
    expect(await o.start([1, 2, 3])).toMatchObject({ opgehaald: 1, onbekend: 2, open: 0 });
    expect(o.bewaard).toHaveLength(3);
    const alleenOnbekend = opstelling(() => null);
    expect(await alleenOnbekend.start([1, 2])).toMatchObject({ opgehaald: 0, onbekend: 0, open: 2, gestopt: "geen enkele naam op te halen (niet gevonden)" });
    expect(alleenOnbekend.bewaard).toEqual([]);
  });

  it("stopt bij een fout van Realworks zelf of een ongeldig token", async () => {
    const o = opstelling((id) => (id === 3 ? new RealworksFout(500, "/relaties/v1/{relatieId}") : `Naam ${id}`));
    expect(await o.start([1, 2, 3, 4, 5, 6])).toMatchObject({ opgehaald: 3, gestopt: "Realworks gaf status 500" });
    const token = opstelling(() => new RealworksFout(401, "/relaties/v1/{relatieId}"));
    expect(await token.start([1, 2])).toMatchObject({ opgehaald: 0, open: 2, gestopt: "Realworks gaf status 401" });
  });

  it("stopt als het tijdsbudget op is; de rest volgt bij de volgende run", async () => {
    const o = opstelling((id) => `Naam ${id}`, 350);
    expect(await o.start([1, 2, 3, 4, 5, 6, 7, 8])).toMatchObject({ opgehaald: 4, open: 4, gestopt: "tijdsbudget op" });
  });

  it("stopt bij een onverwachte fout zonder de melding door te geven", async () => {
    const o = opstelling((id) => (id === 2 ? new Error("iets met een naam erin") : `Naam ${id}`));
    expect(await o.start([1, 2, 3, 4])).toMatchObject({ gestopt: "onverwachte fout" });
  });
});
