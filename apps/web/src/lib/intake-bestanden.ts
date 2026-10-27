// Welke bestanden een medewerker bij een intakedossier kan uploaden, en de controle daarop (ADR-013).
// Gedeeld door de pagina en de server actions; zonder server-only, want er staat niets geheims in.
import type { BronType } from "@makelaarscockpit/domain";

export const MAX_BESTAND_MB = 9;

export const UPLOAD_SOORTEN = {
  gespreksverslag_pdf: { label: "Gespreksverslag (PDF)", extensie: "pdf", inhoudstype: "application/pdf" },
  plaud_transcript: { label: "Transcript uit Plaud (.txt)", extensie: "txt", inhoudstype: "text/plain; charset=utf-8" },
  checklist_pdf: { label: "Ingevulde checklist (PDF)", extensie: "pdf", inhoudstype: "application/pdf" },
  meetrapport: { label: "Meetrapport NEN 2580 (PDF)", extensie: "pdf", inhoudstype: "application/pdf" },
} as const satisfies Partial<Record<BronType, { label: string; extensie: "pdf" | "txt"; inhoudstype: string }>>;

export type UploadSoort = keyof typeof UPLOAD_SOORTEN;

export const BRON_LABEL: Record<BronType, string> = {
  ...Object.fromEntries(Object.entries(UPLOAD_SOORTEN).map(([k, v]) => [k, v.label])),
  plaud_note: "Notitie uit Plaud",
  checklist_form: "Checklist (formulier)",
  bag: "BAG",
  ep_online: "EP-Online",
} as Record<BronType, string>;

export const isUploadSoort = (s: string): s is UploadSoort => Object.hasOwn(UPLOAD_SOORTEN, s);

/** Controleert een upload op soort, extensie, grootte en inhoud. Geeft een foutmelding voor de medewerker, of null. */
export function controleerUpload(soort: UploadSoort, bestandsnaam: string, inhoud: Uint8Array): string | null {
  const { extensie } = UPLOAD_SOORTEN[soort];
  if (inhoud.byteLength === 0) return "Het bestand is leeg.";
  if (inhoud.byteLength > MAX_BESTAND_MB * 1024 * 1024) return `Het bestand is groter dan ${MAX_BESTAND_MB} MB.`;
  if (!bestandsnaam.toLowerCase().endsWith(`.${extensie}`)) return `Kies een .${extensie}-bestand voor deze soort.`;
  if (extensie === "pdf" && new TextDecoder().decode(inhoud.subarray(0, 5)) !== "%PDF-") return "Dit bestand is geen geldige PDF.";
  if (extensie === "txt") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(inhoud);
    } catch {
      return "Dit tekstbestand is niet in UTF-8 opgeslagen.";
    }
  }
  return null;
}
