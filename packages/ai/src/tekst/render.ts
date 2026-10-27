// Van modeluitvoer naar woningtekst (ADR-016, punt 6): het schema voor de gestructureerde uitvoer, en de opmaak in code:
// volgorde en kopstijl uit het profiel, opmaaktekens weg, onbekende secties weg, vaste blokken letterlijk erachter.
import type { JsonSchema } from "../intake/schema";
import type { Schrijfprofiel } from "./schrijfprofiel";

export interface Tekstinhoud {
  inleiding: string;
  secties: { sectie: string; kop: string; tekst: string }[];
}

export interface Tekstuitvoer extends Tekstinhoud {
  gebruikte_feiten: string[];
  aannames: string[];
}

const tekst = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) });

/** Schema voor strikte gestructureerde uitvoer; `sleutels` zijn de secties die in deze tekst mogen. */
export function tekstUitvoerSchema(sleutels: readonly string[]): JsonSchema {
  return {
    type: "object",
    properties: {
      inleiding: tekst("De inleiding, zonder kop."),
      secties: {
        type: "array",
        description: "De secties in volgorde.",
        items: {
          type: "object",
          properties: { sectie: { type: "string", enum: [...sleutels] }, kop: tekst("Kop zonder opmaaktekens."), tekst: tekst("Lopende tekst; alinea's gescheiden door een lege regel.") },
          required: ["sectie", "kop", "tekst"],
          additionalProperties: false,
        },
      },
      gebruikte_feiten: { type: "array", description: "De feiten en steekwoorden die in de tekst zijn gebruikt.", items: tekst() },
      aannames: { type: "array", description: "Wat je hebt aangenomen zonder dat het in de invoer stond; liefst leeg.", items: tekst() },
    },
    required: ["inleiding", "secties", "gebruikte_feiten", "aannames"],
    additionalProperties: false,
  };
}

const schoneKop = (kop: string) => kop.replace(/^[#\s*_]+|[*_\s]+$/g, "").replace(/\*\*|__/g, "").trim();

export function renderTekst(profiel: Schrijfprofiel, uitvoer: Tekstinhoud): { inhoud: Tekstinhoud; tekst: string } {
  const volgorde = profiel.structuur.secties.map((s) => s.sleutel);
  const gezien = new Set<string>();
  const secties = uitvoer.secties
    .filter((s) => volgorde.includes(s.sectie) && !gezien.has(s.sectie) && gezien.add(s.sectie))
    .sort((a, b) => volgorde.indexOf(a.sectie) - volgorde.indexOf(b.sectie))
    .map((s) => ({ sectie: s.sectie, kop: schoneKop(s.kop), tekst: s.tekst.trim() }));
  const inhoud = { inleiding: uitvoer.inleiding.trim(), secties };
  const kop = (k: string) => (profiel.kopstijl === "hoofdletters" ? k.toLocaleUpperCase("nl") : k);
  const blokken = [
    profiel.inleidingLabel.trim() ? `${profiel.inleidingLabel.trim()}\n${inhoud.inleiding}` : inhoud.inleiding,
    ...secties.map((s) => `${kop(s.kop)}\n${s.tekst}`),
    ...profiel.vasteBlokken.filter((b) => b.positie === "einde").map((b) => b.tekst.trim()),
  ];
  return { inhoud, tekst: blokken.join("\n\n") };
}
