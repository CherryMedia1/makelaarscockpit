// Het pijplijnbord (issue #54, ADR-020): de leads van een kantoor in een kolom per fase.
import type { Lead } from "./bezichtigers";
import type { PijplijnFase } from "./pijplijn";

/** Een bezichtiger in de pijplijn: zijn fase, naam en eigenaar. */
export type BordStand = { bezichtigerId: string; faseId: string; naam: string | null; naamGezocht: boolean; eigenaar: string | null };

export type BordKaart = {
  bezichtigerId: string;
  naam: string | null;
  naamGezocht: boolean;
  eigenaar: string | null;
  aantalBezichtigingen: number;
  /** De meest recente bezichtiging, geweest of gepland; null als er geen is binnen de bewaartermijn. */
  laatsteBezichtiging: string | null;
  woning: string | null;
};

export type BordKolom = { fase: PijplijnFase; kaarten: BordKaart[] };

/**
 * Bouwt het bord: een kolom per fase in de volgorde van het kantoor. Een uitgezette fase staat er alleen op zolang er
 * leads in zitten. Binnen een kolom staat de lead met de meest recente bezichtiging bovenaan.
 */
export function bouwBord(fases: readonly PijplijnFase[], standen: readonly BordStand[], leads: readonly Lead[]): BordKolom[] {
  const leadVan = new Map(leads.map((l) => [l.bezichtigerId, l]));
  const kaart = (s: BordStand): BordKaart => {
    const nieuwste = leadVan.get(s.bezichtigerId)?.bezichtigingen[0];
    return {
      bezichtigerId: s.bezichtigerId, naam: s.naam, naamGezocht: s.naamGezocht, eigenaar: s.eigenaar,
      aantalBezichtigingen: leadVan.get(s.bezichtigerId)?.aantal ?? 0, laatsteBezichtiging: nieuwste?.tijdstip ?? null, woning: nieuwste?.woning ?? null,
    };
  };
  return [...fases]
    .sort((a, b) => a.volgorde - b.volgorde)
    .map((fase) => ({
      fase,
      kaarten: standen.filter((s) => s.faseId === fase.id).map(kaart).sort((a, b) => (b.laatsteBezichtiging ?? "").localeCompare(a.laatsteBezichtiging ?? "")),
    }))
    .filter((k) => k.fase.actief || k.kaarten.length > 0);
}
