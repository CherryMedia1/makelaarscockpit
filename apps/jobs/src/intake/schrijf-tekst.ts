// Schrijven van een woningtekst (ADR-016, stap B4): feiten verzamelen, prompt met profiel en voorbeelden, modelaanroep met
// strikte uitvoer, opmaak en vaste blokken in code, controles en bronnencontrole, en een nieuwe versie. Alleen id's en
// aantallen in de log; de prompt bevat klantdata en wordt alleen als hash bewaard.
import { createHash } from "node:crypto";
import {
  BRONCONTROLE_PROMPT_VERSIE, DEPLOYMENT_MODEL, TEKST_PROMPT_VERSIE, bronnencontroleBerichten, bronnencontroleSchema, kostenEur, leesTekstuitvoer, naarBroncontroles,
  renderTekst, tekstBerichten, tekstUitvoerSchema, toegestaneSecties, valideerSchrijfprofiel, verzamelFeiten, vervangSectie,
  type Bericht, type JsonSchema,
} from "@makelaarscockpit/ai";
import {
  intakeVelden, kiesSchrijfvoorbeelden, metTenant, moduleAan, registreerIntakeVerbruik, schrijfprofielOpId, tekstversies, voegTekstversieToe, woningVanDossier,
  woningtekstOpId, zetWoningtekstMislukt, type Db,
} from "@makelaarscockpit/db";
import { controleerTekst, type Tekstcontrole } from "@makelaarscockpit/domain";
import { DefinitieveFout, type Modelantwoord } from "./modellen";
import type { Uitkomst } from "../wachtrij";

export type TekstBericht = { tenantId: string; woningtekstId: string; sectie: string | null };

export interface Tekstdiensten {
  schrijf(berichten: Bericht[], schema: JsonSchema): Promise<Modelantwoord>;
  controleer(berichten: Bericht[], schema: JsonSchema): Promise<Modelantwoord>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLEUTEL = /^[a-z][a-z0-9_]{0,39}$/;

/** Een bericht van de queue intake-tekst: tenant, woningtekst en eventueel één sectie; verder niets. */
export function leesTekstBericht(body: unknown): TekstBericht | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).length !== 3 || !("sectie" in b)) return null;
  const { tenantId, woningtekstId, sectie } = b;
  if (typeof tenantId !== "string" || !UUID.test(tenantId) || typeof woningtekstId !== "string" || !UUID.test(woningtekstId)) return null;
  if (sectie !== null && (typeof sectie !== "string" || !SLEUTEL.test(sectie))) return null;
  return { tenantId, woningtekstId, sectie };
}

const foutcode = (e: unknown) => (e instanceof DefinitieveFout ? e.code : e instanceof Error && /^[a-z0-9-]{1,60}$/.test(e.message) ? e.message : e instanceof Error ? e.name : "onbekend");

export async function schrijfTekst(db: Db, diensten: Tekstdiensten, bericht: TekstBericht, laatstePoging: boolean): Promise<Uitkomst> {
  const { tenantId, woningtekstId, sectie } = bericht;

  const opdracht = await metTenant(db, tenantId, async (tx) => {
    const tekst = await woningtekstOpId(tx, tenantId, woningtekstId);
    if (!tekst || tekst.status !== "bezig" || !(await moduleAan(tx, tenantId, "intake"))) return null;
    const profielRij = await schrijfprofielOpId(tx, tenantId, tekst.profielId);
    const woning = await woningVanDossier(tx, tenantId, tekst.dossierId);
    return { tekst, profielRij, woning, velden: await intakeVelden(tx, tenantId, tekst.dossierId), huidig: sectie ? (await tekstversies(tx, tenantId, woningtekstId))[0] ?? null : null };
  });
  if (!opdracht) {
    console.log(`tekst: woningtekst ${woningtekstId} overgeslagen`);
    return "overgeslagen";
  }
  const { tekst, profielRij, woning, velden, huidig } = opdracht;
  const fout = async (code: string) => {
    await metTenant(db, tenantId, (tx) => zetWoningtekstMislukt(tx, tenantId, woningtekstId, code));
    console.error(`tekst: woningtekst ${woningtekstId} mislukt: ${code}`);
    return "mislukt" as const;
  };
  const geldig = valideerSchrijfprofiel(profielRij?.profiel);
  if (!profielRij || !geldig.geldig) return fout("profiel-ongeldig");
  if (!woning) return fout("woning-onbekend");
  const profiel = geldig.profiel;

  try {
    const feiten = verzamelFeiten({ woning, velden, steekwoorden: tekst.steekwoorden, profiel, categorie: tekst.woningcategorie });
    const voorbeelden = await metTenant(db, tenantId, (tx) => kiesSchrijfvoorbeelden(tx, tenantId, feiten.woningcategorie, profiel.model.voorbeelden));
    const berichten = tekstBerichten(profiel, feiten, voorbeelden, sectie && huidig ? { sectie, huidig: huidig.inhoud } : undefined);
    const schrijven = await diensten.schrijf(berichten, tekstUitvoerSchema(toegestaneSecties(profiel, feiten.steekwoorden)));
    const uitvoer = leesTekstuitvoer(schrijven.json);
    if (!uitvoer) throw new DefinitieveFout("model-ongeldige-tekst");

    const { inhoud, tekst: gerenderd } = renderTekst(profiel, sectie && huidig ? vervangSectie(huidig.inhoud, uitvoer, sectie) : uitvoer);
    const controles: Tekstcontrole[] = controleerTekst({
      secties: profiel.structuur.secties,
      ingevuld: Object.keys(feiten.steekwoorden),
      adres: feiten.adres,
      plaats: feiten.plaats,
      lengte: profiel.lengte[feiten.woningcategorie],
      inhoud,
    });

    // De bronnencontrole is een extra vangnet: mislukt die, dan komt de tekst er wel, met een melding.
    let controleren: Modelantwoord | null = null;
    try {
      controleren = await diensten.controleer(bronnencontroleBerichten(feiten, inhoud), bronnencontroleSchema(inhoud));
      controles.push(...naarBroncontroles(inhoud, controleren.json));
    } catch (e) {
      console.warn(`tekst: bronnencontrole voor woningtekst ${woningtekstId} mislukt: ${foutcode(e)}`);
      controles.push({ soort: "bron-niet-gecontroleerd", melding: "De bronnencontrole kon niet worden uitgevoerd; controleer zelf of elk kenmerk klopt." });
    }

    await metTenant(db, tenantId, async (tx) => {
      await voegTekstversieToe(tx, tenantId, woningtekstId, {
        bron: "model",
        profielId: profielRij.id,
        inhoud,
        tekst: gerenderd,
        feiten,
        controles,
        model: DEPLOYMENT_MODEL.tekst,
        promptVersie: TEKST_PROMPT_VERSIE,
        promptHash: createHash("sha256").update(JSON.stringify(berichten)).digest("hex").slice(0, 16),
      }, null);
      const verbruik = (stap: string, model: string, a: Modelantwoord) =>
        registreerIntakeVerbruik(tx, tenantId, { dossierId: tekst.dossierId, stap, model, inputTokens: a.tokens.input, outputTokens: a.tokens.output, kostenEur: kostenEur(model, a.tokens) });
      await verbruik(TEKST_PROMPT_VERSIE, DEPLOYMENT_MODEL.tekst, schrijven);
      if (controleren) await verbruik(BRONCONTROLE_PROMPT_VERSIE, DEPLOYMENT_MODEL.controle, controleren);
    });
    console.log(
      `tekst: woningtekst ${woningtekstId} geschreven${sectie ? ` (sectie ${sectie})` : ""}: ${inhoud.secties.length} secties, ${controles.length} controlemelding(en), ` +
        `${feiten.weggelaten.length} persoonsgegeven(s) weggelaten; tokens ${schrijven.tokens.input}/${schrijven.tokens.output}`,
    );
    return "verwerkt";
  } catch (e) {
    if (laatstePoging || e instanceof DefinitieveFout) return fout(foutcode(e));
    console.error(`tekst: woningtekst ${woningtekstId} later opnieuw: ${foutcode(e)}`);
    return "opnieuw";
  }
}
