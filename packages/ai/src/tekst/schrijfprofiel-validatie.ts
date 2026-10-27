// Schrijfprofielen (ADR-016): validatie tegen het JSON Schema plus samenhang, en de voorbereiding van de profielgenerator
// (een concept-profiel afleiden uit bestaande teksten van een kantoor). De generator zelf is een vervolgtaak.
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Bericht } from "../intake/extractie";
import schemaJson from "./schrijfprofiel.schema.json" with { type: "json" };
import type { Schrijfprofiel } from "./schrijfprofiel";

export const schrijfprofielSchema = schemaJson;

const valideer = new Ajv2020({ allErrors: true }).compile<Schrijfprofiel>(schemaJson);

const dubbel = (waarden: string[]) => [...new Set(waarden.filter((w, i) => waarden.indexOf(w) !== i))];

/** Fouten in de samenhang die het schema niet kan uitdrukken; in de volgorde vragenlijst, secties, lengte, blokken. */
function samenhang(p: Schrijfprofiel): string[] {
  const fouten: string[] = [];
  const vragen = p.vragenlijst.map((v) => v.sleutel);
  for (const d of dubbel(vragen)) fouten.push(`vraag '${d}' staat meer dan eens in de vragenlijst`);
  for (const d of dubbel(p.structuur.secties.map((s) => s.sleutel))) fouten.push(`sectie '${d}' staat meer dan eens in de structuur`);
  for (const s of p.structuur.secties) {
    for (const i of s.invoer) if (!vragen.includes(i)) fouten.push(`sectie '${s.sleutel}' verwijst naar onbekende vraag '${i}'`);
    if (!s.vrijeKop && s.standaardkop.trim() === "") fouten.push(`sectie '${s.sleutel}' heeft geen standaardkop en geen vrije kop`);
  }
  const gebruikt = new Set(p.structuur.secties.flatMap((s) => s.invoer));
  for (const v of new Set(vragen)) if (!gebruikt.has(v)) fouten.push(`vraag '${v}' wordt door geen enkele sectie gebruikt`);
  for (const [categorie, b] of Object.entries(p.lengte)) if (b.min > b.max) fouten.push(`lengte voor ${categorie}: minimum is groter dan maximum`);
  for (const d of dubbel(p.vasteBlokken.map((b) => b.sleutel))) fouten.push(`vast blok '${d}' staat meer dan eens in het profiel`);
  return fouten;
}

export function valideerSchrijfprofiel(profiel: unknown): { geldig: true; profiel: Schrijfprofiel } | { geldig: false; fouten: string[] } {
  if (!valideer(profiel)) return { geldig: false, fouten: (valideer.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message ?? ""}${f.params && "missingProperty" in f.params ? ` (${String(f.params.missingProperty)})` : ""}`.trim()) };
  const fouten = samenhang(profiel);
  return fouten.length === 0 ? { geldig: true, profiel } : { geldig: false, fouten };
}

export type Woningcategorie = keyof Schrijfprofiel["lengte"];

/** Versie van de analyseprompt van de profielgenerator. */
export const PROFIELANALYSE_PROMPT_VERSIE = "profielanalyse-v1";

const ANALYSE = `Je analyseert woningteksten van één Nederlands makelaarskantoor en stelt een schrijfprofiel voor volgens het meegegeven JSON-schema. Het profiel wordt een concept dat een medewerker van het kantoor controleert voordat het actief wordt.

Werkwijze:
- Leid de vaste opbouw af: hoe de inleiding opent en eindigt, welke secties in welke volgorde terugkomen, welke koppen het kantoor gebruikt (standaardkop en varianten), waar koppen vrij zijn.
- Leid de vragenlijst af: per sectie de onderwerpen waarover een medewerker steekwoorden zou invullen.
- Beschrijf de toon: aanspreekvorm, stijlregels, kenmerkende zinsconstructies en wat het kantoor vermijdt. Citeer kenmerkende constructies kort.
- Bepaal per woningcategorie (appartement, eengezinswoning, vrijstaand) een bandbreedte in woorden op basis van de teksten, zonder vaste blokken.
- Kopstijl: titel of hoofdletters, zoals de meerderheid van de teksten.
- Vaste blokken (disclaimers, clausules) neem je letterlijk over, teken voor teken.
- Neem geen adressen, namen of andere gegevens over die bij één woning of persoon horen.`;

/**
 * Berichten voor de profielgenerator (stub, ADR-016 punt 10): 3 tot 5 teksten van een kantoor in, een concept-profiel
 * volgens `schrijfprofielSchema` uit. De modelaanroep en het opslaan als concept volgen in een vervolgtaak.
 */
export function profielAnalyseBerichten(teksten: readonly { titel: string; woningtype: Woningcategorie; tekst: string }[]): Bericht[] {
  if (teksten.length < 3 || teksten.length > 5) throw new Error("de profielgenerator vraagt drie tot vijf teksten");
  const bron = teksten.map((t) => `<tekst titel="${t.titel.replace(/"/g, "'")}" woningtype="${t.woningtype}">\n${t.tekst.trim()}\n</tekst>`).join("\n\n");
  return [
    { role: "system", content: ANALYSE },
    { role: "user", content: `Hieronder staan ${teksten.length} woningteksten van het kantoor.\n\n${bron}` },
  ];
}
