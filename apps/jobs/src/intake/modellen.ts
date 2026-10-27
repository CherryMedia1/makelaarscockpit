// Aanroepen naar Microsoft Foundry (ADR-014) met de managed identity: gestructureerde extractie via de OpenAI v1-API en
// PDF naar tekst via Content Understanding (prebuilt-layout). Verwerking blijft in de EU-datazone; geen sleutels.
// Fouten bevatten alleen een code, nooit inhoud uit de bron of het antwoord.
import { ContentUnderstandingClient, type DocumentContent } from "@azure/ai-content-understanding";
import { documentAlsTekst, type Bericht, type JsonSchema } from "@makelaarscockpit/ai";
import { credential, omgeving } from "../azure";

const SCOPE = "https://cognitiveservices.azure.com/.default";

/** Een fout die bij opnieuw proberen niet verdwijnt (afgekapt antwoord, weigering, te grote bron). */
export class DefinitieveFout extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DefinitieveFout";
  }
}

export interface Modelantwoord {
  json: unknown;
  tokens: { input: number; gecachet: number; output: number };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chat completion met strikte gestructureerde output. `deployment` is de logische naam uit foundry.bicep. */
export async function vraagGestructureerd(deployment: string, berichten: Bericht[], schema: JsonSchema, naam: string): Promise<Modelantwoord> {
  const url = `${omgeving("FOUNDRY_ENDPOINT").replace(/\/$/, "")}/openai/v1/chat/completions`;
  const body = JSON.stringify({
    model: deployment,
    messages: berichten,
    response_format: { type: "json_schema", json_schema: { name: naam, strict: true, schema } },
    max_completion_tokens: 32_000,
  });

  for (let poging = 1; ; poging++) {
    const token = await credential.getToken(SCOPE);
    const antwoord = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(300_000),
    });
    // Te druk of tijdelijke storing: kort wachten en opnieuw; daarna laat de wachtrij het later nog eens proberen.
    if ((antwoord.status === 429 || antwoord.status >= 500) && poging < 3) {
      const na = Number(antwoord.headers.get("retry-after"));
      await wacht(Math.min(30, Number.isFinite(na) && na > 0 ? na : 5 * poging) * 1000);
      continue;
    }
    if (antwoord.status === 400) throw new DefinitieveFout("model-400");
    if (!antwoord.ok) throw new Error(`model-${antwoord.status}`);

    const data = (await antwoord.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const keuze = data.choices?.[0];
    if (keuze?.message?.refusal) throw new DefinitieveFout("model-geweigerd");
    if (keuze?.finish_reason === "length") throw new DefinitieveFout("model-afgekapt");
    if (keuze?.finish_reason === "content_filter") throw new DefinitieveFout("model-inhoudsfilter");
    let json: unknown;
    try {
      json = JSON.parse(keuze?.message?.content ?? "");
    } catch {
      throw new DefinitieveFout("model-ongeldige-json");
    }
    return {
      json,
      tokens: {
        input: data.usage?.prompt_tokens ?? 0,
        gecachet: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

let cu: ContentUnderstandingClient | undefined;

/** PDF naar tekst met een kop per pagina. prebuilt-layout heeft geen taalmodel nodig; verwerking in de EU-datazone. */
export async function pdfAlsTekst(inhoud: Uint8Array): Promise<{ tekst: string; paginas: number }> {
  cu ??= new ContentUnderstandingClient(omgeving("CONTENT_UNDERSTANDING_ENDPOINT"), credential);
  // Zonder processingLocation is de standaard "global": dan kan de verwerking buiten de EU plaatsvinden.
  const resultaat = await cu.analyzeBinary("prebuilt-layout", inhoud, "application/pdf", { processingLocation: "dataZone" }).pollUntilDone();
  const document = resultaat.contents?.find((c): c is DocumentContent => c.kind === "document");
  if (!document) throw new DefinitieveFout("pdf-geen-document");
  const tekst = documentAlsTekst({ markdown: document.markdown, pages: document.pages });
  return { tekst, paginas: Math.max(1, document.endPageNumber - document.startPageNumber + 1) };
}
