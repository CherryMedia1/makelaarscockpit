// Gegenereerd uit woningprofiel.schema.json met `npm run genereer -w @makelaarscockpit/ai`. Niet met de hand wijzigen.

/**
 * Gestructureerd profiel van een woning in verkoop, opgebouwd uit intakegesprek, checklist en verrijking (ADR-013). Alle velden zijn optioneel: een profiel groeit per bron.
 */
export interface Woningprofiel {
  /**
   * Kerngegevens van de woning.
   */
  object?: {
    /**
     * Straat, huisnummer en plaats zoals genoemd.
     */
    adres?: string;
    /**
     * Bouwjaar van de woning.
     */
    bouwjaar?: number;
    /**
     * Soort woning.
     */
    woningtype?:
      | "tussenwoning"
      | "hoekwoning"
      | "twee-onder-een-kap"
      | "vrijstaand"
      | "geschakeld"
      | "appartement"
      | "bovenwoning"
      | "benedenwoning"
      | "overig";
    /**
     * Gebruiksoppervlakte wonen in m².
     */
    woonoppervlakte_m2?: number;
    /**
     * Bruto inhoud in m³.
     */
    inhoud_m3?: number;
    /**
     * Perceeloppervlakte in m².
     */
    perceel_m2?: number;
    /**
     * Totaal aantal kamers, inclusief woonkamer.
     */
    aantal_kamers?: number;
    /**
     * Aantal slaapkamers.
     */
    aantal_slaapkamers?: number;
    /**
     * Ligging van de woning, bijv. aan rustige straat, aan park, nabij centrum.
     */
    ligging?: string;
    /**
     * Tuin of buitenruimte.
     */
    tuin?: {
      /**
       * Oppervlakte van de tuin in m².
       */
      oppervlak_m2?: number;
      /**
       * Ligging van de (achter)tuin op de zon.
       */
      orientatie?: "noord" | "noordoost" | "oost" | "zuidoost" | "zuid" | "zuidwest" | "west" | "noordwest";
    };
    /**
     * Parkeergelegenheid, bijv. eigen oprit, garage, openbaar, vergunning.
     */
    parkeren?: string;
  };
  /**
   * Indeling per verdieping.
   */
  indeling?: {
    /**
     * Bijv. begane grond, eerste verdieping, zolder, kelder.
     */
    verdieping?: string;
    ruimtes?: {
      /**
       * Bijv. woonkamer, keuken, slaapkamer 1.
       */
      naam?: string;
      /**
       * Korte omschrijving van de ruimte.
       */
      omschrijving?: string;
    }[];
  }[];
  /**
   * Technische installaties en energie.
   */
  installaties?: {
    /**
     * Cv-ketel.
     */
    cv?: {
      merk?: string;
      type?: string;
      bouwjaar?: number;
      /**
       * Is de ketel van de verkoper, gehuurd of geleaset?
       */
      eigendom?: "eigendom" | "huur" | "lease";
    };
    warmtepomp?: {
      aanwezig?: boolean;
      /**
       * Bijv. hybride, lucht-water, bodem.
       */
      type?: string;
      bouwjaar?: number;
    };
    zonnepanelen?: {
      aantal?: number;
      bouwjaar?: number;
    };
    /**
     * Bijv. natuurlijk, mechanisch, WTW.
     */
    ventilatie?: string;
    isolatie?: {
      dak?: boolean;
      gevel?: boolean;
      vloer?: boolean;
      /**
       * Bijv. enkel, dubbel, HR++, triple, of per ruimte verschillend.
       */
      glas?: string;
    };
    energielabel?: "A++++" | "A+++" | "A++" | "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G";
  };
  keuken?: {
    /**
     * Bijv. hoekkeuken, rechte opstelling, kookeiland.
     */
    opstelling?: string;
    bouwjaar?: number;
    apparatuur?: {
      /**
       * Bijv. inductiekookplaat, vaatwasser, combi-oven.
       */
      soort?: string;
      merk?: string;
      /**
       * Bijv. nieuw, goed, gedateerd.
       */
      staat?: string;
    }[];
  };
  /**
   * Badkamers en toiletten.
   */
  sanitair?: {
    /**
     * Bijv. badkamer eerste verdieping, toilet begane grond.
     */
    ruimte?: string;
    bouwjaar?: number;
    /**
     * Bijv. inloopdouche, ligbad, wastafelmeubel, zwevend toilet.
     */
    voorzieningen?: string[];
  }[];
  /**
   * Uitgevoerd onderhoud en vernieuwingen.
   */
  onderhoud?: {
    wat?: string;
    jaar?: number;
  }[];
  /**
   * Wat de verkoper zelf het mooiste aan de woning vindt, in de woorden van de verkoper.
   */
  verkoopargumenten?: string[];
  /**
   * Voorbereiding van de Lijst van Zaken.
   */
  zaken?: {
    mee_te_nemen?: string[];
    over_te_nemen?: string[];
  };
  /**
   * Afspraken voor de verkoopvoorbereiding. Wordt na verkoop verwijderd (ADR-015).
   */
  planning?: {
    beschikbaarheid_verkoper?: string;
    sleutelregeling?: string;
    huisdieren?: string;
    wensen_foto?: string;
    wensen_styling?: string;
    keuring_gewenst?: boolean;
    meetrapport_aanwezig?: boolean;
  };
}
