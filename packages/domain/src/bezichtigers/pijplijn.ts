// Pijplijn voor bezichtigersleads (issue #54, ADR-020): de fases die een kantoor zelf bepaalt.
export const FASE_SOORTEN = ["open", "gewonnen", "verloren"] as const;
export type FaseSoort = (typeof FASE_SOORTEN)[number];

export const FASE_SOORT_LABEL: Record<FaseSoort, string> = { open: "Lopend", gewonnen: "Gewonnen", verloren: "Verloren" };

export type PijplijnFase = {
  id: string;
  naam: string;
  volgorde: number;
  /** Lopend, of een eindfase: gewonnen of verloren. Wat gewonnen inhoudt, bepaalt het kantoor zelf. */
  soort: FaseSoort;
  /** Een uitgezette fase is niet meer te kiezen, maar blijft staan bij leads die erin zitten. */
  actief: boolean;
};

export const MAX_FASENAAM = 40;

/** De startset bij de onboarding van een kantoor; het kantoor past haar daarna zelf aan. */
export const STANDAARD_FASES: readonly { naam: string; soort: FaseSoort }[] = [
  { naam: "Social media marketing", soort: "open" },
  { naam: "Telefonisch benaderd", soort: "open" },
  { naam: "Voorstel gestuurd", soort: "open" },
  { naam: "Gewonnen", soort: "gewonnen" },
  { naam: "Verloren", soort: "verloren" },
];

export type FaseFout = "naam-leeg" | "naam-te-lang" | "naam-bestaat" | "soort";

export function valideerFase(
  invoer: { naam: string; soort: string },
  bestaande: readonly Pick<PijplijnFase, "id" | "naam">[],
  eigenId?: string,
): { ok: true; waarde: { naam: string; soort: FaseSoort } } | { ok: false; fout: FaseFout } {
  const naam = invoer.naam.trim();
  if (!naam) return { ok: false, fout: "naam-leeg" };
  if (naam.length > MAX_FASENAAM) return { ok: false, fout: "naam-te-lang" };
  const soort = FASE_SOORTEN.find((s) => s === invoer.soort);
  if (!soort) return { ok: false, fout: "soort" };
  if (bestaande.some((f) => f.id !== eigenId && f.naam.toLowerCase() === naam.toLowerCase())) return { ok: false, fout: "naam-bestaat" };
  return { ok: true, waarde: { naam, soort } };
}

/** De id's van de fases in de nieuwe volgorde, nadat één fase een plek omhoog of omlaag is gezet. */
export function verplaatsFase(fases: readonly PijplijnFase[], id: string, richting: "omhoog" | "omlaag"): string[] {
  const ids = [...fases].sort((a, b) => a.volgorde - b.volgorde).map((f) => f.id);
  const van = ids.indexOf(id);
  const naar = richting === "omhoog" ? van - 1 : van + 1;
  if (van < 0 || naar < 0 || naar >= ids.length) return ids;
  [ids[van], ids[naar]] = [ids[naar]!, ids[van]!];
  return ids;
}
