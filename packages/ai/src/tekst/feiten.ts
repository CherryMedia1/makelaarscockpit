// De feiten voor een woningtekst (ADR-016, punt 3): woninggegevens uit de Realworks-kopie, de bevestigde velden van het
// woningprofiel en de steekwoorden van de medewerker. Voorstellen en conflicten gaan niet mee; e-mailadressen en
// telefoonnummers worden vóór de modelaanroep weggehaald (punt 11).
import { profielOverzicht, toonWaarde } from "../intake/profiel";
import type { Schrijfprofiel } from "./schrijfprofiel";
import type { Woningcategorie } from "./schrijfprofiel-validatie";

/** Groepen die niet in een verkooptekst horen: afspraken met de verkoper, gebreken, lijst van zaken en interne opmerkingen. */
const NIET_VOOR_TEKST = new Set(["planning", "gebreken", "zaken", "opmerkingen"]);

export interface Tekstfeiten {
  adres: string | null;
  plaats: string | null;
  energielabel: string | null;
  woningcategorie: Woningcategorie;
  bevestigd: { label: string; waarde: string }[];
  /** Per sleutel uit de vragenlijst; alleen ingevulde vragen. */
  steekwoorden: Record<string, string>;
  weggelaten: { vraag: string; soort: "e-mail" | "telefoon" }[];
}

const EMAIL = String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+`;
// Nederlandse nummers: 0, 0031 of +31 gevolgd door negen cijfers, met spaties of streepjes ertussen.
const TELEFOON = String.raw`(?<![\w+])(?:\+31|0031|0)(?:[\s-]?\d){9}(?!\d)`;
const PERSOONSGEGEVENS = new RegExp(`(${EMAIL})|(${TELEFOON})`, "g");

export function haalPersoonsgegevensWeg(tekst: string): { tekst: string; weggelaten: ("e-mail" | "telefoon")[] } {
  const weggelaten: ("e-mail" | "telefoon")[] = [];
  const schoon = tekst.replace(PERSOONSGEGEVENS, (_, email: string | undefined) => {
    weggelaten.push(email ? "e-mail" : "telefoon");
    return "[weggelaten]";
  });
  return { tekst: schoon, weggelaten };
}

function categorieVan(woningtype: unknown): Woningcategorie {
  if (woningtype === "appartement" || woningtype === "bovenwoning" || woningtype === "benedenwoning") return "appartement";
  if (woningtype === "vrijstaand") return "vrijstaand";
  return "eengezinswoning";
}

export function verzamelFeiten(invoer: {
  woning: { adres: string | null; plaats: string | null; energieklasse: string | null };
  velden: readonly { pad: string; waarde: unknown; status: "voorstel" | "bevestigd" | "conflict" | "afgewezen" }[];
  steekwoorden: Record<string, string>;
  profiel: Schrijfprofiel;
  /** Keuze van de medewerker; gaat voor het woningtype uit het profiel. */
  categorie?: Woningcategorie | null;
}): Tekstfeiten {
  const bevestigd = invoer.velden.filter((v) => v.status === "bevestigd" && !NIET_VOOR_TEKST.has(v.pad.split(/[.[]/)[0]!));
  const vragen = new Set(invoer.profiel.vragenlijst.map((v) => v.sleutel));
  const steekwoorden: Record<string, string> = {};
  const weggelaten: Tekstfeiten["weggelaten"] = [];
  for (const [vraag, ruw] of Object.entries(invoer.steekwoorden)) {
    if (!vragen.has(vraag) || ruw.trim() === "") continue;
    const schoon = haalPersoonsgegevensWeg(ruw.trim());
    steekwoorden[vraag] = schoon.tekst;
    for (const soort of schoon.weggelaten) weggelaten.push({ vraag, soort });
  }
  return {
    adres: invoer.woning.adres,
    plaats: invoer.woning.plaats,
    energielabel: invoer.woning.energieklasse,
    woningcategorie: invoer.categorie ?? categorieVan(bevestigd.find((v) => v.pad === "object.woningtype")?.waarde),
    bevestigd: profielOverzicht(bevestigd).groepen.flatMap((g) => g.velden.map((v) => ({ label: v.label, waarde: toonWaarde(v.rijen[0]!.waarde) }))),
    steekwoorden,
    weggelaten,
  };
}

/** Secties die in de tekst mogen: die met ingevulde steekwoorden, plus de secties zonder invoer (zoals de afsluiting). */
export function toegestaneSecties(profiel: Schrijfprofiel, steekwoorden: Record<string, string>): string[] {
  return profiel.structuur.secties.filter((s) => s.invoer.length === 0 || s.invoer.some((i) => (steekwoorden[i] ?? "").trim() !== "")).map((s) => s.sleutel);
}
