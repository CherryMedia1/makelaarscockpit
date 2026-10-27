// Gegenereerd uit schrijfprofiel.schema.json met `npm run genereer -w @makelaarscockpit/ai`. Niet met de hand wijzigen.

/**
 * Huisstijl en werkwijze van één kantoor voor woningteksten (ADR-016). Niets kantoorspecifieks in de code; alles hier.
 */
export interface Schrijfprofiel {
  /**
   * Naam van het profiel, bijv. de naam van het kantoor.
   */
  naam: string;
  /**
   * Vragen waarop de medewerker per onderdeel steekwoorden invult.
   *
   * @minItems 1
   */
  vragenlijst: {
    /**
     * Vaste sleutel, bijv. woonkamer.
     */
    sleutel: string;
    /**
     * Label boven het invulveld.
     */
    label: string;
    /**
     * Hulptekst in het invulveld, bijv. 'steekwoorden zijn prima'.
     */
    hint: string;
    volgorde: number;
    verplicht: boolean;
  }[];
  structuur: {
    /**
     * Regels voor de inleiding (zonder kop), bijv. opent met een vraag of welkom, noemt het adres, eindigt met een uitnodiging tot bezichtiging.
     */
    inleidingRegels: string[];
    /**
     * Secties in volgorde van de tekst.
     *
     * @minItems 1
     */
    secties: {
      sleutel: string;
      rol: "ruimte" | "extra" | "omgeving" | "afsluiting";
      /**
       * Sleutels uit de vragenlijst waarop deze sectie steunt. Leeg = de sectie staat er altijd (bijv. de afsluiting).
       */
      invoer: string[];
      /**
       * Kop die het model bij voorkeur gebruikt; leeg als de kop vrij is.
       */
      standaardkop: string;
      /**
       * Andere toegestane koppen.
       */
      varianten: string[];
      /**
       * Mag het model een eigen kop kiezen in dezelfde stijl?
       */
      vrijeKop: boolean;
      /**
       * Mag het model de sectie weglaten als ze niets toevoegt (bijv. een extra sectie)?
       */
      optioneel: boolean;
    }[];
    /**
     * Regels voor de afsluiting, bijv. een samenvatting van de sterkste punten en een uitnodiging tot bezichtiging.
     */
    afsluitingRegels: string[];
  };
  toon: {
    aanspreekvorm: "je" | "u";
    /**
     * Stijlregels, bijv. 'elk kenmerk krijgt een concreet voordeel'.
     */
    regels: string[];
    /**
     * Kenmerkende zinsconstructies, bijv. 'Stel je eens voor: ...'.
     */
    signatuur: string[];
    /**
     * Wat niet mag, bijv. opsommingstekens.
     */
    vermijden: string[];
  };
  /**
   * Aantal woorden per woningcategorie, zonder vaste blokken.
   */
  lengte: {
    appartement: {
      min: number;
      max: number;
    };
    eengezinswoning: {
      min: number;
      max: number;
    };
    vrijstaand: {
      min: number;
      max: number;
    };
  };
  kopstijl: "titel" | "hoofdletters";
  /**
   * Label boven de inleiding, bijv. 'Omschrijving'; leeg = geen label.
   */
  inleidingLabel: string;
  /**
   * Blokken die de code letterlijk toevoegt, zoals een meetclausule.
   */
  vasteBlokken: {
    sleutel: string;
    positie: "einde";
    /**
     * Letterlijke tekst; het model schrijft deze nooit zelf.
     */
    tekst: string;
  }[];
  model: {
    /**
     * Logische deployment (ADR-014, ADR-016).
     */
    deployment: "tekst";
    /**
     * Aantal voorbeeldteksten per generatie.
     */
    voorbeelden: number;
  };
}
