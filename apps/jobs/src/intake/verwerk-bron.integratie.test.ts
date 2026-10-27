// Integratietest van de verwerking van één bron tegen een echte PostgreSQL, met opgenomen modelantwoorden uit de fixtures
// in plaats van Foundry. Draait alleen met DB_INTEGRATIE=1 en PG*-variabelen; opzet zoals in packages/db/src/intake.integratie.test.ts.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { intakeBronnen, intakeVelden, maakDb, metTenant, openIntakeDossier, voegIntakeBronToe, type Db } from "@makelaarscockpit/db";
import { DefinitieveFout } from "./modellen";
import { verwerkBron, type Diensten } from "./verwerk-bron";

const fixture = (naam: string) => readFileSync(new URL(`../../../../packages/ai/fixtures/intake/dossier-01/${naam}`, import.meta.url));
const transcript = fixture("transcript.txt");
const extractie: unknown = JSON.parse(fixture("extractie.json").toString("utf8"));

const diensten = (overschrijf: Partial<Diensten> = {}): Diensten => ({
  leesBlob: async () => transcript,
  pdfAlsTekst: async () => ({ tekst: "=== Pagina 1 ===\nBouwjaar 1978", paginas: 1 }),
  extraheer: async () => ({ json: extractie, tokens: { input: 12_000, gecachet: 0, output: 4_000 } }),
  ...overschrijf,
});

describe.skipIf(!process.env.DB_INTEGRATIE)("verwerkBron", () => {
  let db: Db;
  let tenant: string, dossier: string;
  const bron = (type: "plaud_transcript" | "gespreksverslag_pdf" = "plaud_transcript") =>
    metTenant(db, tenant, (tx) => voegIntakeBronToe(tx, tenant, { dossierId: dossier, type, blobPad: `${tenant}/${dossier}/x` }));
  const status = async (bronId: string) => (await metTenant(db, tenant, (tx) => intakeBronnen(tx, tenant, dossier))).find((b) => b.id === bronId)?.verwerkstatus;

  beforeAll(async () => {
    db = maakDb();
    tenant = (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [`verwerk-test-${Date.now()}`])).rows[0].id;
    await db.query("insert into tenant_module (tenant_id, module) values ($1, 'intake')", [tenant]);
    dossier = await metTenant(db, tenant, async (tx) => {
      const woning = (await tx.query("insert into woning (tenant_id, projectcode, fase) values ($1, 'P-1', 'voorbereiding') returning id", [tenant])).rows[0].id;
      return openIntakeDossier(tx, tenant, woning, null);
    });
  });

  afterAll(async () => {
    for (const tabel of ["intake_veld", "intake_verbruik", "intake_bron", "intake_dossier", "tenant_module", "woning"]) await db.query(`delete from ${tabel} where tenant_id = $1`, [tenant]);
    await db.query("delete from tenant where id = $1", [tenant]);
    await db.end();
  });

  it("verwerkt een transcript tot voorstellen, registreert het verbruik en slaat een tweede bezorging over", async () => {
    const id = await bron();
    expect(await verwerkBron(db, diensten(), { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("verwerkt");
    expect(await status(id)).toBe("verwerkt");

    const velden = await metTenant(db, tenant, (tx) => intakeVelden(tx, tenant, dossier));
    expect(velden.find((v) => v.pad === "installaties.cv.merk")).toMatchObject({ waarde: "Remeha", status: "voorstel", bewijs: { tijdstempel: "00:01:05" } });
    expect(velden.length).toBeGreaterThan(20);

    const verbruik = (await db.query("select stap, model, input_tokens, output_tokens, kosten_eur::float as kosten from intake_verbruik where tenant_id = $1", [tenant])).rows;
    expect(verbruik).toEqual([{ stap: "extractie-v1", model: "gpt-5.4", input_tokens: 12_000, output_tokens: 4_000, kosten: expect.closeTo(0.0871, 4) }]);

    // Dezelfde bron nog eens (bijv. een dubbel bericht): niets dubbel.
    expect(await verwerkBron(db, diensten(), { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("overgeslagen");
    expect((await metTenant(db, tenant, (tx) => intakeVelden(tx, tenant, dossier))).length).toBe(velden.length);
  });

  it("zet een PDF eerst om naar tekst en rekent de pagina's mee", async () => {
    const id = await bron("gespreksverslag_pdf");
    const pdf = diensten({
      extraheer: async () => ({
        json: { object: { bouwjaar: { waarde: 1978, bewijs: { citaat: "Bouwjaar 1978", tijdstempel: null, pagina: 1 }, zekerheid: 1 } } },
        tokens: { input: 1000, gecachet: 0, output: 100 },
      }),
    });
    expect(await verwerkBron(db, pdf, { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("verwerkt");
    const stappen = (await db.query("select stap, model from intake_verbruik where tenant_id = $1 order by aangemaakt_op", [tenant])).rows.map((r) => `${r.stap}:${r.model}`);
    expect(stappen).toContain("pdf-tekst:prebuilt-layout");
  });

  it("zet een bron terug op nieuw bij een tijdelijke fout, en op mislukt bij de laatste poging", async () => {
    const id = await bron();
    const storing = diensten({ extraheer: async () => { throw new Error("model-503"); } });
    expect(await verwerkBron(db, storing, { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("opnieuw");
    expect(await status(id)).toBe("nieuw");
    expect(await verwerkBron(db, storing, { tenantId: tenant, dossierId: dossier, bronId: id }, true)).toBe("mislukt");
    expect((await db.query("select verwerkstatus, verwerkfout from intake_bron where id = $1", [id])).rows[0]).toEqual({ verwerkstatus: "mislukt", verwerkfout: "model-503" });
  });

  it("geeft een definitieve fout direct op, zonder opnieuw te proberen", async () => {
    const id = await bron();
    const afgekapt = diensten({ extraheer: async () => { throw new DefinitieveFout("model-afgekapt"); } });
    expect(await verwerkBron(db, afgekapt, { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("mislukt");
  });

  it("slaat een bron over van een ander dossier of als de module uit staat", async () => {
    const id = await bron();
    expect(await verwerkBron(db, diensten(), { tenantId: tenant, dossierId: id, bronId: id }, false)).toBe("overgeslagen");
    await db.query("delete from tenant_module where tenant_id = $1", [tenant]);
    expect(await verwerkBron(db, diensten(), { tenantId: tenant, dossierId: dossier, bronId: id }, false)).toBe("overgeslagen");
    expect(await status(id)).toBe("nieuw");
    await db.query("insert into tenant_module (tenant_id, module) values ($1, 'intake')", [tenant]);
  });
});
