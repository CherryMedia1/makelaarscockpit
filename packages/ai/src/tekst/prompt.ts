// De prompt voor een woningtekst (ADR-016, punt 2 en 6): generieke basisregels voor elk kantoor, daarna het schrijfprofiel
// van het kantoor en een paar voorbeeldteksten; de feiten en steekwoorden in het gebruikersbericht.
import type { Bericht } from "../intake/extractie";
import { toegestaneSecties, type Tekstfeiten } from "./feiten";
import type { Tekstinhoud } from "./render";
import type { Schrijfprofiel } from "./schrijfprofiel";

/** Versie van de prompt; komt in de tekstversie en in intake_verbruik.stap. */
export const TEKST_PROMPT_VERSIE = "tekst-v1";

const BASIS = `Je schrijft woningteksten voor een Nederlands makelaarskantoor, in de stijl van dat kantoor.

Basisregels; die gaan altijd voor, ook als een voorbeeldtekst het anders doet:
- Verzin geen kenmerken, maten, materialen, merken of voorzieningen die niet in de feiten of steekwoorden staan. Een voordeel of gebruiksmoment bij een kenmerk mag wel ("een overkapping: ook bij een buitje zit je droog").
- Noem geen persoonsgegevens van verkopers of bewoners.
- Doe geen uitspraken over waardeontwikkeling, rendement, vergunningen of andere juridische zaken.
- Over de omgeving alleen wat in de invoer staat, plus algemene, niet-controversiële typeringen.
- Correct Nederlands. Geen Engelse woorden waar een gangbaar Nederlands woord bestaat.
- De voorbeeldteksten laten de stijl zien. Neem er geen zinnen, feiten of fouten letterlijk uit over.
- Schrijf geen vaste blokken zoals clausules of disclaimers; die voegt het systeem zelf toe.
- Koppen zonder opmaaktekens (geen #, geen sterretjes). Geen opsommingstekens in de tekst.
- Gebruik alleen de secties uit de lijst "Secties" in het bericht, in de volgorde van het profiel.`;

const lijst = (regels: readonly string[]) => regels.map((r) => `- ${r}`).join("\n");
const vul = (tekst: string, f: Tekstfeiten) => tekst.replaceAll("{plaats}", f.plaats ?? "de plaats");

function profielTekst(p: Schrijfprofiel, f: Tekstfeiten): string {
  const secties = p.structuur.secties.map((s) => {
    const koppen = [s.standaardkop, ...s.varianten].filter(Boolean).map((k) => `'${vul(k, f)}'`);
    const kop = s.vrijeKop
      ? `eigen kop in dezelfde stijl${koppen.length ? `, bijvoorbeeld ${koppen.join(" of ")}` : ""}`
      : `kop ${koppen[0]}${koppen.length > 1 ? `; ook toegestaan: ${koppen.slice(1).join(", ")}` : ""}`;
    return `- ${s.sleutel} (${s.rol}): ${kop}${s.optioneel ? "; mag weg als de sectie niets toevoegt" : ""}`;
  });
  const lengte = p.lengte[f.woningcategorie];
  return [
    `<profiel naam="${p.naam}">`,
    `Inleiding (zonder kop):\n${lijst(p.structuur.inleidingRegels.map((r) => vul(r, f)))}`,
    `Secties in deze volgorde:\n${secties.join("\n")}`,
    `Afsluiting:\n${lijst(p.structuur.afsluitingRegels)}`,
    `Toon (aanspreekvorm: ${p.toon.aanspreekvorm}):\n${lijst(p.toon.regels)}`,
    p.toon.signatuur.length ? `Kenmerkende constructies (gebruik er een paar, niet allemaal):\n${lijst(p.toon.signatuur)}` : "",
    p.toon.vermijden.length ? `Vermijd:\n${lijst(p.toon.vermijden)}` : "",
    `Koppen in ${p.kopstijl === "hoofdletters" ? "hoofdletters" : "titelstijl, zoals in de koppen hierboven"}.`,
    `Lengte: tussen ${lengte.min} en ${lengte.max} woorden (${f.woningcategorie}), zonder vaste blokken.`,
    "</profiel>",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function zonderVasteBlokken(tekst: string, p: Schrijfprofiel): string {
  return p.vasteBlokken.reduce((t, b) => t.replace(b.tekst.trim(), ""), tekst).trim();
}

/**
 * Berichten voor één woningtekst. Met `opnieuw` alleen die sectie opnieuw: het model geeft de hele tekst terug, maar de
 * aanroeper neemt daar alleen die sectie uit over.
 */
export function tekstBerichten(
  profiel: Schrijfprofiel,
  feiten: Tekstfeiten,
  voorbeelden: readonly { titel: string; tekst: string }[],
  opnieuw?: { sectie: string; huidig: Tekstinhoud },
): Bericht[] {
  const vb = voorbeelden.length
    ? `<voorbeelden>\n${voorbeelden.map((v) => `<voorbeeld titel="${v.titel.replace(/"/g, "'")}">\n${zonderVasteBlokken(v.tekst, profiel)}\n</voorbeeld>`).join("\n")}\n</voorbeelden>`
    : "";
  const labels = new Map(profiel.vragenlijst.map((v) => [v.sleutel, v.label]));
  const woning = [
    `Adres: ${feiten.adres ?? "onbekend"}`,
    `Plaats: ${feiten.plaats ?? "onbekend"}`,
    feiten.energielabel ? `Energielabel: ${feiten.energielabel}` : "",
    `Woningcategorie: ${feiten.woningcategorie}`,
  ].filter(Boolean);
  const steekwoorden = profiel.vragenlijst.filter((v) => feiten.steekwoorden[v.sleutel]).map((v) => `- ${labels.get(v.sleutel)}: ${feiten.steekwoorden[v.sleutel]}`);
  const opdracht = opnieuw
    ? `Schrijf alleen de sectie '${opnieuw.sectie}' opnieuw, anders dan nu. Geef de hele tekst terug; de andere onderdelen neem je ongewijzigd over.\n\n<huidige_tekst>\n${opnieuw.huidig.inleiding}\n\n${opnieuw.huidig.secties.map((s) => `[${s.sectie}] ${s.kop}\n${s.tekst}`).join("\n\n")}\n</huidige_tekst>`
    : "Schrijf de woningtekst.";
  return [
    { role: "system", content: [BASIS, profielTekst(profiel, feiten), vb].filter(Boolean).join("\n\n") },
    {
      role: "user",
      content: [
        `Woning:\n${woning.join("\n")}`,
        `Bevestigde kenmerken:\n${feiten.bevestigd.length ? feiten.bevestigd.map((b) => `- ${b.label}: ${b.waarde}`).join("\n") : "(geen)"}`,
        `Steekwoorden van de medewerker:\n${steekwoorden.length ? steekwoorden.join("\n") : "(geen)"}`,
        `Secties: ${toegestaneSecties(profiel, feiten.steekwoorden).join(", ")}`,
        opdracht,
      ].join("\n\n"),
    },
  ];
}
