// Deterministische controles op een gegenereerde woningtekst (ADR-016, punt 7). Ze blokkeren niet, maar staan naast de
// tekst zodat de medewerker ze ziet voordat die goedkeurt. De bronnencontrole met het model komt hier bovenop.

export interface ProfielSectie {
  sleutel: string;
  invoer: string[];
  standaardkop: string;
  varianten: string[];
  vrijeKop: boolean;
}

export interface TekstInhoud {
  inleiding: string;
  secties: { sectie: string; kop: string; tekst: string }[];
}

export interface TekstVoorControle {
  secties: ProfielSectie[];
  /** Sleutels uit de vragenlijst waarvoor de medewerker steekwoorden heeft ingevuld. */
  ingevuld: string[];
  adres: string | null;
  plaats: string | null;
  lengte: { min: number; max: number };
  inhoud: TekstInhoud;
}

export type Tekstcontrole = {
  soort: "kop" | "sectie-zonder-invoer" | "onbekende-sectie" | "inleiding-adres" | "inleiding-uitnodiging" | "afsluiting-uitnodiging" | "lengte" | "plaats";
  sectie?: string;
  melding: string;
};

export const telWoorden = (tekst: string) => tekst.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const gelijk = (a: string, b: string) => a.trim().toLocaleLowerCase("nl") === b.trim().toLocaleLowerCase("nl");
const bevat = (tekst: string, deel: string) => tekst.toLocaleLowerCase("nl").includes(deel.trim().toLocaleLowerCase("nl"));
const UITNODIGING = /bezichtig/i;

export function controleerTekst(t: TekstVoorControle): Tekstcontrole[] {
  const uit: Tekstcontrole[] = [];
  const vul = (kop: string) => kop.replaceAll("{plaats}", t.plaats ?? "");

  for (const s of t.inhoud.secties) {
    const profiel = t.secties.find((p) => p.sleutel === s.sectie);
    if (!profiel) {
      uit.push({ soort: "onbekende-sectie", sectie: s.sectie, melding: `De sectie '${s.sectie}' staat niet in het profiel.` });
      continue;
    }
    const toegestaan = [profiel.standaardkop, ...profiel.varianten].filter(Boolean).map(vul);
    if (!profiel.vrijeKop && !toegestaan.some((k) => gelijk(k, s.kop))) {
      uit.push({ soort: "kop", sectie: s.sectie, melding: `De kop '${s.kop}' staat niet in het profiel; toegestaan: ${toegestaan.join(", ")}.` });
    }
    if (profiel.invoer.length > 0 && !profiel.invoer.some((i) => t.ingevuld.includes(i))) {
      uit.push({ soort: "sectie-zonder-invoer", sectie: s.sectie, melding: "Voor deze sectie zijn geen steekwoorden ingevuld; controleer extra goed of alles klopt." });
    }
  }
  // Volgorde van de meldingen: eerst per sectie in de volgorde van de tekst, onbekende secties achteraan.
  uit.sort((a, b) => Number(a.soort === "onbekende-sectie") - Number(b.soort === "onbekende-sectie"));

  if (t.adres && !bevat(t.inhoud.inleiding, t.adres)) uit.push({ soort: "inleiding-adres", melding: `De inleiding noemt het adres '${t.adres}' niet.` });
  if (!UITNODIGING.test(t.inhoud.inleiding)) uit.push({ soort: "inleiding-uitnodiging", melding: "De inleiding eindigt niet met een uitnodiging tot bezichtiging." });
  const laatste = t.inhoud.secties.at(-1)?.tekst ?? "";
  if (!UITNODIGING.test(laatste)) uit.push({ soort: "afsluiting-uitnodiging", melding: "De tekst sluit niet af met een uitnodiging tot bezichtiging." });

  const geheel = [t.inhoud.inleiding, ...t.inhoud.secties.flatMap((s) => [s.kop, s.tekst])].join("\n");
  const aantal = telWoorden(geheel);
  if (aantal < t.lengte.min || aantal > t.lengte.max) uit.push({ soort: "lengte", melding: `De tekst telt ${aantal} woorden; het profiel vraagt ${t.lengte.min} tot ${t.lengte.max}.` });
  if (t.plaats && !bevat(geheel, t.plaats)) uit.push({ soort: "plaats", melding: `De plaats '${t.plaats}' komt niet in de tekst voor.` });
  return uit;
}
