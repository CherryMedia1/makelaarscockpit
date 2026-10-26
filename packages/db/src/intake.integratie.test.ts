// Integratietest tegen een echte PostgreSQL met alle migraties; draait alleen met DB_INTEGRATIE=1 en PG*-variabelen, bijv.:
//   docker run -d --rm --name pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
//   (cd db && PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=test PGDATABASE=postgres PGSSLMODE=disable node migrate.mjs)
//   DB_INTEGRATIE=1 PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=test PGDATABASE=postgres PGSSLMODE=disable npm test -w @makelaarscockpit/db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beoordeelIntakeVeld, intakeVelden, moduleAan, openIntakeDossier, verwerkVeldvoorstellen, voegIntakeBronToe, type Veldvoorstel } from "./intake";
import { maakDb, metTenant, type Db } from "./verbinding";

const bewijs = (citaat: string) => ({ citaat, tijdstempel: "00:01:05", pagina: null });
const voorstel = (pad: string, waarde: unknown): Veldvoorstel => ({ pad, waarde, bewijs: bewijs(`over ${pad}`), zekerheid: 0.9 });

describe.skipIf(!process.env.DB_INTEGRATIE)("intake in de database", () => {
  let db: Db;
  let a: string, b: string, woningA: string, woningB: string, gebruikerA: string;

  beforeAll(async () => {
    db = maakDb();
    const tenant = async (sleutel: string) => (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [sleutel])).rows[0].id as string;
    a = await tenant(`intake-test-a-${Date.now()}`);
    b = await tenant(`intake-test-b-${Date.now()}`);
    const woning = (t: string, code: string) =>
      metTenant(db, t, async (tx) => (await tx.query("insert into woning (tenant_id, projectcode, fase) values ($1, $2, 'voorbereiding') returning id", [t, code])).rows[0].id as string);
    woningA = await woning(a, "P-1");
    woningB = await woning(b, "P-1");
    gebruikerA = await metTenant(db, a, async (tx) => (await tx.query("insert into gebruiker (tenant_id, email, rol) values ($1, $2, 'medewerker') returning id", [a, `t${Date.now()}@voorbeeld.test`])).rows[0].id);
  });

  afterAll(async () => {
    for (const t of [a, b]) {
      for (const tabel of ["intake_veld", "intake_bron", "intake_verbruik", "intake_dossier", "tenant_module", "woning", "gebruiker"]) await db.query(`delete from ${tabel} where tenant_id = $1`, [t]);
      await db.query("delete from tenant where id = $1", [t]);
    }
    await db.end();
  });

  it("kent de module alleen toe aan tenants die hem hebben", async () => {
    expect(await metTenant(db, a, (tx) => moduleAan(tx, a, "intake"))).toBe(false);
  });

  it("opent één dossier per woning en weigert een woning van een andere tenant", async () => {
    const eerste = await metTenant(db, a, (tx) => openIntakeDossier(tx, a, woningA, gebruikerA));
    expect(await metTenant(db, a, (tx) => openIntakeDossier(tx, a, woningA, gebruikerA))).toBe(eerste);
    await expect(metTenant(db, a, (tx) => openIntakeDossier(tx, a, woningB, gebruikerA))).rejects.toThrow("niet gevonden");
  });

  it("voegt bronnen samen, maakt conflicten, en houdt na beoordeling één bevestigde waarde per pad", async () => {
    await metTenant(db, a, async (tx) => {
      const dossier = await openIntakeDossier(tx, a, woningA, gebruikerA);
      const gesprek = await voegIntakeBronToe(tx, a, { dossierId: dossier, type: "plaud_transcript" });
      const checklist = await voegIntakeBronToe(tx, a, { dossierId: dossier, type: "checklist_form" });

      expect(await verwerkVeldvoorstellen(tx, a, dossier, { id: gesprek, type: "plaud_transcript" }, [voorstel("installaties.cv.merk", "Nefit"), voorstel("object.bouwjaar", 1978)]))
        .toEqual({ toevoegen: 2, vervangen: 0, markeerConflict: 0, overslaan: 0 });
      expect(await verwerkVeldvoorstellen(tx, a, dossier, { id: checklist, type: "checklist_form" }, [voorstel("installaties.cv.merk", "Remeha"), voorstel("object.bouwjaar", 1978)]))
        .toEqual({ toevoegen: 1, vervangen: 1, markeerConflict: 1, overslaan: 0 });

      const merk = (await intakeVelden(tx, a, dossier)).filter((v) => v.pad === "installaties.cv.merk");
      expect(merk.map((v) => [v.waarde, v.status])).toEqual([["Nefit", "conflict"], ["Remeha", "conflict"]]);
      expect(merk[0]!.bewijs).toEqual(bewijs("over installaties.cv.merk"));

      await beoordeelIntakeVeld(tx, a, merk[1]!.id, gebruikerA, { soort: "bevestigen" });
      await beoordeelIntakeVeld(tx, a, (await intakeVelden(tx, a, dossier)).find((v) => v.pad === "object.bouwjaar")!.id, gebruikerA, { soort: "corrigeren", waarde: 1979 });

      const na = await intakeVelden(tx, a, dossier);
      expect(na.filter((v) => v.pad === "installaties.cv.merk").map((v) => [v.waarde, v.status])).toEqual([["Nefit", "afgewezen"], ["Remeha", "bevestigd"]]);
      expect(na.filter((v) => v.pad === "object.bouwjaar").map((v) => [v.waarde, v.status, v.bronId])).toEqual([[1978, "afgewezen", checklist], [1979, "bevestigd", null]]);
    });
  });

  it("laat een andere tenant niets van het dossier zien", async () => {
    const dossier = await metTenant(db, a, (tx) => openIntakeDossier(tx, a, woningA, gebruikerA));
    // Bewust zonder tenantfilter in de query: hier test RLS het vangnet.
    const zichtbaar = await metTenant(db, b, async (tx) => (await tx.query("select count(*)::int as n from intake_veld where dossier_id = $1", [dossier])).rows[0].n);
    expect(zichtbaar).toBe(0);
  });
});
