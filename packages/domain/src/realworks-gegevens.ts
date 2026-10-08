// Gegevens die uit Realworks worden gespiegeld, in de vorm waarin wij ze bewaren (ADR-005).

export type MedewerkerGegevens = {
  realworksId: number;
  /** Relatiecode (bv. '116177'); een Wonen-object verwijst hiermee naar de gekoppelde makelaar. */
  relatiecode: string | null;
  weergavenaam: string;
  roepnaam: string | null;
  tussenvoegsel: string | null;
  achternaam: string | null;
};

export type ObjectGegevens = {
  realworksId: number;
  objectcode: string | null;
  afdelingscode: string | null;
  straat: string | null;
  huisnummer: string | null;
  huisnummertoevoeging: string | null;
  postcode: string | null;
  plaats: string | null;
  status: string | null;
  actief: boolean | null;
  vraagprijs: number | null;
  transactieprijs: number | null;
  /** 'JJJJ-MM-DD' */
  transactiedatum: string | null;
  transportdatum: string | null;
  publicatiedatum: string | null;
  gekoppeldeMakelaarCode: string | null;
  /** Tijdstip in Nederlandse tijd, 'JJJJ-MM-DD UU:MM:SS', zoals Realworks het levert. */
  realworksGewijzigdOp: string | null;
  /** Signalen voor de checklist "Woningen in verkoop" (ADR-012); optioneel, zodat oudere aanroepers blijven werken. */
  heeftFotos?: boolean;
  heeftPlattegrond?: boolean;
  energieklasse?: string | null;
  heeftTekst?: boolean;
};

/** Een agendapunt uit de Agenda-API, voor zover wij het gebruiken (waardebepalingen; later ook bezichtigingen). */
export type AgendapuntGegevens = {
  realworksId: number;
  agendatype: string | null;
  /** Definitief, Wacht op bevestiging of Geannuleerd. */
  status: string | null;
  /** 'JJJJ-MM-DD UU:MM:SS' in Nederlandse tijd. */
  begintijd: string | null;
  eindtijd: string | null;
  /** "postcode  plaats straat huisnummer", zoals Realworks het levert. */
  locatie: string | null;
  /** Objectcode van het gekoppelde Wonen-object (project.projectcode). */
  projectcode: string | null;
  /** WONEN, NIEUWBOUW, ... (project.type). */
  projecttype: string | null;
  /** Relatie "Agendapunt voor": het id van de medewerker. */
  medewerkerRealworksId: number | null;
  /** Relatie "Id van de gekoppelde relatie": de klant. */
  relatieId: number | null;
  realworksGewijzigdOp: string | null;
};
