// Integratietest tegen een echte PostgreSQL met alle migraties; draait alleen met DB_INTEGRATIE=1 (zie intake.integratie.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leesBezichtigingen, vervangBezichtigingen } from "./bezichtigers";
import {
  bewaarLead, leesLeadKaart, leesLeadStanden, leesPijplijnFases, verwijderLead, zetLeadFase, verwijderPijplijnFase, voegPijplijnFaseToe, wijzigPijplijnFase, zetPijplijnFaseActief,
  zetPijplijnVolgorde,
} from "./pijplijn";
import { maakDb, metTenant, type Db } from "./verbinding";

describe.skipIf(!process.env.DB_INTEGRATIE)("pijplijnfases in de database", () => {
  let db: Db;
  let a: string, b: string;
  const namen = async (t: string) => (await metTenant(db, t, (tx) => leesPijplijnFases(tx, t))).map((f) => f.naam);

  beforeAll(async () => {
    db = maakDb();
    const tenant = async (sleutel: string) => (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [sleutel])).rows[0].id as string;
    a = await tenant(`pijp-test-a-${Date.now()}`);
    b = await tenant(`pijp-test-b-${Date.now()}`);
  });

  afterAll(async () => {
    for (const t of [a, b]) {
      for (const tabel of ["lead_historie", "lead", "bezichtiging", "bezichtiger", "pijplijn_fase", "medewerker", "gebruiker"]) await db.query(`delete from ${tabel} where tenant_id = $1`, [t]);
      await db.query("delete from tenant where id = $1", [t]);
    }
    await db.end();
  });

  it("voegt fases achteraan toe en houdt ze per kantoor gescheiden", async () => {
    await metTenant(db, a, async (tx) => {
      await voegPijplijnFaseToe(tx, a, { naam: "Eerste", soort: "open" });
      await voegPijplijnFaseToe(tx, a, { naam: "Tweede", soort: "open" });
      await voegPijplijnFaseToe(tx, a, { naam: "Gewonnen", soort: "gewonnen" });
    });
    await metTenant(db, b, (tx) => voegPijplijnFaseToe(tx, b, { naam: "Eerste", soort: "open" }));
    expect(await namen(a)).toEqual(["Eerste", "Tweede", "Gewonnen"]);
    expect(await namen(b)).toEqual(["Eerste"]);
    expect(await metTenant(db, b, (tx) => leesPijplijnFases(tx, a))).toEqual([]);
  });

  it("weigert dezelfde naam binnen één kantoor, ongeacht hoofdletters", async () => {
    await expect(metTenant(db, a, (tx) => voegPijplijnFaseToe(tx, a, { naam: "eerste", soort: "open" }))).rejects.toThrow();
  });

  it("wijzigt naam en soort, zet de volgorde en zet een fase uit", async () => {
    const fases = await metTenant(db, a, (tx) => leesPijplijnFases(tx, a));
    const [eerste, tweede, gewonnen] = fases.map((f) => f.id) as [string, string, string];
    expect(await metTenant(db, a, (tx) => wijzigPijplijnFase(tx, a, tweede, { naam: "Verloren", soort: "verloren" }))).toBe(true);
    await metTenant(db, a, (tx) => zetPijplijnVolgorde(tx, a, [gewonnen, eerste, tweede]));
    expect(await metTenant(db, a, (tx) => zetPijplijnFaseActief(tx, a, eerste, false))).toBe(true);
    expect((await metTenant(db, a, (tx) => leesPijplijnFases(tx, a))).map((f) => [f.naam, f.soort, f.actief])).toEqual([
      ["Gewonnen", "gewonnen", true], ["Eerste", "open", false], ["Verloren", "verloren", true],
    ]);
  });

  it("laat een ander kantoor niets wijzigen of verwijderen", async () => {
    const [fase] = await metTenant(db, a, (tx) => leesPijplijnFases(tx, a));
    expect(await metTenant(db, b, (tx) => wijzigPijplijnFase(tx, b, fase!.id, { naam: "Gekaapt", soort: "open" }))).toBe(false);
    expect(await metTenant(db, b, (tx) => verwijderPijplijnFase(tx, b, fase!.id))).toBe("onbekend");
    expect(await metTenant(db, a, (tx) => verwijderPijplijnFase(tx, a, fase!.id))).toBe("verwijderd");
    expect(await namen(a)).toEqual(["Eerste", "Verloren"]);
  });

  describe("leads", () => {
    let gebruiker: string, medewerker: string, bezichtiger: string, eerste: string, verloren: string;
    const bezichtiging = { realworksId: 1, relatieId: 5001, agendatype: "1e bezichtiging", status: "Definitief", tijdstip: "2026-11-10 14:00:00", projectcode: "P-1", projecttype: "WONEN", locatie: null, medewerkerRealworksId: null };

    beforeAll(async () => {
      await metTenant(db, a, async (tx) => {
        gebruiker = (await tx.query("insert into gebruiker (tenant_id, email, naam, rol) values ($1, $2, 'Test Medewerker', 'medewerker') returning id", [a, `p${Date.now()}@voorbeeld.test`])).rows[0].id;
        medewerker = (await tx.query("insert into medewerker (tenant_id, realworks_id, weergavenaam) values ($1, 900, 'Makelaar A') returning id", [a])).rows[0].id;
        await vervangBezichtigingen(tx, a, [bezichtiging]);
        bezichtiger = (await tx.query("select id from bezichtiger where tenant_id = $1", [a])).rows[0].id;
        const fases = await leesPijplijnFases(tx, a);
        eerste = fases.find((f) => f.naam === "Eerste")!.id;
        verloren = fases.find((f) => f.naam === "Verloren")!.id;
      });
    });

    it("toont een bezichtiger zonder lead als nog niet in de pijplijn", async () => {
      expect(await metTenant(db, a, (tx) => leesLeadKaart(tx, a, bezichtiger))).toMatchObject({ bezichtigerId: bezichtiger, lead: null, historie: [] });
      expect(await metTenant(db, a, (tx) => leesLeadStanden(tx, a))).toEqual([]);
    });

    it("zet een bezichtiger in de pijplijn en legt elke wijziging van fase vast", async () => {
      expect(await metTenant(db, a, (tx) => bewaarLead(tx, a, bezichtiger, { faseId: eerste, eigenaarId: medewerker, notitie: "eerste contact" }, gebruiker))).toMatchObject({ faseGewijzigd: true });
      // Alleen de notitie wijzigen is geen nieuwe regel in de historie.
      expect(await metTenant(db, a, (tx) => bewaarLead(tx, a, bezichtiger, { faseId: eerste, eigenaarId: medewerker, notitie: "teruggebeld" }, gebruiker))).toMatchObject({ faseGewijzigd: false });
      expect(await metTenant(db, a, (tx) => bewaarLead(tx, a, bezichtiger, { faseId: verloren, eigenaarId: null, notitie: null }, gebruiker))).toMatchObject({ faseGewijzigd: true });
      const kaart = await metTenant(db, a, (tx) => leesLeadKaart(tx, a, bezichtiger));
      expect(kaart!.lead).toMatchObject({ faseId: verloren, eigenaarId: null, notitie: null });
      expect(kaart!.historie.map((h) => [h.van, h.naar, h.door])).toEqual([["Eerste", "Verloren", "Test Medewerker"], [null, "Eerste", "Test Medewerker"]]);
      expect(await metTenant(db, a, (tx) => leesLeadStanden(tx, a))).toEqual([{ bezichtigerId: bezichtiger, faseId: verloren, fase: "Verloren", soort: "verloren", eigenaar: null, naam: null, naamGezocht: false }]);
    });

    it("zet een lead vanaf het bord in een andere fase en bewaart eigenaar en notitie", async () => {
      await metTenant(db, a, (tx) => bewaarLead(tx, a, bezichtiger, { faseId: verloren, eigenaarId: medewerker, notitie: "blijft staan" }, gebruiker));
      expect(await metTenant(db, a, (tx) => zetLeadFase(tx, a, bezichtiger, eerste, gebruiker))).toMatchObject({ faseGewijzigd: true });
      expect(await metTenant(db, a, (tx) => zetLeadFase(tx, a, bezichtiger, eerste, gebruiker))).toMatchObject({ faseGewijzigd: false });
      expect(await metTenant(db, b, (tx) => zetLeadFase(tx, b, bezichtiger, eerste, gebruiker))).toBeNull();
      const kaart = await metTenant(db, a, (tx) => leesLeadKaart(tx, a, bezichtiger));
      expect(kaart!.lead).toMatchObject({ faseId: eerste, eigenaarId: medewerker, notitie: "blijft staan" });
      expect(kaart!.historie).toHaveLength(3);
      await metTenant(db, a, (tx) => zetLeadFase(tx, a, bezichtiger, verloren, gebruiker));
    });

    it("laat een ander kantoor de lead niet zien of wijzigen", async () => {
      expect(await metTenant(db, b, (tx) => leesLeadKaart(tx, b, bezichtiger))).toBeNull();
      expect(await metTenant(db, b, (tx) => bewaarLead(tx, b, bezichtiger, { faseId: eerste, eigenaarId: null, notitie: null }, gebruiker))).toBeNull();
      expect(await metTenant(db, b, (tx) => verwijderLead(tx, b, bezichtiger))).toBe(false);
    });

    it("verwijdert geen fase waar leads in zitten of zaten", async () => {
      expect(await metTenant(db, a, (tx) => verwijderPijplijnFase(tx, a, verloren))).toBe("in-gebruik");
      expect(await metTenant(db, a, (tx) => verwijderPijplijnFase(tx, a, eerste))).toBe("in-gebruik");
    });

    it("houdt een bezichtiger met een lead vast als zijn bezichtigingen verdwijnen, en laat hem daarna los", async () => {
      await metTenant(db, a, (tx) => vervangBezichtigingen(tx, a, []));
      expect(await metTenant(db, a, (tx) => leesBezichtigingen(tx, a))).toEqual([]);
      expect(await metTenant(db, a, (tx) => leesLeadKaart(tx, a, bezichtiger))).toMatchObject({ lead: { faseId: verloren } });
      expect(await metTenant(db, a, (tx) => verwijderLead(tx, a, bezichtiger))).toBe(true);
      await metTenant(db, a, (tx) => vervangBezichtigingen(tx, a, []));
      expect(await metTenant(db, a, (tx) => leesLeadKaart(tx, a, bezichtiger))).toBeNull();
      expect(await metTenant(db, a, (tx) => verwijderPijplijnFase(tx, a, verloren))).toBe("verwijderd");
    });
  });
});
