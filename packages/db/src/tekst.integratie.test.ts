// Integratietest van de woningtekst-tabellen (ADR-016) tegen een echte PostgreSQL; opzet zoals in intake.integratie.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openIntakeDossier } from "./intake";
import {
  actiefSchrijfprofiel, activeerSchrijfprofiel, bewaarSchrijfprofiel, bewaarSteekwoorden, keurWoningtekstGoed, kiesSchrijfvoorbeelden, schrijfprofielVersies,
  startSchrijven, tekstversies, voegSchrijfvoorbeeldToe, voegTekstversieToe, woningtekstVanDossier, zetWoningtekstMislukt,
} from "./tekst";
import { maakDb, metTenant, type Db } from "./verbinding";

const inhoud = { inleiding: "Welkom.", secties: [{ sectie: "wonen", kop: "Wonen", tekst: "Licht." }] };

describe.skipIf(!process.env.DB_INTEGRATIE)("woningtekst in de database", () => {
  let db: Db;
  let a: string, b: string, dossier: string, gebruiker: string;

  beforeAll(async () => {
    db = maakDb();
    const tenant = async (s: string) => (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [`${s}-${Date.now()}`])).rows[0].id as string;
    a = await tenant("tekst-test-a");
    b = await tenant("tekst-test-b");
    ({ dossier, gebruiker } = await metTenant(db, a, async (tx) => {
      const woning = (await tx.query("insert into woning (tenant_id, projectcode, fase) values ($1, 'P-1', 'voorbereiding') returning id", [a])).rows[0].id;
      const g = (await tx.query("insert into gebruiker (tenant_id, email, rol) values ($1, $2, 'medewerker') returning id", [a, `t${Date.now()}@voorbeeld.test`])).rows[0].id;
      return { dossier: await openIntakeDossier(tx, a, woning, g), gebruiker: g as string };
    }));
  });

  afterAll(async () => {
    for (const t of [a, b]) {
      await db.query("update intake_woningtekst set goedgekeurde_versie_id = null where tenant_id = $1", [t]);
      for (const tabel of ["intake_woningtekst_versie", "intake_woningtekst", "intake_schrijfvoorbeeld", "intake_schrijfprofiel", "intake_dossier", "woning", "gebruiker"]) {
        await db.query(`delete from ${tabel} where tenant_id = $1`, [t]);
      }
      await db.query("delete from tenant where id = $1", [t]);
    }
    await db.end();
  });

  it("nummert profielversies per tenant en houdt er hoogstens één actief", async () => {
    await metTenant(db, a, async (tx) => {
      expect(await bewaarSchrijfprofiel(tx, a, { naam: "Eerste", profiel: { x: 1 } }, gebruiker, true)).toMatchObject({ versie: 1 });
      const concept = await bewaarSchrijfprofiel(tx, a, { naam: "Concept", profiel: { x: 2 } }, gebruiker, false);
      expect(concept.versie).toBe(2);
      expect((await actiefSchrijfprofiel(tx, a))?.naam).toBe("Eerste");
      expect(await activeerSchrijfprofiel(tx, a, concept.id)).toBe(true);
      expect((await schrijfprofielVersies(tx, a)).map((v) => [v.versie, v.status])).toEqual([[2, "actief"], [1, "gearchiveerd"]]);
      expect((await actiefSchrijfprofiel(tx, a))?.profiel).toEqual({ x: 2 });
    });
    expect(await metTenant(db, b, (tx) => bewaarSchrijfprofiel(tx, b, { naam: "B", profiel: {} }, null, true))).toMatchObject({ versie: 1 });
  });

  it("kiest voorbeelden van dezelfde categorie eerst", async () => {
    await metTenant(db, a, async (tx) => {
      await voegSchrijfvoorbeeldToe(tx, a, { titel: "Villa", woningcategorie: "vrijstaand", tekst: "v" }, gebruiker);
      await voegSchrijfvoorbeeldToe(tx, a, { titel: "Flat", woningcategorie: "appartement", tekst: "f" }, gebruiker);
      await voegSchrijfvoorbeeldToe(tx, a, { titel: "Rijtjeshuis", woningcategorie: "eengezinswoning", tekst: "r" }, gebruiker);
      expect((await kiesSchrijfvoorbeelden(tx, a, "appartement", 2)).map((v) => v.titel)[0]).toBe("Flat");
      expect(await kiesSchrijfvoorbeelden(tx, a, "appartement", 0)).toEqual([]);
    });
  });

  it("doorloopt steekwoorden, schrijven, versies en goedkeuren", async () => {
    await metTenant(db, a, async (tx) => {
      const id = (await bewaarSteekwoorden(tx, a, dossier, { woonkamer: "licht" }, null))!;
      expect(await bewaarSteekwoorden(tx, a, dossier, { woonkamer: "licht, haard" }, "eengezinswoning")).toBe(id);
      expect(await woningtekstVanDossier(tx, a, dossier)).toMatchObject({ steekwoorden: { woonkamer: "licht, haard" }, woningcategorie: "eengezinswoning", status: "concept" });

      expect(await startSchrijven(tx, a, id)).toBe(true);
      expect(await startSchrijven(tx, a, id)).toBe(false);
      await zetWoningtekstMislukt(tx, a, id, "model-503");
      expect(await startSchrijven(tx, a, id)).toBe(true);

      const profiel = (await actiefSchrijfprofiel(tx, a))!.id;
      const versie = { bron: "model" as const, profielId: profiel, inhoud, tekst: "Welkom.\n\nWonen\nLicht.", feiten: { adres: "x" }, controles: [], model: "gpt-5.4", promptVersie: "tekst-v1", promptHash: "abc" };
      const v1 = await voegTekstversieToe(tx, a, id, versie, null);
      expect((await woningtekstVanDossier(tx, a, dossier))?.status).toBe("geschreven");
      const v2 = await voegTekstversieToe(tx, a, id, { ...versie, bron: "medewerker", model: null, promptVersie: null, promptHash: null }, gebruiker);
      expect((await tekstversies(tx, a, id)).map((v) => v.id)).toEqual([v2, v1]);

      expect(await keurWoningtekstGoed(tx, a, id, v2, gebruiker)).toBe(true);
      expect(await woningtekstVanDossier(tx, a, dossier)).toMatchObject({ status: "goedgekeurd", goedgekeurdeVersieId: v2, goedgekeurdDoor: gebruiker });
    });
  });

  it("weigert goedkeuren met een versie van een andere tekst en laat een andere tenant niets zien", async () => {
    const tekstA = await metTenant(db, a, async (tx) => (await woningtekstVanDossier(tx, a, dossier))!.id);
    expect(await metTenant(db, a, (tx) => keurWoningtekstGoed(tx, a, tekstA, "00000000-0000-4000-8000-000000000000", gebruiker))).toBe(false);
    // Bewust zonder tenantfilter: hier test RLS het vangnet.
    const zichtbaar = await metTenant(db, b, async (tx) => (await tx.query("select count(*)::int as n from intake_woningtekst_versie")).rows[0].n);
    expect(zichtbaar).toBe(0);
  });
});
