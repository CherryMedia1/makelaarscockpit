// Integratietest tegen een echte PostgreSQL met alle migraties; draait alleen met DB_INTEGRATIE=1 (zie intake.integratie.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BezichtigingUitRealworks } from "@makelaarscockpit/domain";
import { bezichtigersZonderNaam, leesBezichtigingen, vervangBezichtigingen, zetBezichtigerNamen } from "./bezichtigers";
import { maakDb, metTenant, type Db } from "./verbinding";

const bezichtiging = (over: Partial<BezichtigingUitRealworks> = {}): BezichtigingUitRealworks => ({
  realworksId: 1, relatieId: 5001, agendatype: "1e bezichtiging", status: "Definitief", tijdstip: "2026-11-10 14:00:00",
  projectcode: "P-1", projecttype: "WONEN", locatie: "1234 AB  Testdorp Proefstraat 1", medewerkerRealworksId: 900, ...over,
});

describe.skipIf(!process.env.DB_INTEGRATIE)("bezichtigers in de database", () => {
  let db: Db;
  let a: string, b: string;

  beforeAll(async () => {
    db = maakDb();
    const tenant = async (sleutel: string) => (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [sleutel])).rows[0].id as string;
    a = await tenant(`bez-test-a-${Date.now()}`);
    b = await tenant(`bez-test-b-${Date.now()}`);
    await metTenant(db, a, async (tx) => {
      await tx.query("insert into medewerker (tenant_id, realworks_id, weergavenaam) values ($1, 900, 'Makelaar A')", [a]);
      await tx.query("insert into object (tenant_id, realworks_id, objectcode, straat, huisnummer, plaats) values ($1, 77, 'P-1', 'Proefstraat', '1', 'Testdorp')", [a]);
    });
  });

  afterAll(async () => {
    for (const t of [a, b]) {
      for (const tabel of ["bezichtiging", "bezichtiger", "object", "medewerker"]) await db.query(`delete from ${tabel} where tenant_id = $1`, [t]);
      await db.query("delete from tenant where id = $1", [t]);
    }
    await db.end();
  });

  it("spiegelt bezichtigingen per relatie en is idempotent op het Realworks-id", async () => {
    const lijst = [bezichtiging(), bezichtiging({ realworksId: 2, tijdstip: "2026-11-20 10:00:00", projectcode: "P-9", locatie: "1234 AB  Testdorp Voorbeeldlaan 8", medewerkerRealworksId: null }), bezichtiging({ realworksId: 3, relatieId: 5002 })];
    expect(await metTenant(db, a, (tx) => vervangBezichtigingen(tx, a, lijst))).toEqual({ bezichtigingen: 3, bezichtigers: 2, verwijderd: 0 });
    expect(await metTenant(db, a, (tx) => vervangBezichtigingen(tx, a, lijst))).toEqual({ bezichtigingen: 3, bezichtigers: 2, verwijderd: 0 });
  });

  it("legt namen vast en vraagt ze daarna niet opnieuw op", async () => {
    expect((await metTenant(db, a, (tx) => bezichtigersZonderNaam(tx, a, 10))).sort()).toEqual([5001, 5002]);
    await metTenant(db, a, (tx) => zetBezichtigerNamen(tx, a, [{ relatieId: 5001, naam: "Test Persoon" }, { relatieId: 5002, naam: null }]));
    expect(await metTenant(db, a, (tx) => bezichtigersZonderNaam(tx, a, 10))).toEqual([]);
  });

  it("leest de bezichtigingen met naam, woning en makelaar, nieuwste eerst", async () => {
    const regels = await metTenant(db, a, (tx) => leesBezichtigingen(tx, a));
    expect(regels.map((r) => ({ naam: r.naam, tijdstip: r.tijdstip, woning: r.woning, makelaar: r.makelaar, projectcode: r.projectcode }))).toEqual([
      { naam: "Test Persoon", tijdstip: "2026-11-20 10:00", woning: "Testdorp Voorbeeldlaan 8", makelaar: "Onbekend", projectcode: "P-9" },
      { naam: "Test Persoon", tijdstip: "2026-11-10 14:00", woning: "Proefstraat 1, Testdorp", makelaar: "Makelaar A", projectcode: "P-1" },
      { naam: null, tijdstip: "2026-11-10 14:00", woning: "Proefstraat 1, Testdorp", makelaar: "Makelaar A", projectcode: "P-1" },
    ]);
    expect(regels[0]!.bezichtigerId).toBe(regels[1]!.bezichtigerId);
  });

  it("laat een andere tenant niets zien", async () => {
    expect(await metTenant(db, b, (tx) => leesBezichtigingen(tx, b))).toEqual([]);
    expect(await metTenant(db, b, (tx) => leesBezichtigingen(tx, a))).toEqual([]);
  });

  it("verwijdert wat Realworks niet meer levert, en de bezichtiger zonder bezichtigingen met zijn naam", async () => {
    expect(await metTenant(db, a, (tx) => vervangBezichtigingen(tx, a, [bezichtiging({ realworksId: 3, relatieId: 5002 })]))).toEqual({ bezichtigingen: 1, bezichtigers: 1, verwijderd: 2 });
    const over = await db.query("select realworks_relatie_id from bezichtiger where tenant_id = $1", [a]);
    expect(over.rows.map((r) => Number(r.realworks_relatie_id))).toEqual([5002]);
  });
});
