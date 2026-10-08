// Vertaalt een verkocht Wonen-object uit Realworks naar een verkoopregel (ADR-010).
// Realworks levert verkoopprijs, verkoopdatum (transactiedatum), passeerdatum (transportdatum) en de gekoppelde makelaar;
// courtage, opstartnota en verdeling worden daarna in het portaal ingevuld (ADR-007).
import type { ObjectGegevens } from "../realworks-gegevens";
import type { VerkoopRegel } from "./excel-import";

export const VERKOCHTE_STATUSSEN: ReadonlySet<string> = new Set(["VERKOCHT", "VERKOCHT_ONDER_VOORBEHOUD"]);

export type KoppelingInstellingen = {
  /** Verkopen met een transactiedatum vanaf deze dag ('JJJJ-MM-DD') komen uit Realworks; eerdere staan in de Excel-historie. */
  verkopenVanaf: string;
};

export type VerkoopUitRealworks = VerkoopRegel & {
  realworksId: number;
  /** Relatiecode van de gekoppelde makelaar in Realworks; null als het object geen makelaar heeft. */
  makelaarCode: string | null;
  onderVoorbehoud: boolean;
};

export function isVerkochtStatus(status: string | null): boolean {
  return status !== null && VERKOCHTE_STATUSSEN.has(status);
}

function adresVan(o: ObjectGegevens): string | null {
  const nummer = [o.huisnummer, o.huisnummertoevoeging].filter(Boolean).join(" ");
  const straat = [o.straat, nummer].filter(Boolean).join(" ");
  const adres = [straat, o.plaats].filter(Boolean).join(", ");
  return adres || null;
}

/**
 * Geeft null voor objecten die niet verkocht zijn, geen transactiedatum hebben of vóór de startdatum van de koppeling
 * zijn verkocht. `makelaars` koppelt de relatiecode van een medewerker aan de weergavenaam.
 */
export function objectNaarVerkoop(o: ObjectGegevens, makelaars: ReadonlyMap<string, string>, instellingen: KoppelingInstellingen): VerkoopUitRealworks | null {
  if (!isVerkochtStatus(o.status) || o.transactiedatum === null) return null;
  if (o.transactiedatum < instellingen.verkopenVanaf) return null;
  const makelaarCode = o.gekoppeldeMakelaarCode;
  return {
    realworksId: o.realworksId,
    soort: "koop",
    adres: adresVan(o),
    makelaar: (makelaarCode && makelaars.get(makelaarCode)) || "Onbekend",
    makelaarCode,
    aandeel: 1,
    verkoopdatum: o.transactiedatum,
    omzetMaand: o.transportdatum ? `${o.transportdatum.slice(0, 7)}-01` : null,
    passeerdatum: o.transportdatum,
    verkoopprijs: o.transactieprijs,
    courtage: null,
    opstartnota: 0,
    notaVerstuurd: false,
    onderVoorbehoud: o.status === "VERKOCHT_ONDER_VOORBEHOUD",
  };
}
