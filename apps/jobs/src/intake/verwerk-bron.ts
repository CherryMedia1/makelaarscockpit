// Verwerking van één intakebron (stap A7, ADR-013): bestand lezen, PDF naar tekst, velden extraheren met bewijs,
// samenvoegen in het profiel en het verbruik vastleggen. Idempotent op het bron-id. Alleen id's en aantallen in de log.
import {
  DEPLOYMENT_MODEL, EXTRACTIE_PROMPT_VERSIE, KOSTENGRENS_DOSSIER_EUR, PDF_TEKST_EUR_PER_PAGINA, extractieBerichten, extractieSchema, kostenEur, naarVeldvoorstellen,
  type Bericht, type JsonSchema,
} from "@makelaarscockpit/ai";
import {
  intakeKostenDossier, leesIntakeBron, metTenant, moduleAan, registreerIntakeVerbruik, verwerkVeldvoorstellen, zetIntakeBronStatus, type Db,
} from "@makelaarscockpit/db";
import type { BronType } from "@makelaarscockpit/domain";
import { DefinitieveFout, type Modelantwoord } from "./modellen";
import type { Uitkomst } from "../wachtrij";

export type IntakeBericht = { tenantId: string; dossierId: string; bronId: string };

/** De externe diensten, los gehouden zodat de integratietest ze kan vervangen door opgenomen antwoorden. */
export interface Diensten {
  leesBlob(container: string, pad: string): Promise<Buffer>;
  pdfAlsTekst(inhoud: Uint8Array): Promise<{ tekst: string; paginas: number }>;
  extraheer(berichten: Bericht[], schema: JsonSchema): Promise<Modelantwoord>;
}

export type { Uitkomst };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Een bericht van de queue bevat precies drie id's; al het andere is ongeldig. */
export function leesBericht(body: unknown): IntakeBericht | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).length !== 3) return null;
  const { tenantId, dossierId, bronId } = b;
  return [tenantId, dossierId, bronId].every((v) => typeof v === "string" && UUID.test(v)) ? { tenantId, dossierId, bronId } as IntakeBericht : null;
}

const SOORT: Partial<Record<BronType, "transcript" | "pdf">> = {
  plaud_transcript: "transcript",
  gespreksverslag_pdf: "pdf",
  checklist_pdf: "pdf",
  meetrapport: "pdf",
};

/** Ruim boven een transcript van twee uur; een grotere bron is vrijwel zeker iets anders dan een intake. */
const MAX_TEKENS = 400_000;

const foutcode = (e: unknown) => (e instanceof DefinitieveFout ? e.code : e instanceof Error && /^[a-z0-9-]{1,60}$/.test(e.message) ? e.message : e instanceof Error ? e.name : "onbekend");

/**
 * Verwerkt één bron. `laatstePoging` is waar als de wachtrij het bericht niet nog eens aanbiedt; een tijdelijke fout
 * wordt dan `mislukt`, anders gaat de bron terug naar `nieuw` en probeert de wachtrij het later opnieuw.
 */
export async function verwerkBron(db: Db, diensten: Diensten, bericht: IntakeBericht, laatstePoging: boolean): Promise<Uitkomst> {
  const { tenantId, dossierId, bronId } = bericht;

  const bron = await metTenant(db, tenantId, async (tx) => {
    const b = await leesIntakeBron(tx, tenantId, bronId);
    if (!b || b.dossierId !== dossierId || !(await moduleAan(tx, tenantId, "intake"))) return null;
    if (b.verwerkstatus === "verwerkt" || b.verwerkstatus === "verwijderd") return null;
    if (!SOORT[b.type] || !b.blobPad) {
      await zetIntakeBronStatus(tx, tenantId, bronId, "mislukt", "soort-niet-ondersteund");
      return null;
    }
    await zetIntakeBronStatus(tx, tenantId, bronId, "bezig");
    return { type: b.type, soort: SOORT[b.type]!, blobPad: b.blobPad };
  });
  if (!bron) {
    console.log(`intake: bron ${bronId} overgeslagen`);
    return "overgeslagen";
  }

  try {
    const inhoud = await diensten.leesBlob("intake", bron.blobPad);
    let tekst: string;
    if (bron.soort === "pdf") {
      const pdf = await diensten.pdfAlsTekst(new Uint8Array(inhoud));
      tekst = pdf.tekst;
      // Apart vastleggen: deze kosten zijn gemaakt, ook als de extractie hierna mislukt.
      await metTenant(db, tenantId, (tx) =>
        registreerIntakeVerbruik(tx, tenantId, { dossierId, stap: "pdf-tekst", model: "prebuilt-layout", inputTokens: 0, outputTokens: 0, kostenEur: pdf.paginas * PDF_TEKST_EUR_PER_PAGINA }),
      );
    } else {
      tekst = inhoud.toString("utf8");
    }
    if (tekst.length > MAX_TEKENS) throw new DefinitieveFout("bron-te-groot");
    if (tekst.trim() === "") throw new DefinitieveFout("bron-leeg");

    const antwoord = await diensten.extraheer(extractieBerichten(bron.soort === "pdf" ? "document" : "transcript", tekst), extractieSchema());
    const { voorstellen, weggegooid } = naarVeldvoorstellen(antwoord.json, undefined, tekst);

    const { telling, totaal } = await metTenant(db, tenantId, async (tx) => {
      const telling = await verwerkVeldvoorstellen(tx, tenantId, dossierId, { id: bronId, type: bron.type }, voorstellen);
      await registreerIntakeVerbruik(tx, tenantId, {
        dossierId,
        stap: EXTRACTIE_PROMPT_VERSIE,
        model: DEPLOYMENT_MODEL.extractie,
        inputTokens: antwoord.tokens.input,
        outputTokens: antwoord.tokens.output,
        kostenEur: kostenEur(DEPLOYMENT_MODEL.extractie, antwoord.tokens),
      });
      await zetIntakeBronStatus(tx, tenantId, bronId, "verwerkt");
      return { telling, totaal: await intakeKostenDossier(tx, tenantId, dossierId) };
    });

    const perReden = new Map<string, number>();
    for (const w of weggegooid) perReden.set(w.reden, (perReden.get(w.reden) ?? 0) + 1);
    const redenen = [...perReden].map(([r, n]) => `${n} ${r}`).join(", ") || "geen";
    console.log(
      `intake: bron ${bronId} verwerkt in dossier ${dossierId}: ${telling.toevoegen} nieuw, ${telling.vervangen} vervangen, ${telling.markeerConflict} conflict, ` +
        `${telling.overslaan} al bekend; weggegooid: ${redenen}; tokens ${antwoord.tokens.input}/${antwoord.tokens.output}`,
    );
    if (totaal > KOSTENGRENS_DOSSIER_EUR) console.warn(`intake: dossier ${dossierId} kost € ${totaal.toFixed(2)} aan AI, boven de grens van € ${KOSTENGRENS_DOSSIER_EUR}`);
    return "verwerkt";
  } catch (e) {
    const code = foutcode(e);
    const definitief = laatstePoging || e instanceof DefinitieveFout;
    await metTenant(db, tenantId, (tx) => zetIntakeBronStatus(tx, tenantId, bronId, definitief ? "mislukt" : "nieuw", definitief ? code : null));
    console.error(`intake: bron ${bronId} ${definitief ? "mislukt" : "later opnieuw"}: ${code}`);
    return definitief ? "mislukt" : "opnieuw";
  }
}
