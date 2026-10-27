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
     * Oppervlakte van de garage of andere inpandige ruimte in m².
     */
    garage_m2?: number;
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
      /**
       * Wat er in de tuin is.
       */
      kenmerken?: (
        | "bestrating"
        | "gras"
        | "kunstgras"
        | "borders"
        | "vijver"
        | "vlonders"
        | "schuttingen"
        | "tuinhuis"
        | "schuur"
        | "zonnescherm"
        | "overkapping"
      )[];
      /**
       * Is er een achterom?
       */
      achterom?: boolean;
    };
    /**
     * Parkeergelegenheid, bijv. eigen oprit, garage, openbaar, vergunning.
     */
    parkeren?: string;
    /**
     * Heeft de woning een kruipruimte?
     */
    kruipruimte?: boolean;
  };
  /**
   * Indeling per verdieping.
   */
  indeling?: {
    /**
     * Bijv. begane grond, eerste verdieping, zolder, kelder.
     */
    verdieping?: string;
    /**
     * Constructie van de vloer.
     */
    vloerconstructie?: "beton" | "hout";
    /**
     * Afwerking van de vloeren.
     */
    vloerafwerking?: ("hout" | "laminaat" | "tegels" | "pvc" | "vloerbedekking" | "gietvloer" | "natuursteen")[];
    vloerverwarming?: boolean;
    convectorput?: boolean;
    /**
     * Afwerking van de wanden.
     */
    wandafwerking?: ("strak gestukt" | "spachtelputz" | "structuurverf" | "granol" | "spuitwerk" | "behang")[];
    aantal_slaapkamers?: number;
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
  keuken?: {
    /**
     * Uitstraling van de keuken.
     */
    stijl?: "modern" | "neutraal" | "gedateerd";
    /**
     * Bijv. hoekkeuken, rechte opstelling, kookeiland.
     */
    opstelling?: string;
    /**
     * Merk van de keuken.
     */
    merk?: string;
    bouwjaar?: number;
    apparatuur?: {
      soort?:
        | "koelkast"
        | "vriezer"
        | "koel-vriescombinatie"
        | "vaatwasser"
        | "oven"
        | "combi-oven"
        | "stoomoven"
        | "magnetron"
        | "quooker"
        | "gaskookplaat"
        | "inductiekookplaat"
        | "keramische kookplaat"
        | "afzuigkap"
        | "overig";
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
    stijl?: "modern" | "neutraal" | "gedateerd";
    bouwjaar?: number;
    /**
     * Voorzieningen in de ruimte.
     */
    voorzieningen?: (
      | "inloopdouche"
      | "douchebak"
      | "bad"
      | "bubbelbad"
      | "toilet"
      | "zwevend toilet"
      | "badmeubel"
      | "wastafel"
      | "dubbele wastafel"
      | "centrale afzuiging"
      | "sanibroyeur"
    )[];
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
      /**
       * Is er een onderhoudscontract voor de ketel?
       */
      onderhoudscontract?: boolean;
      /**
       * Jaar van het laatste onderhoud.
       */
      laatst_onderhouden?: number;
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
      /**
       * Opbrengst in kWh per jaar.
       */
      opbrengst_kwh?: number;
    };
    zonneboiler?: boolean;
    /**
     * Bijv. natuurlijk, mechanisch, WTW.
     */
    ventilatie?: string;
    groepenkast?: {
      stijl?: "modern" | "gedateerd";
      aantal_groepen?: number;
      /**
       * Heeft de groepenkast aardlekschakelaars?
       */
      aardlek?: boolean;
    };
    isolatie?: {
      dak?: boolean;
      /**
       * Spouwmuurisolatie.
       */
      gevel?: boolean;
      vloer?: boolean;
      /**
       * Bijv. enkel, dubbel, HR++, triple, of per ruimte verschillend.
       */
      glas?: string;
    };
    energielabel?: "A++++" | "A+++" | "A++" | "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G";
  };
  /**
   * Kozijnen, zonwering en schilderwerk.
   */
  kozijnen?: {
    materiaal?: ("hout" | "kunststof" | "aluminium")[];
    rolluiken?: "geen" | "elektrisch" | "handmatig";
    screens?: "geen" | "elektrisch" | "handmatig";
    /**
     * Jaar van het laatste buitenschilderwerk.
     */
    schilderwerk_jaar?: number;
  };
  dak?: {
    /**
     * Plat dak.
     */
    platdak?: {
      bedekking?: "bitumen" | "epdm" | "overig";
      /**
       * Jaar waarin de dakbedekking is aangebracht.
       */
      jaar?: number;
    };
  };
  /**
   * Uitgevoerd onderhoud en vernieuwingen.
   */
  onderhoud?: {
    wat?: string;
    jaar?: number;
  }[];
  /**
   * Gebreken en asbest.
   */
  gebreken?: {
    /**
     * Gebreken die er zijn of zijn geweest, voor de mededelingsplicht.
     */
    bekende_gebreken?: string[];
    /**
     * Is er (mogelijk) asbest aanwezig?
     */
    asbest?: "ja" | "nee" | "onbekend";
  };
  /**
   * Alleen bij een appartement.
   */
  vve?: {
    /**
     * Servicekosten aan de VvE in euro per maand.
     */
    bijdrage_per_maand?: number;
    /**
     * Wat in de bijdrage inbegrepen is.
     */
    inbegrepen?: ("opstal" | "onderhoud" | "schoonmaak" | "glazenwassen" | "voorschot gwl")[];
    vergaderingen_per_jaar?: number;
    /**
     * Stand van het reservefonds in euro.
     */
    reservefonds?: number;
    /**
     * Welke stukken aanwezig zijn.
     */
    stukken?: ("mjop" | "financieel jaaroverzicht" | "begroting" | "notulen" | "inschrijving kvk")[];
  };
  /**
   * Voorbereiding van de Lijst van Zaken.
   */
  zaken?: {
    mee_te_nemen?: string[];
    over_te_nemen?: string[];
  };
  /**
   * Wat de verkoper zelf het mooiste aan de woning vindt, in de woorden van de verkoper.
   */
  verkoopargumenten?: string[];
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
    /**
     * Voorkeur van de verkoper voor de passeerdatum.
     */
    voorkeur_passeerdatum?: string;
  };
  /**
   * Overige opmerkingen over de woning.
   */
  opmerkingen?: string[];
}
