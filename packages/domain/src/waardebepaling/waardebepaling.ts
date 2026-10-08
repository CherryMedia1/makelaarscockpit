// Waardebepalingen (dashboard 2, issue #9): van agendapunt in Realworks naar waardebepaling, de uitkomst (gewonnen of
// verloren) als eigen invoer, automatisch "gewonnen" zodra de woning bij het kantoor in de verkoop komt, en de cijfers
// uit het Excel-tabblad "Score per makelaar": score = gewonnen / (gewonnen + verloren).
import type { AgendapuntGegevens, ObjectGegevens } from "../realworks-gegevens";

export const WAARDEBEPALING_STATUSSEN = ["in_afwachting", "orienterend", "gewonnen", "verloren", "blijft_wonen", "uit_verkoop", "zelf_verkocht", "andere_makelaar"] as const;
export type WaardebepalingStatus = (typeof WAARDEBEPALING_STATUSSEN)[number];

export const WAARDEBEPALING_STATUS_LABEL: Record<WaardebepalingStatus, string> = {
  in_afwachting: "In afwachting",
  orienterend: "Oriënterend",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
  blijft_wonen: "Blijven er wonen",
  uit_verkoop: "Uit de verkoop gehaald",
  zelf_verkocht: "Zelf verkocht",
  andere_makelaar: "Staat bij andere makelaar",
};

/** Statussen waarbij de uitkomst nog open is. */
export const OPEN_STATUSSEN: ReadonlySet<WaardebepalingStatus> = new Set(["in_afwachting", "orienterend"]);

/** Een waardebepaling zoals die uit Realworks komt (nog zonder uitkomst). */
export type WaardebepalingUitRealworks = {
  realworksAgendaId: number;
  /** 'JJJJ-MM-DD' */
  datum: string;
  locatie: string | null;
  projectcode: string | null;
  medewerkerRealworksId: number | null;
  relatieId: number | null;
  agendaStatus: string | null;
  realworksGewijzigdOp: string | null;
};

export function naarWaardebepaling(a: AgendapuntGegevens): WaardebepalingUitRealworks | null {
  if (a.agendatype !== "Waardebepaling" || !a.begintijd) return null;
  return {
    realworksAgendaId: a.realworksId,
    datum: a.begintijd.slice(0, 10),
    locatie: a.locatie,
    projectcode: a.projectcode,
    medewerkerRealworksId: a.medewerkerRealworksId,
    relatieId: a.relatieId,
    agendaStatus: a.status,
    realworksGewijzigdOp: a.realworksGewijzigdOp,
  };
}

const POSTCODE = /^(\d{4})\s?([A-Z]{2})\b\s*/i;

/**
 * De locatie van een agendapunt is "postcode  plaats straat huisnummer". De plaats kan uit meer woorden bestaan
 * (Bergen op Zoom), daarom helpt een lijst met bekende plaatsen; anders telt het eerste woord als plaats.
 */
export function leesLocatie(locatie: string | null, bekendePlaatsen: readonly string[]): { postcode: string | null; plaats: string | null; adres: string | null } {
  const tekst = (locatie ?? "").replace(/\s+/g, " ").trim();
  if (!tekst) return { postcode: null, plaats: null, adres: null };
  const m = POSTCODE.exec(tekst);
  if (!m) return { postcode: null, plaats: null, adres: tekst };
  const rest = tekst.slice(m[0].length).trim();
  const postcode = `${m[1]} ${m[2]!.toUpperCase()}`;
  const plaats = [...bekendePlaatsen].sort((a, b) => b.length - a.length).find((p) => rest.toLowerCase().startsWith(`${p.toLowerCase()} `)) ?? rest.split(" ")[0] ?? null;
  const adres = plaats ? rest.slice(plaats.length).trim() : rest;
  return { postcode, plaats: plaats || null, adres: adres || null };
}

const normaliseer = (t: string | null | undefined) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Staat dit adres (en, als opgegeven, deze plaats) in de locatie van Realworks? Ongevoelig voor hoofdletters en leestekens. */
export function locatieBevatAdres(locatie: string | null, adres: string, plaats: string | null = null): boolean {
  const l = ` ${normaliseer(locatie)} `;
  const a = normaliseer(adres);
  if (!a || !l.includes(` ${a} `)) return false;
  return plaats === null || l.includes(` ${normaliseer(plaats)} `);
}

/**
 * Hoort een Wonen-object bij deze waardebepaling? Eerst op projectcode (Realworks koppelt het agendapunt aan het object),
 * anders op adres en plaats, mits de woning niet vóór de waardebepaling is gepubliceerd.
 */
export type ObjectVoorKoppeling = Pick<ObjectGegevens, "objectcode" | "straat" | "huisnummer" | "huisnummertoevoeging" | "plaats" | "publicatiedatum">;

export function pastBijObject(w: { datum: string; locatie: string | null; projectcode: string | null }, o: ObjectVoorKoppeling): boolean {
  if (w.projectcode && o.objectcode && w.projectcode === o.objectcode) return true;
  const locatie = ` ${normaliseer(w.locatie)} `;
  if (!locatie.trim() || !o.straat || !o.huisnummer || !o.plaats) return false;
  const adres = normaliseer(`${o.straat} ${o.huisnummer} ${o.huisnummertoevoeging ?? ""}`);
  if (!locatie.includes(` ${adres} `) || !locatie.includes(` ${normaliseer(o.plaats)} `)) return false;
  return o.publicatiedatum === null || o.publicatiedatum >= w.datum;
}

/** Eén rij uit het Excel-tabblad "Waardebepaallijst"; datum als Date op middernacht UTC. */
export type ExcelWaardebepalingRij = {
  rij: number;
  datum: Date | null;
  makelaar: string | null;
  adres: string | null;
  plaats: string | null;
  status: string | null;
  verlorenAan: string | null;
  via: string | null;
};

export type WaardebepalingImport = {
  importRij: number;
  datum: string;
  makelaar: string;
  adres: string;
  plaats: string | null;
  status: WaardebepalingStatus;
  verlorenAan: string | null;
  binnengehaaldVia: string | null;
};

const EXCEL_STATUS: Record<string, WaardebepalingStatus> = {
  gewonnen: "gewonnen",
  "in afwachting": "in_afwachting",
  orienterend: "orienterend",
  "oriënterend": "orienterend",
  verloren: "verloren",
  "blijven er wonen": "blijft_wonen",
  "uit de verkoop gehaald": "uit_verkoop",
  "zelf verkocht": "zelf_verkocht",
  "staat bij andere makelaar": "andere_makelaar",
};

export function excelRijNaarWaardebepaling(rij: ExcelWaardebepalingRij): WaardebepalingImport | null {
  const adres = rij.adres?.trim();
  if (!rij.datum || !adres) return null;
  const statusTekst = (rij.status ?? "").trim().toLowerCase();
  const status = statusTekst ? EXCEL_STATUS[statusTekst] : "in_afwachting";
  if (!status) throw new RangeError(`rij ${rij.rij}: onbekende status '${rij.status}'`);
  return {
    importRij: rij.rij,
    datum: rij.datum.toISOString().slice(0, 10),
    makelaar: rij.makelaar?.trim() || "Onbekend",
    adres,
    plaats: rij.plaats?.trim() || null,
    status,
    verlorenAan: status === "verloren" ? rij.verlorenAan?.trim() || null : null,
    binnengehaaldVia: rij.via?.trim() || null,
  };
}

export type WaardebepalingInvoer = { status: WaardebepalingStatus; verlorenAan: string | null; binnengehaaldVia: string | null };

export function valideerWaardebepalingInvoer(r: { status: string; verlorenAan: string; binnengehaaldVia: string }): { ok: true; waarde: WaardebepalingInvoer } | { ok: false; fouten: { status?: string } } {
  const status = WAARDEBEPALING_STATUSSEN.find((s) => s === r.status.trim());
  if (!status) return { ok: false, fouten: { status: "Kies een status." } };
  return {
    ok: true,
    waarde: { status, verlorenAan: status === "verloren" ? r.verlorenAan.trim() || null : null, binnengehaaldVia: r.binnengehaaldVia.trim() || null },
  };
}

/** Een waardebepaling zoals het dashboard die ziet. */
export type Waardebepaling = {
  id: string;
  datum: string;
  adres: string | null;
  plaats: string | null;
  makelaar: string;
  status: WaardebepalingStatus;
  verlorenAan: string | null;
  binnengehaaldVia: string | null;
  objectId: string | null;
};

export type WaardebepalingDashboardCijfers = {
  jaar: number;
  totEnMetMaand: number;
  perMaand: { ditJaar: (number | null)[]; gewonnenDitJaar: (number | null)[]; vorigJaar: number[] };
  perMakelaar: { naam: string; aantal: number; gewonnen: number; verloren: number; open: number; score: number | null }[];
  via: { naam: string; aantal: number }[];
  kern: { aantal: number; aantalVorigJaar: number; gewonnen: number; verloren: number; score: number | null; scoreVorigJaar: number | null; open: number };
};

const score = (gewonnen: number, verloren: number) => (gewonnen + verloren > 0 ? gewonnen / (gewonnen + verloren) : null);

export function waardebepalingDashboard({ regels, jaar, totEnMetMaand }: { regels: Waardebepaling[]; jaar: number; totEnMetMaand: number }): WaardebepalingDashboardCijfers {
  const twaalf = () => Array.from({ length: 12 }, () => 0);
  const dit = twaalf();
  const gewonnenDit = twaalf();
  const vorig = twaalf();
  const makelaars = new Map<string, { aantal: number; gewonnen: number; verloren: number; open: number }>();
  const via = new Map<string, number>();
  const kern = { aantal: 0, aantalVorigJaar: 0, gewonnen: 0, verloren: 0, open: 0, gewonnenVorig: 0, verlorenVorig: 0 };

  for (const w of regels) {
    const j = Number(w.datum.slice(0, 4));
    const maand = Number(w.datum.slice(5, 7));
    if (j === jaar) {
      dit[maand - 1]! += 1;
      if (w.status === "gewonnen") gewonnenDit[maand - 1]! += 1;
    } else if (j === jaar - 1) {
      vorig[maand - 1]! += 1;
    }
    if (maand > totEnMetMaand || (j !== jaar && j !== jaar - 1)) continue;
    if (j === jaar - 1) {
      kern.aantalVorigJaar += 1;
      if (w.status === "gewonnen") kern.gewonnenVorig += 1;
      if (w.status === "verloren") kern.verlorenVorig += 1;
      continue;
    }
    kern.aantal += 1;
    const m = makelaars.get(w.makelaar) ?? makelaars.set(w.makelaar, { aantal: 0, gewonnen: 0, verloren: 0, open: 0 }).get(w.makelaar)!;
    m.aantal += 1;
    if (w.status === "gewonnen") {
      m.gewonnen += 1;
      kern.gewonnen += 1;
    } else if (w.status === "verloren") {
      m.verloren += 1;
      kern.verloren += 1;
    } else if (OPEN_STATUSSEN.has(w.status)) {
      m.open += 1;
      kern.open += 1;
    }
    const bron = w.binnengehaaldVia ?? "Onbekend";
    via.set(bron, (via.get(bron) ?? 0) + 1);
  }

  const totNu = (rij: number[]) => rij.map((w, i) => (i < totEnMetMaand ? w : null));
  return {
    jaar,
    totEnMetMaand,
    perMaand: { ditJaar: totNu(dit), gewonnenDitJaar: totNu(gewonnenDit), vorigJaar: vorig },
    perMakelaar: [...makelaars.entries()]
      .map(([naam, m]) => ({ naam, ...m, score: score(m.gewonnen, m.verloren) }))
      .sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam)),
    via: [...via.entries()]
      .map(([naam, aantal]) => ({ naam, aantal }))
      .sort((a, b) => (a.naam === "Onbekend" ? 1 : b.naam === "Onbekend" ? -1 : b.aantal - a.aantal || a.naam.localeCompare(b.naam))),
    kern: {
      aantal: kern.aantal,
      aantalVorigJaar: kern.aantalVorigJaar,
      gewonnen: kern.gewonnen,
      verloren: kern.verloren,
      score: score(kern.gewonnen, kern.verloren),
      scoreVorigJaar: score(kern.gewonnenVorig, kern.verlorenVorig),
      open: kern.open,
    },
  };
}
