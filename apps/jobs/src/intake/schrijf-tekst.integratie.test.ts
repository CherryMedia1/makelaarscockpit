// Integratietest van het schrijven van een woningtekst (ADR-016) tegen een echte PostgreSQL, met opgenomen modelantwoorden
// en het verzonnen testprofiel. Draait alleen met DB_INTEGRATIE=1 en PG*-variabelen.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bewaarSchrijfprofiel, bewaarSteekwoorden, maakDb, metTenant, openIntakeDossier, startSchrijven, tekstversies, voegSchrijfvoorbeeldToe, woningtekstVanDossier, type Db,
} from "@makelaarscockpit/db";
import { DefinitieveFout } from "./modellen";
import { schrijfTekst, type Tekstdiensten } from "./schrijf-tekst";

const map = new URL("../../../../packages/ai/fixtures/schrijfprofielen/voorbeeld/", import.meta.url);
const profiel: unknown = JSON.parse(readFileSync(new URL("profiel.json", map), "utf8"));

const tekst = {
  inleiding: "Welkom aan de Proefstraat 1 in Testdorp! Een lichte woning met tuin. Maak gerust een afspraak voor een bezichtiging.",
  secties: [
    { sectie: "wonen", kop: "Wonen en koken", tekst: "De woonkamer is licht en heeft een open haard." },
    { sectie: "omgeving", kop: "Wonen in Testdorp", tekst: "Rustig gelegen aan het park." },
    { sectie: "afsluiting", kop: "Interesse?", tekst: "Plan een bezichtiging en ervaar het zelf." },
  ],
  gebruikte_feiten: ["licht"],
  aannames: [],
};
const tokens = { input: 9_000, gecachet: 0, output: 3_000 };

const diensten = (overschrijf: Partial<Tekstdiensten> = {}): Tekstdiensten => ({
  schrijf: async () => ({ json: tekst, tokens }),
  controleer: async () => ({ json: { beweringen: [{ onderdeel: "wonen", citaat: "open haard", toelichting: "Een open haard staat niet in de feiten." }] }, tokens: { input: 2_000, gecachet: 0, output: 300 } }),
  ...overschrijf,
});

describe.skipIf(!process.env.DB_INTEGRATIE)("schrijfTekst", () => {
  let db: Db;
  let tenant: string, dossier: string, woningtekst: string;
  const bericht = (sectie: string | null = null) => ({ tenantId: tenant, woningtekstId: woningtekst, sectie });

  beforeAll(async () => {
    db = maakDb();
    tenant = (await db.query("insert into tenant (sleutel, naam) values ($1, $1) returning id", [`tekstjob-test-${Date.now()}`])).rows[0].id;
    await db.query("insert into tenant_module (tenant_id, module) values ($1, 'intake')", [tenant]);
    ({ dossier, woningtekst } = await metTenant(db, tenant, async (tx) => {
      const woning = (await tx.query("insert into woning (tenant_id, projectcode, adres, plaats, fase) values ($1, 'P-1', 'Proefstraat 1', 'Testdorp', 'in_verkoop') returning id", [tenant])).rows[0].id;
      const d = await openIntakeDossier(tx, tenant, woning, null);
      await tx.query("insert into intake_veld (tenant_id, dossier_id, pad, waarde, status) values ($1, $2, 'object.bouwjaar', '1978', 'bevestigd')", [tenant, d]);
      await bewaarSchrijfprofiel(tx, tenant, { naam: "Kantoor Voorbeeld", profiel }, null, true);
      await voegSchrijfvoorbeeldToe(tx, tenant, { titel: "Voorbeeld", woningcategorie: "eengezinswoning", tekst: "Welkom aan de Voorbeeldlaan 8." }, null);
      const w = (await bewaarSteekwoorden(tx, tenant, d, { woonkamer: "licht", adres_ligging: "rustig, park", overig: "bel 06-12345678" }, null))!;
      return { dossier: d, woningtekst: w };
    }));
  });

  afterAll(async () => {
    for (const tabel of ["intake_woningtekst_versie", "intake_woningtekst", "intake_schrijfvoorbeeld", "intake_schrijfprofiel", "intake_verbruik", "intake_veld", "intake_dossier", "tenant_module", "woning"]) {
      await db.query(`delete from ${tabel} where tenant_id = $1`, [tenant]);
    }
    await db.query("delete from tenant where id = $1", [tenant]);
    await db.end();
  });

  it("schrijft alleen als de tekst op 'bezig' staat", async () => {
    expect(await schrijfTekst(db, diensten(), bericht(), false)).toBe("overgeslagen");
  });

  it("schrijft een versie met opmaak, vaste blokken, controles en verbruik; zonder telefoonnummer in de prompt", async () => {
    await metTenant(db, tenant, (tx) => startSchrijven(tx, tenant, woningtekst));
    let prompt = "";
    const vastleggen = diensten({ schrijf: async (berichten) => ((prompt = berichten.map((b) => b.content).join("\n")), { json: tekst, tokens }) });
    expect(await schrijfTekst(db, vastleggen, bericht(), false)).toBe("verwerkt");
    expect(prompt).not.toContain("06-12345678");
    expect(prompt).toContain("Welkom aan de Voorbeeldlaan 8.");

    const [versie] = await metTenant(db, tenant, (tx) => tekstversies(tx, tenant, woningtekst));
    expect(versie).toMatchObject({ bron: "model", model: "gpt-5.4", promptVersie: "tekst-v1" });
    expect(versie!.tekst.endsWith("De vermelde maten zijn indicatief en ontleend aan de meetinstructie.")).toBe(true);
    expect(versie!.controles).toEqual(expect.arrayContaining([
      { soort: "bron", sectie: "wonen", melding: "'open haard': Een open haard staat niet in de feiten." },
      expect.objectContaining({ soort: "lengte" }),
    ]));
    expect((await metTenant(db, tenant, (tx) => woningtekstVanDossier(tx, tenant, dossier)))?.status).toBe("geschreven");
    const stappen = (await db.query("select stap, model from intake_verbruik where tenant_id = $1 order by stap", [tenant])).rows;
    expect(stappen).toHaveLength(2);
    expect(stappen).toEqual(expect.arrayContaining([{ stap: "tekst-v1", model: "gpt-5.4" }, { stap: "tekstcontrole-v1", model: "gpt-5.4-mini" }]));
  });

  it("vervangt bij opnieuw schrijven van één sectie alleen die sectie", async () => {
    await metTenant(db, tenant, (tx) => startSchrijven(tx, tenant, woningtekst));
    const nieuw = { ...tekst, inleiding: "Andere inleiding.", secties: tekst.secties.map((s) => (s.sectie === "omgeving" ? { ...s, tekst: "Vlak bij het park." } : { ...s, tekst: "Anders." })) };
    expect(await schrijfTekst(db, diensten({ schrijf: async () => ({ json: nieuw, tokens }) }), bericht("omgeving"), false)).toBe("verwerkt");
    const [laatste, vorige] = await metTenant(db, tenant, (tx) => tekstversies(tx, tenant, woningtekst));
    expect(laatste!.inhoud.inleiding).toBe(vorige!.inhoud.inleiding);
    expect(laatste!.inhoud.secties.map((s) => s.tekst)).toEqual([vorige!.inhoud.secties[0]!.tekst, "Vlak bij het park.", vorige!.inhoud.secties[2]!.tekst]);
  });

  it("schrijft de tekst ook als de bronnencontrole mislukt, met een melding", async () => {
    await metTenant(db, tenant, (tx) => startSchrijven(tx, tenant, woningtekst));
    expect(await schrijfTekst(db, diensten({ controleer: async () => { throw new Error("model-503"); } }), bericht(), false)).toBe("verwerkt");
    const [versie] = await metTenant(db, tenant, (tx) => tekstversies(tx, tenant, woningtekst));
    expect(versie!.controles).toEqual(expect.arrayContaining([expect.objectContaining({ soort: "bron-niet-gecontroleerd" })]));
  });

  it("houdt de tekst op 'bezig' bij een tijdelijke fout en zet hem op mislukt bij een definitieve of de laatste poging", async () => {
    await metTenant(db, tenant, (tx) => startSchrijven(tx, tenant, woningtekst));
    const storing = diensten({ schrijf: async () => { throw new Error("model-503"); } });
    expect(await schrijfTekst(db, storing, bericht(), false)).toBe("opnieuw");
    expect((await metTenant(db, tenant, (tx) => woningtekstVanDossier(tx, tenant, dossier)))?.status).toBe("bezig");
    expect(await schrijfTekst(db, diensten({ schrijf: async () => { throw new DefinitieveFout("model-afgekapt"); } }), bericht(), false)).toBe("mislukt");
    expect(await metTenant(db, tenant, (tx) => woningtekstVanDossier(tx, tenant, dossier))).toMatchObject({ status: "mislukt", fout: "model-afgekapt" });
  });
});
