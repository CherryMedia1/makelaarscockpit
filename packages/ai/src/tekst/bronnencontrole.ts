// Bronnencontrole (ADR-016, punt 7): een tweede, kleiner model zoekt concrete beweringen in de woningtekst die niet uit de
// feiten of steekwoorden volgen. Plus de hulpfuncties rond een modelantwoord: vorm controleren en één sectie vervangen.
import { citaatKomtVoor, type Bericht } from "../intake/extractie";
import type { JsonSchema } from "../intake/schema";
import type { Tekstfeiten } from "./feiten";
import type { Tekstinhoud, Tekstuitvoer } from "./render";

export const BRONCONTROLE_PROMPT_VERSIE = "tekstcontrole-v1";

const SYSTEEM = `Je controleert een woningtekst van een makelaarskantoor tegen de feiten waarop hij gebaseerd moet zijn.

Noem elke concrete bewering over de woning of de omgeving die niet uit de feiten of steekwoorden volgt: een kenmerk, ruimte, maat, aantal, materiaal, merk, voorziening, bouwjaar, energielabel of iets in de buurt.
Geen bewering zijn: sfeer en beleving ("heerlijk licht"), een voordeel of gebruiksmoment bij een kenmerk dat wel in de feiten staat, een uitnodiging tot bezichtiging, en algemene typeringen van een plaats.
Geef per bewering het letterlijke stuk tekst (zo kort mogelijk, uit de tekst overgenomen), het onderdeel waarin het staat, en in één zin wat er niet klopt. Is alles gedekt, geef dan een lege lijst.`;

const vorm = (inhoud: Tekstinhoud) => [`[inleiding]\n${inhoud.inleiding}`, ...inhoud.secties.map((s) => `[${s.sectie}] ${s.kop}\n${s.tekst}`)].join("\n\n");

export function bronnencontroleBerichten(feiten: Tekstfeiten, inhoud: Tekstinhoud): Bericht[] {
  const regels = [
    `Adres: ${feiten.adres ?? "onbekend"}`,
    `Plaats: ${feiten.plaats ?? "onbekend"}`,
    feiten.energielabel ? `Energielabel: ${feiten.energielabel}` : "",
    ...feiten.bevestigd.map((b) => `- ${b.label}: ${b.waarde}`),
    ...Object.entries(feiten.steekwoorden).map(([k, v]) => `- ${k}: ${v}`),
  ].filter(Boolean);
  return [
    { role: "system", content: SYSTEEM },
    { role: "user", content: `<feiten>\n${regels.join("\n")}\n</feiten>\n\n<tekst>\n${vorm(inhoud)}\n</tekst>` },
  ];
}

export function bronnencontroleSchema(inhoud: Tekstinhoud): JsonSchema {
  return {
    type: "object",
    properties: {
      beweringen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            onderdeel: { type: "string", enum: ["inleiding", ...inhoud.secties.map((s) => s.sectie)] },
            citaat: { type: "string", description: "Letterlijk stuk uit de tekst." },
            toelichting: { type: "string", description: "Wat er niet klopt, in één zin." },
          },
          required: ["onderdeel", "citaat", "toelichting"],
          additionalProperties: false,
        },
      },
    },
    required: ["beweringen"],
    additionalProperties: false,
  };
}

export interface Broncontrole {
  soort: "bron";
  sectie: string;
  melding: string;
}

/** Beweringen uit de bronnencontrole als controles; een citaat dat niet in de tekst staat, is zelf verzonnen en valt weg. */
export function naarBroncontroles(inhoud: Tekstinhoud, antwoord: unknown): Broncontrole[] {
  const beweringen = (antwoord as { beweringen?: unknown })?.beweringen;
  if (!Array.isArray(beweringen)) return [];
  const tekstVan = (onderdeel: string) => (onderdeel === "inleiding" ? inhoud.inleiding : inhoud.secties.filter((s) => s.sectie === onderdeel).map((s) => `${s.kop}\n${s.tekst}`).join("\n"));
  return beweringen
    .filter((b): b is { onderdeel: string; citaat: string; toelichting: string } => typeof b?.onderdeel === "string" && typeof b?.citaat === "string" && typeof b?.toelichting === "string")
    .filter((b) => citaatKomtVoor(tekstVan(b.onderdeel), b.citaat))
    .map((b) => ({ soort: "bron" as const, sectie: b.onderdeel, melding: `'${b.citaat}': ${b.toelichting}` }));
}

/** Controleert de vorm van een modelantwoord voor een woningtekst; null als het niet klopt. */
export function leesTekstuitvoer(antwoord: unknown): Tekstuitvoer | null {
  const a = antwoord as Partial<Tekstuitvoer> | null;
  if (!a || typeof a.inleiding !== "string" || !Array.isArray(a.secties)) return null;
  if (!a.secties.every((s) => typeof s?.sectie === "string" && typeof s?.kop === "string" && typeof s?.tekst === "string")) return null;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return { inleiding: a.inleiding, secties: a.secties, gebruikte_feiten: strings(a.gebruikte_feiten), aannames: strings(a.aannames) };
}

/** Bij "deze sectie opnieuw": neem uit de nieuwe tekst alleen die sectie (of de inleiding) over. */
export function vervangSectie(huidig: Tekstinhoud, nieuw: Tekstinhoud, sectie: string): Tekstinhoud {
  if (sectie === "inleiding") return { ...huidig, inleiding: nieuw.inleiding.trim() || huidig.inleiding };
  const vervanging = nieuw.secties.find((s) => s.sectie === sectie);
  if (!vervanging) return huidig;
  return { ...huidig, secties: huidig.secties.map((s) => (s.sectie === sectie ? vervanging : s)) };
}
