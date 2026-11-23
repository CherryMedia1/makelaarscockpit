// Synchroniseren op verzoek vanuit het portaal (issue #51): wanneer mag een kantoor een nieuwe run aanvragen?
export type SyncStatus = "wachtrij" | "bezig" | "klaar" | "mislukt";

export type LaatsteSync = { status: SyncStatus; aangevraagdOp: Date };

/** Hooguit één run per kwartier per kantoor, zodat een knop Realworks niet kan bestoken. */
export const SYNC_WACHTTIJD_MINUTEN = 15;
/** Een run die na een half uur niet klaar is, is vastgelopen en blokkeert de knop niet langer. */
export const SYNC_VERLOPEN_MINUTEN = 30;

export type SyncAanvraag = { mag: true } | { mag: false; reden: "loopt" } | { mag: false; reden: "te_snel"; weerOm: Date };

export function syncAanvraag(laatste: LaatsteSync | null, nu: Date): SyncAanvraag {
  if (!laatste) return { mag: true };
  const minuten = (nu.getTime() - laatste.aangevraagdOp.getTime()) / 60_000;
  if (laatste.status === "wachtrij" || laatste.status === "bezig") return minuten < SYNC_VERLOPEN_MINUTEN ? { mag: false, reden: "loopt" } : { mag: true };
  if (laatste.status === "klaar" && minuten < SYNC_WACHTTIJD_MINUTEN) {
    return { mag: false, reden: "te_snel", weerOm: new Date(laatste.aangevraagdOp.getTime() + SYNC_WACHTTIJD_MINUTEN * 60_000) };
  }
  return { mag: true };
}
