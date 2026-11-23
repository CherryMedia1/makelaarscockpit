// Integratietest tegen een echte PostgreSQL met alle migraties; draait alleen met DB_INTEGRATIE=1 (zie intake.integratie.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leesPijplijnFases, verwijderPijplijnFase, voegPijplijnFaseToe, wijzigPijplijnFase, zetPijplijnFaseActief, zetPijplijnVolgorde } from "./pijplijn";
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
      await db.query("delete from pijplijn_fase where tenant_id = $1", [t]);
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
    expect(await metTenant(db, b, (tx) => verwijderPijplijnFase(tx, b, fase!.id))).toBe(false);
    expect(await metTenant(db, a, (tx) => verwijderPijplijnFase(tx, a, fase!.id))).toBe(true);
    expect(await namen(a)).toEqual(["Eerste", "Verloren"]);
  });
});
