// Een bezichtiger als pijplijn-item (issue #54, ADR-020): fase, eigenaar en notitie. De lead hangt aan de persoon.
import type { PijplijnFase } from "./pijplijn";

export const MAX_LEAD_NOTITIE = 2000;

export type LeadInvoer = { faseId: string; eigenaarId: string | null; notitie: string | null };
export type LeadFout = "fase" | "eigenaar" | "notitie";

/**
 * Controleert de invoer van de lead-kaart. De fase moet van het kantoor zijn en aan staan; een uitgezette fase mag
 * alleen blijven staan bij een lead die er al in zit (`huidigeFaseId`). De eigenaar is een medewerker van het kantoor.
 */
export function valideerLeadInvoer(
  invoer: { faseId: string; eigenaarId: string; notitie: string },
  fases: readonly Pick<PijplijnFase, "id" | "actief">[],
  medewerkerIds: readonly string[],
  huidigeFaseId: string | null,
): { ok: true; waarde: LeadInvoer } | { ok: false; fout: LeadFout } {
  const fase = fases.find((f) => f.id === invoer.faseId);
  if (!fase || (!fase.actief && fase.id !== huidigeFaseId)) return { ok: false, fout: "fase" };
  if (invoer.eigenaarId && !medewerkerIds.includes(invoer.eigenaarId)) return { ok: false, fout: "eigenaar" };
  const notitie = invoer.notitie.trim();
  if (notitie.length > MAX_LEAD_NOTITIE) return { ok: false, fout: "notitie" };
  return { ok: true, waarde: { faseId: fase.id, eigenaarId: invoer.eigenaarId || null, notitie: notitie || null } };
}
