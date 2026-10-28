// Integratietest van het opschonen (ADR-015, stap A9) tegen een echte PostgreSQL; de blob-opslag is nagebootst.
// Draait alleen met DB_INTEGRATIE=1 en PG*-variabelen; opzet zoals in packages/db/src/intake.integratie.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bewaarSchrijfprofiel, bewaarSteekwoorden, keurWoningtekstGoed, maakDb, metTenant, openIntakeDossier, voegIntakeBronToe, voegTekstversieToe, type Db,
} from "@makelaarscockpit/db";
import { schoonIntakeOp } from "./opschonen";

describe.skipIf(!process.env.DB_INTEGRATIE)("schoonIntakeOp", () => {
  let db: Db;
  let tenant: string;
  const verwijderd: string[] = [];
  const blobs = async (prefix: string) => {
    verwijderd.push(prefix);
    return 2;
  };

  /** Een woning met dossier, één bron en vier velden: bevestigd, voorstel, planning (bevestigd) en afgewezen. */
  async function maakDossier(code: string, woning: { fase: string; zichtbaar: boolean; nietZichtbaarSinds?: string; transportdatum?: string }) {
    return metTenant(db, tenant, async (tx) => {
      const object = woning.transportdatum
        ? (await tx.query("insert into object (tenant_id, realworks_id, transportdatum) values ($1, $2, $3) returning id", [tenant, Math.floor(Math.random() * 1e9), woning.transportdatum])).rows[0].id
        : null;
      const w = (await tx.query(
        "insert into woning (tenant_id, projectcode, object_id, fase, zichtbaar, niet_zichtbaar_sinds) values ($1, $2, $3, $4, $5, $6) returning id",
        [tenant, code, object, woning.fase, woning.zichtbaar, woning.nietZichtbaarSinds ?? null],
      )).rows[0].id;
      const dossier = await openIntakeDossier(tx, tenant, w, null);
      const bron = await voegIntakeBronToe(tx, tenant, { dossierId: dossier, type: "plaud_transcript", blobPad: `${tenant}/${dossier}/a.txt`, bestandsnaam: "intake.txt" });
      const bewijs = JSON.stringify({ citaat: "letterlijk", tijdstempel: "00:01:00", pagina: null });
      for (const [pad, status] of [["object.bouwjaar", "bevestigd"], ["object.ligging", "voorstel"], ["planning.huisdieren", "bevestigd"], ["keuken.stijl", "afgewezen"]]) {
        await tx.query("insert into intake_veld (tenant_id, dossier_id, pad, waarde, bron_id, bewijs, status) values ($1, $2, $3, '1', $4, $5::jsonb, $6)", [tenant, dossier, pad, bron, bewijs, status]);
      }
      await tx.query("insert into intake_verbruik (tenant_id, dossier_id, stap, model, input_tokens, output_tokens, kosten_eur) values ($1, $2, 'x', 'gpt-5.4', 1, 1, 0.1)", [tenant, dossier]);
      return dossier;
    });
  }

  /** Een woningtekst met twee versies voor het dossier; met `goedkeuren` is de laatste goedgekeurd. */
  async function maakTekst(dossier: string, goedkeuren: boolean): Promise<string> {
    return metTenant(db, tenant, async (tx) => {
      const id = (await bewaarSteekwoorden(tx, tenant, dossier, { woonkamer: "licht" }, null))!;
      const versie = { bron: "model" as const, profielId: profiel, inhoud: { inleiding: "x", secties: [] }, tekst: "x", feiten: { steekwoorden: { woonkamer: "licht" } }, controles: [], model: null, promptVersie: null, promptHash: null };
      await voegTekstversieToe(tx, tenant, id, versie, null);
      const laatste = await voegTekstversieToe(tx, tenant, id, { ...versie, bron: "medewerker" }, null);
      if (goedkeuren) await keurWoningtekstGoed(tx, tenant, id, laatste, gebruiker);
      return id;
    });
  }
  let profiel: string, gebruiker: string;

  beforeAll(async () => {
    db = maakDb();
    tenant = (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [`opschoon-test-${Date.now()}`])).rows[0].id;
    ({ profiel, gebruiker } = await metTenant(db, tenant, async (tx) => ({
      profiel: (await bewaarSchrijfprofiel(tx, tenant, { naam: "Test", profiel: {} }, null, true)).id,
      gebruiker: (await tx.query("insert into gebruiker (tenant_id, email, rol) values ($1, $2, 'medewerker') returning id", [tenant, `o${Date.now()}@voorbeeld.test`])).rows[0].id as string,
    })));
  });

  afterAll(async () => {
    await db.query("update intake_woningtekst set goedgekeurde_versie_id = null where tenant_id = $1", [tenant]);
    for (const tabel of ["intake_woningtekst_versie", "intake_woningtekst", "intake_schrijfprofiel", "intake_veld", "intake_verbruik", "intake_bron", "intake_dossier", "woning", "object", "gebruiker"]) await db.query(`delete from ${tabel} where tenant_id = $1`, [tenant]);
    await db.query("delete from tenant where id = $1", [tenant]);
    await db.end();
  });

  it("schoont na verkoop op, verwijdert een ingetrokken woning na 30 dagen en laat de rest staan", async () => {
    const verkocht = await maakDossier("V", { fase: "verkocht", zichtbaar: true, transportdatum: "2026-10-01" });
    const ingetrokken = await maakDossier("I", { fase: "in_verkoop", zichtbaar: false, nietZichtbaarSinds: "2026-09-01" });
    const recentWeg = await maakDossier("R", { fase: "in_verkoop", zichtbaar: false, nietZichtbaarSinds: "2026-10-20" });
    const inVerkoop = await maakDossier("L", { fase: "in_verkoop", zichtbaar: true });

    expect(await schoonIntakeOp(db, tenant, "2026-10-27", blobs)).toEqual({ opgeschoond: 1, verwijderd: 1 });
    expect(verwijderd.sort()).toEqual([`${tenant}/${verkocht}/`, `${tenant}/${ingetrokken}/`].sort());

    const velden = (d: string) => db.query("select pad, bewijs->>'citaat' as citaat from intake_veld where dossier_id = $1 order by pad", [d]).then((r) => r.rows);
    expect(await velden(verkocht)).toEqual([{ pad: "object.bouwjaar", citaat: null }]);
    expect((await db.query("select status from intake_dossier where id = $1", [verkocht])).rows[0].status).toBe("opgeschoond");
    expect((await db.query("select verwerkstatus, blob_pad, bestandsnaam from intake_bron where dossier_id = $1", [verkocht])).rows[0]).toEqual({ verwerkstatus: "verwijderd", blob_pad: null, bestandsnaam: null });
    expect((await db.query("select count(*)::int as n from intake_verbruik where dossier_id = $1", [verkocht])).rows[0].n).toBe(1);

    expect((await db.query("select count(*)::int as n from intake_dossier where id = $1", [ingetrokken])).rows[0].n).toBe(0);
    expect((await velden(recentWeg)).length).toBe(4);
    expect((await velden(inVerkoop)).length).toBe(4);

    // Een tweede run doet niets meer.
    verwijderd.length = 0;
    expect(await schoonIntakeOp(db, tenant, "2026-10-27", blobs)).toEqual({ opgeschoond: 0, verwijderd: 0 });
    expect(verwijderd).toEqual([]);
  });

  it("bewaart na verkoop een goedgekeurde tekst met zijn versies en verwijdert een tekst die nooit is goedgekeurd (ADR-016)", async () => {
    const metGoedgekeurd = await maakDossier("T1", { fase: "verkocht", zichtbaar: true, transportdatum: "2026-10-01" });
    const zonderGoedkeuring = await maakDossier("T2", { fase: "verkocht", zichtbaar: true, transportdatum: "2026-10-01" });
    const ingetrokken = await maakDossier("T3", { fase: "in_verkoop", zichtbaar: false, nietZichtbaarSinds: "2026-09-01" });
    const bewaard = await maakTekst(metGoedgekeurd, true);
    const weg = await maakTekst(zonderGoedkeuring, false);
    const metDossierWeg = await maakTekst(ingetrokken, true);

    expect(await schoonIntakeOp(db, tenant, "2026-10-27", blobs)).toEqual({ opgeschoond: 2, verwijderd: 1 });
    const versies = (id: string) => db.query("select count(*)::int as n from intake_woningtekst_versie where woningtekst_id = $1", [id]).then((r) => r.rows[0].n);
    const teksten = (id: string) => db.query("select count(*)::int as n from intake_woningtekst where id = $1", [id]).then((r) => r.rows[0].n);
    expect([await teksten(bewaard), await versies(bewaard)]).toEqual([1, 2]);
    expect([await teksten(weg), await versies(weg)]).toEqual([0, 0]);
    expect([await teksten(metDossierWeg), await versies(metDossierWeg)]).toEqual([0, 0]);
  });
});
