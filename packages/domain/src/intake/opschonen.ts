// Bewaren en opschonen van intakedossiers (ADR-015, stap A9). Na verkoop gaan de gegevens met persoonsgegevens weg
// (bronbestanden, citaten, planning) en blijft het bevestigde woningprofiel staan; een woning die zonder verkoop van het
// bord verdwijnt, wordt na 30 dagen met het hele dossier verwijderd.
import type { WoningFase } from "../woningen/woningen";

export interface DossierVoorOpschonen {
  status: "open" | "opgeschoond";
  fase: WoningFase;
  /** 'JJJJ-MM-DD' uit het Realworks-object, of null. */
  transportdatum: string | null;
  /** Staat de woning nu op het bord? */
  zichtbaar: boolean;
  /** 'JJJJ-MM-DD' waarop de woning van het bord verdween, of null. */
  nietZichtbaarSinds: string | null;
}

export type OpschoonActie = "na-verkoop" | "verwijderen";

export const DAGEN_TOT_VERWIJDEREN = 30;

const dagenTussen = (van: string, tot: string) => Math.round((Date.parse(`${tot}T00:00:00Z`) - Date.parse(`${van}T00:00:00Z`)) / 86_400_000);

/** Wat er vandaag ('JJJJ-MM-DD', Nederlandse tijd) met een dossier moet gebeuren; null = niets. */
export function opschoonActie(d: DossierVoorOpschonen, vandaag: string): OpschoonActie | null {
  if (d.status === "opgeschoond") return null;
  const verkocht = d.fase === "verkocht" || d.fase === "verkocht_ov";
  if (d.transportdatum !== null && d.transportdatum < vandaag) return "na-verkoop";
  // Realworks archiveert een verkochte woning na de overdracht; ze verdwijnt dan van het bord, soms zonder transportdatum.
  if (!d.zichtbaar && verkocht) return "na-verkoop";
  if (!d.zichtbaar && d.nietZichtbaarSinds !== null && dagenTussen(d.nietZichtbaarSinds, vandaag) >= DAGEN_TOT_VERWIJDEREN) return "verwijderen";
  return null;
}
