// Woningen in verkoop (dashboard 3, issue #10, ADR-012): per woning de stappen uit de Excel van C&R.
// Realworks is leidend: wat Realworks kan zien (foto's, energielabel, tekst, publicatie, afspraken) wordt automatisch
// afgevinkt en is niet met de hand terug te zetten. De overige stappen zijn eigen invoer.

/** Het bord kent twee sporen: verkoopklaar maken en, na de verkoop, de koopovereenkomst. */
export type Spoor = "verkoop" | "kovk";
export type StapStatus = "open" | "gepland" | "klaar" | "nvt";
export const STAP_STATUSSEN: readonly StapStatus[] = ["open", "gepland", "klaar", "nvt"];
export const STAP_STATUS_LABEL: Record<StapStatus, string> = { open: "Open", gepland: "Gepland", klaar: "Klaar", nvt: "Niet van toepassing" };

export type StapDefinitie = { sleutel: string; label: string; kort: string; spoor: Spoor; /** Kan Realworks deze stap zien? */ realworks: boolean };

export const STAPPEN: readonly StapDefinitie[] = [
  { sleutel: "fotos", label: "Foto's, meetrapport en plattegrond", kort: "Foto's", spoor: "verkoop", realworks: true },
  { sleutel: "video", label: "Woningvideo", kort: "Video", spoor: "verkoop", realworks: true },
  { sleutel: "energielabel", label: "Energielabel", kort: "Energie", spoor: "verkoop", realworks: true },
  { sleutel: "styling", label: "Styling", kort: "Styling", spoor: "verkoop", realworks: false },
  { sleutel: "tekst", label: "Woningtekst", kort: "Tekst", spoor: "verkoop", realworks: true },
  { sleutel: "woningzoeker", label: "Woningzoeker en soon online", kort: "Zoeker", spoor: "verkoop", realworks: false },
  { sleutel: "socials", label: "Socials en website", kort: "Socials", spoor: "verkoop", realworks: false },
  { sleutel: "funda", label: "Online op Funda", kort: "Funda", spoor: "verkoop", realworks: true },
  { sleutel: "reel", label: "Reel", kort: "Reel", spoor: "verkoop", realworks: false },
  { sleutel: "bord", label: "Bord geplaatst", kort: "Bord", spoor: "verkoop", realworks: true },
  { sleutel: "verkoopgesprek", label: "Verkoopgesprek", kort: "Gesprek", spoor: "verkoop", realworks: true },
  // Excel-tabblad "Status kovks".
  { sleutel: "toegang_move", label: "Toegang tot Move", kort: "Move", spoor: "kovk", realworks: false },
  { sleutel: "bieders_afgebeld", label: "Bieders afgebeld", kort: "Bieders", spoor: "kovk", realworks: false },
  { sleutel: "kovk_opgemaakt", label: "Koopovereenkomst opgemaakt en rondgestuurd", kort: "Opgemaakt", spoor: "kovk", realworks: false },
  { sleutel: "kovk_akkoord", label: "Koopovereenkomst akkoord", kort: "Akkoord", spoor: "kovk", realworks: false },
  { sleutel: "kovk_getekend", label: "Koopovereenkomst getekend", kort: "Getekend", spoor: "kovk", realworks: true },
  { sleutel: "bedenktijd", label: "Bedenktijd verlopen", kort: "Bedenktijd", spoor: "kovk", realworks: false },
  { sleutel: "overdracht", label: "Overdracht bij de notaris", kort: "Overdracht", spoor: "kovk", realworks: true },
];

export const stappenVoorSpoor = (spoor: Spoor): StapDefinitie[] => STAPPEN.filter((s) => s.spoor === spoor);
export const spoorVanStap = (sleutel: string): Spoor | null => STAPPEN.find((s) => s.sleutel === sleutel)?.spoor ?? null;

/** Een afspraak uit de Realworks-agenda die bij de woning hoort; datum als 'JJJJ-MM-DD'. */
export type AgendaSignaal = { type: string; datum: string; status: string | null };

export type RealworksSignalen = {
  heeftFotos: boolean;
  heeftPlattegrond: boolean;
  energieklasse: string | null;
  heeftTekst: boolean;
  publicatiedatum: string | null;
  transportdatum: string | null;
  agenda: AgendaSignaal[];
};

export type HandmatigeStap = { stap: string; status: StapStatus; datum: string | null };

export type StapUitkomst = {
  sleutel: string;
  status: StapStatus;
  datum: string | null;
  /** Waar de status vandaan komt; null bij open. */
  bron: "realworks" | "handmatig" | null;
  /** Gepland met een datum in het verleden. */
  teLaat: boolean;
};

type Signaal = { status: "klaar" | "gepland"; datum: string | null } | null;

/** De laatste niet-geannuleerde afspraak van een type: geweest is klaar (als `geweestIsKlaar`), in de toekomst is gepland. */
function uitAgenda(agenda: AgendaSignaal[], type: string, vandaag: string, geweestIsKlaar: boolean): Signaal {
  const afspraken = agenda.filter((a) => a.type === type && a.status !== "Geannuleerd").sort((a, b) => (a.datum < b.datum ? -1 : 1));
  const komend = afspraken.find((a) => a.datum > vandaag);
  const geweest = afspraken.filter((a) => a.datum <= vandaag).at(-1);
  if (geweest && geweestIsKlaar) return { status: "klaar", datum: geweest.datum };
  return komend ? { status: "gepland", datum: komend.datum } : null;
}

function uitRealworks(sleutel: string, s: RealworksSignalen, vandaag: string): Signaal {
  switch (sleutel) {
    case "fotos":
      return s.heeftFotos ? { status: "klaar", datum: null } : uitAgenda(s.agenda, "Foto's/video maken", vandaag, false);
    case "video":
      return uitAgenda(s.agenda, "Video Luna", vandaag, false);
    case "energielabel":
      return s.energieklasse ? { status: "klaar", datum: null } : uitAgenda(s.agenda, "Energielabel", vandaag, false);
    case "tekst":
      return s.heeftTekst ? { status: "klaar", datum: null } : null;
    case "funda":
      if (!s.publicatiedatum) return null;
      return { status: s.publicatiedatum <= vandaag ? "klaar" : "gepland", datum: s.publicatiedatum };
    case "bord":
      return uitAgenda(s.agenda, "Bord plaatsen", vandaag, true);
    case "verkoopgesprek":
      return uitAgenda(s.agenda, "Verkoopgesprek", vandaag, true);
    case "kovk_getekend":
      // Een tekenafspraak die geweest is, zegt niet dat er getekend is; dat zet de medewerker zelf.
      return uitAgenda(s.agenda, "Tekenafspraak", vandaag, false);
    case "overdracht":
      if (s.transportdatum) return { status: s.transportdatum <= vandaag ? "klaar" : "gepland", datum: s.transportdatum };
      return uitAgenda(s.agenda, "Overdracht notaris", vandaag, false);
    default:
      return null;
  }
}

/**
 * De stand per stap. Volgorde van voorrang: klaar volgens Realworks, dan handmatige invoer, dan een planning uit de
 * agenda van Realworks, anders open. `vandaag` als 'JJJJ-MM-DD' in Nederlandse tijd.
 */
export function bepaalStappen(spoor: Spoor, signalen: RealworksSignalen, handmatig: readonly HandmatigeStap[], vandaag: string): StapUitkomst[] {
  return stappenVoorSpoor(spoor).map(({ sleutel }) => {
    const rw = uitRealworks(sleutel, signalen, vandaag);
    if (rw?.status === "klaar") return { sleutel, status: "klaar", datum: rw.datum, bron: "realworks", teLaat: false };
    const eigen = handmatig.find((h) => h.stap === sleutel && h.status !== "open");
    if (eigen) {
      // De bedenktijd loopt vanzelf af: na de ingevulde datum is de stap klaar.
      if (sleutel === "bedenktijd" && eigen.status === "gepland" && eigen.datum !== null && eigen.datum < vandaag) {
        return { sleutel, status: "klaar", datum: eigen.datum, bron: "handmatig", teLaat: false };
      }
      return { sleutel, status: eigen.status, datum: eigen.datum, bron: "handmatig", teLaat: eigen.status === "gepland" && eigen.datum !== null && eigen.datum < vandaag };
    }
    if (rw) return { sleutel, status: "gepland", datum: rw.datum, bron: "realworks", teLaat: false };
    return { sleutel, status: "open", datum: null, bron: null, teLaat: false };
  });
}

export function voortgang(stappen: readonly StapUitkomst[]): { afgerond: number; totaal: number; open: number } {
  const afgerond = stappen.filter((s) => s.status === "klaar" || s.status === "nvt").length;
  return { afgerond, totaal: stappen.length, open: stappen.length - afgerond };
}

export type WoningFase = "voorbereiding" | "in_verkoop" | "verkocht_ov" | "verkocht";
export const WONING_FASE_LABEL: Record<WoningFase, string> = { voorbereiding: "In voorbereiding", in_verkoop: "In verkoop", verkocht_ov: "Verkocht onder voorbehoud", verkocht: "Verkocht" };

export const spoorVanFase = (fase: WoningFase): Spoor => (fase === "verkocht_ov" || fase === "verkocht" ? "kovk" : "verkoop");

/** De fase van een woning die Realworks als object kent; null = niet op het bord (ingetrokken, verhuurd). */
export function faseVanObject(status: string | null): WoningFase | null {
  if (status === null || status === "BESCHIKBAAR" || status === "ONDER_BOD") return "in_verkoop";
  if (status === "VERKOCHT_ONDER_VOORBEHOUD") return "verkocht_ov";
  if (status === "VERKOCHT") return "verkocht";
  return null;
}

const START_TYPES: ReadonlySet<string> = new Set(["Verkoopgesprek", "Foto's/video maken", "Video Luna"]);

const dagenTerug = (vandaag: string, dagen: number) => new Date(Date.parse(`${vandaag}T00:00:00Z`) - dagen * 86_400_000).toISOString().slice(0, 10);

/**
 * Een woning in voorbereiding staat nog niet in de Wonen-API. Realworks kent haar wel: een verkoopgesprek of fotoafspraak
 * hangt aan een project (projectcode) dat nog geen object is. Alleen recente afspraken tellen, zodat oude, gearchiveerde
 * woningen niet terugkomen.
 */
export function woningenInVoorbereiding(
  agendapunten: readonly { projectcode: string | null; projecttype: string | null; agendatype: string | null; datum: string; status: string | null; locatie: string | null; medewerkerRealworksId: number | null }[],
  bekendeObjectcodes: ReadonlySet<string>,
  vandaag: string,
  dagen = 60,
): { projectcode: string; locatie: string | null; medewerkerRealworksId: number | null }[] {
  const vanaf = dagenTerug(vandaag, dagen);
  const perCode = new Map<string, { projectcode: string; locatie: string | null; medewerkerRealworksId: number | null }>();
  for (const a of agendapunten) {
    if (!a.projectcode || a.projecttype !== "WONEN" || !a.agendatype || !START_TYPES.has(a.agendatype)) continue;
    if (a.status === "Geannuleerd" || a.datum < vanaf || bekendeObjectcodes.has(a.projectcode)) continue;
    const bestaand = perCode.get(a.projectcode);
    if (!bestaand) perCode.set(a.projectcode, { projectcode: a.projectcode, locatie: a.locatie, medewerkerRealworksId: a.medewerkerRealworksId });
    else if (!bestaand.locatie && a.locatie) bestaand.locatie = a.locatie;
  }
  return [...perCode.values()];
}

/** Een cel uit de Excel-checklist: V of ja is klaar, X of nvt is niet van toepassing, een datum is klaar of gepland. */
export function excelCelNaarStap(waarde: string | Date | null, vandaag: string): { status: StapStatus; datum: string | null } | null {
  if (waarde === null) return null;
  if (waarde instanceof Date) {
    const datum = waarde.toISOString().slice(0, 10);
    return { status: datum <= vandaag ? "klaar" : "gepland", datum };
  }
  const t = waarde.trim().toLowerCase();
  if (t === "v" || t === "ja" || /^v\s+\d/.test(t)) return { status: "klaar", datum: null };
  if (t === "x" || t === "nvt" || t === "n.v.t.") return { status: "nvt", datum: null };
  return null;
}

const geldigeDatum = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

export function valideerStapInvoer(spoor: Spoor, r: { stap: string; status: string; datum: string }): { ok: true; waarde: HandmatigeStap } | { ok: false; fout: string } {
  if (!stappenVoorSpoor(spoor).some((s) => s.sleutel === r.stap)) return { ok: false, fout: "Deze stap bestaat niet." };
  const status = STAP_STATUSSEN.find((s) => s === r.status);
  if (!status) return { ok: false, fout: "Kies een status." };
  const datum = r.datum.trim();
  if (status === "open" || status === "nvt") return { ok: true, waarde: { stap: r.stap, status, datum: null } };
  if (datum && !geldigeDatum(datum)) return { ok: false, fout: "Vul een geldige datum in." };
  if (status === "gepland" && !datum) return { ok: false, fout: "Vul bij 'gepland' een datum in." };
  return { ok: true, waarde: { stap: r.stap, status, datum: datum || null } };
}
