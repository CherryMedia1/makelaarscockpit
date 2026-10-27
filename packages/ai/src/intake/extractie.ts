// Extractie van het woningprofiel uit een transcript of document (stap A7, ADR-014): de prompt, PDF-tekst per pagina,
// de controle dat een citaat echt in de bron staat, en de kosten per aanroep voor intake_verbruik.

/** Versie van de prompt; komt in intake_verbruik.stap, zodat de evaluatie in fase B versies kan vergelijken. */
export const EXTRACTIE_PROMPT_VERSIE = "extractie-v1";

const SYSTEEM = `Je haalt feiten over een woning uit een bron van een Nederlands makelaarskantoor: een transcript van het intakegesprek tussen makelaar en verkoper, of een document zoals een gespreksverslag, ingevulde checklist of meetrapport.

Werkwijze:
- Vul alleen velden waarover de bron iets zegt. Zegt de bron er niets over, of is het onduidelijk, dan is het veld null. Raad nooit en vul niets aan uit algemene kennis.
- Elk ingevuld veld heeft bewijs: een citaat dat letterlijk uit de bron is overgenomen (zelfde woorden, zelfde volgorde, hoogstens een paar zinnen). Velden zonder letterlijk citaat worden weggegooid.
- Bij een transcript is de tijdstempel de dichtstbijzijnde tijdstempel vóór het citaat, zoals hij in de tekst staat (bijv. 00:01:05); pagina is dan null. Bij een document is pagina het nummer uit de kop "=== Pagina N ===" waaronder het citaat staat; tijdstempel is dan null.
- Zekerheid is een getal tussen 0 en 1: 1 als de bron het expliciet en eenduidig zegt, lager als het indirect is, als de spreker twijfelt of als het later in het gesprek wordt tegengesproken. Bij tegenstrijdige uitspraken neem je de laatste en verlaag je de zekerheid.
- Getallen als getal (oppervlakte in m², inhoud in m³, jaartallen als heel getal). "Zestig vierkante meter" wordt 60.
- Keuzevelden alleen met een waarde uit de toegestane lijst; past geen enkele waarde, dan null.
- Lijsten (apparatuur, sanitair, onderhoud, verkoopargumenten, zaken): één item per afzonderlijk ding; geen dubbele items.
- Verkoopargumenten in de woorden van de verkoper. Zaken: wat de verkoper meeneemt of wil laten overnemen.
- Wat de makelaar alleen vraagt of voorstelt, zonder bevestiging van de verkoper, is geen feit.
- Schrijf waarden in het Nederlands, zoals in de bron; vertaal niets.`;

export type Bronsoort = "transcript" | "document";

export interface Bericht {
  role: "system" | "user";
  content: string;
}

export function extractieBerichten(soort: Bronsoort, tekst: string): Bericht[] {
  const inleiding =
    soort === "transcript"
      ? "Hieronder staat het transcript van het intakegesprek. Regels beginnen met een tijdstempel tussen blokhaken."
      : "Hieronder staat de tekst van een document, per pagina onder een kop \"=== Pagina N ===\".";
  return [
    { role: "system", content: SYSTEEM },
    { role: "user", content: `${inleiding}\n\n<bron>\n${tekst.trim()}\n</bron>` },
  ];
}

/** De delen van een Content Understanding-resultaat die we gebruiken (prebuilt-layout, één document). */
export interface DocumentInhoud {
  markdown?: string | undefined;
  pages?: { pageNumber: number; spans?: { offset: number; length: number }[] | undefined }[] | undefined;
}

/**
 * Zet het resultaat van prebuilt-layout om naar tekst met een kop per pagina, zodat het model een paginanummer als
 * bewijs kan geven. Spans tellen in codepoints (standaard van Content Understanding), niet in UTF-16-eenheden.
 */
export function documentAlsTekst(inhoud: DocumentInhoud): string {
  const markdown = inhoud.markdown ?? "";
  const tekens = Array.from(markdown);
  const paginas = (inhoud.pages ?? []).filter((p) => p.spans && p.spans.length > 0);
  if (paginas.length === 0) return `=== Pagina 1 ===\n${markdown.trim()}`;
  return paginas
    .map((p) => `=== Pagina ${p.pageNumber} ===\n${p.spans!.map((s) => tekens.slice(s.offset, s.offset + s.length).join("")).join("\n").trim()}`)
    .join("\n\n");
}

const normaliseer = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Staat het citaat (na normaliseren van hoofdletters, witruimte en aanhalingstekens) letterlijk in de bron? */
export function citaatKomtVoor(bron: string, citaat: string): boolean {
  const c = normaliseer(citaat);
  return c.length > 0 && normaliseer(bron).includes(c);
}

/** Model achter elke logische deployment; gelijk houden met infra/bicep/modules/foundry.bicep (ADR-014). */
export const DEPLOYMENT_MODEL = { extractie: "gpt-5.4", controle: "gpt-5.4-mini" } as const;

/** Grens per dossier waarboven de verwerking waarschuwt (plan §9; doel is €3). */
export const KOSTENGRENS_DOSSIER_EUR = 5;

/**
 * Tarieven in euro per miljoen tokens, Data Zone Standard (EU), Sweden Central, volgens de Azure Retail Prices API
 * op 2026-10-27. Bij een nieuw model of nieuwe tarieven: hier bijwerken.
 */
export const TARIEVEN_EUR: Record<string, { input: number; gecachet: number; output: number }> = {
  "gpt-5.4": { input: 2.4199, gecachet: 0.242, output: 14.5195 },
  "gpt-5.4-mini": { input: 0.726, gecachet: 0.0726, output: 4.3559 },
};

/** Content Understanding, Document Content Extraction (standard), per pagina; zelfde bron en datum. */
export const PDF_TEKST_EUR_PER_PAGINA = 4.3999 / 1000;

/** `input` is het totaal aan invoertokens, waarvan `gecachet` tegen het lagere tarief. Redeneertokens zitten in `output`. */
export function kostenEur(model: string, tokens: { input: number; gecachet: number; output: number }): number {
  const t = TARIEVEN_EUR[model];
  if (!t) throw new Error(`onbekend model '${model}' in TARIEVEN_EUR`);
  return ((tokens.input - tokens.gecachet) * t.input + tokens.gecachet * t.gecachet + tokens.output * t.output) / 1_000_000;
}
