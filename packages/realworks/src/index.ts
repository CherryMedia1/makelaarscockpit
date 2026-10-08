// Realworks API-client: alle Realworks-calls lopen via dit package (harde regel in CLAUDE.md).
// Paden en gedrag volgens ADR-005. Foutmeldingen bevatten nooit de inhoud van een antwoord of een token.
import type { AgendapuntGegevens, MedewerkerGegevens, ObjectGegevens } from "@makelaarscockpit/domain";

export type RealworksApi = "wonen" | "relaties" | "taken" | "agenda" | "makelaars";

export type RealworksOpties = {
  /** Levert het token voor een API; komt uit Key Vault, per tenant. */
  token: (api: RealworksApi) => Promise<string>;
  basisUrl?: string;
  fetch?: typeof fetch;
};

export class RealworksFout extends Error {
  constructor(
    readonly status: number,
    readonly pad: string,
  ) {
    super(`Realworks gaf status ${status} op ${pad}`);
    this.name = "RealworksFout";
  }
}

type Pagina = { resultaten: unknown[]; paginering?: { volgende?: string; totaalAantal?: number } };

const BASIS = "https://api.realworks.nl";

async function haalPagina(opties: RealworksOpties, api: RealworksApi, url: string): Promise<Pagina> {
  const basis = new URL(opties.basisUrl ?? BASIS);
  const doel = new URL(url);
  if (doel.host !== basis.host) throw new Error(`paginering verwijst naar een andere host dan ${basis.host}`);
  const antwoord = await (opties.fetch ?? fetch)(url, {
    headers: { Authorization: `rwauth ${await opties.token(api)}`, Accept: "application/json" },
  });
  if (!antwoord.ok) throw new RealworksFout(antwoord.status, doel.pathname);
  const body = (await antwoord.json()) as Partial<Pagina>;
  if (!Array.isArray(body.resultaten)) throw new RealworksFout(antwoord.status, doel.pathname);
  return body as Pagina;
}

async function* haalAllePaginas(opties: RealworksOpties, api: RealworksApi, pad: string): AsyncGenerator<Pagina> {
  let url: string | undefined = `${opties.basisUrl ?? BASIS}${pad}`;
  // Begrenzing tegen een eindeloze lus als de API steeds dezelfde 'volgende' teruggeeft.
  for (let i = 0; url && i < 1000; i++) {
    const pagina: Pagina = await haalPagina(opties, api, url);
    yield pagina;
    const volgende: string | undefined = pagina.paginering?.volgende;
    url = volgende && volgende !== url ? volgende : undefined;
  }
}

const object = (w: unknown): Record<string, unknown> => (w !== null && typeof w === "object" ? (w as Record<string, unknown>) : {});
const tekst = (w: unknown): string | null => (typeof w === "string" && w.trim() !== "" ? w.trim() : typeof w === "number" ? String(w) : null);
const getal = (w: unknown): number | null => (typeof w === "number" && Number.isFinite(w) ? w : null);
const datum = (w: unknown): string | null => {
  const t = tekst(w);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
const tijdstip = (w: unknown): string | null => {
  const t = tekst(w);
  return t && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t) ? t : null;
};

export function naarObject(ruw: unknown): ObjectGegevens {
  const o = object(ruw);
  const id = getal(o.id);
  if (id === null) throw new Error("Wonen-object zonder id");
  const adres = object(o.adres);
  const huisnummer = object(adres.huisnummer);
  const overdracht = object(object(o.financieel).overdracht);
  const diversen = object(object(o.diversen).diversen);
  return {
    realworksId: id,
    objectcode: tekst(diversen.objectcode),
    afdelingscode: tekst(diversen.afdelingscode),
    straat: tekst(adres.straat),
    huisnummer: tekst(huisnummer.hoofdnummer),
    huisnummertoevoeging: tekst(huisnummer.toevoeging),
    postcode: tekst(adres.postcode),
    plaats: tekst(adres.plaats),
    status: tekst(overdracht.status),
    actief: typeof o.actief === "boolean" ? o.actief : null,
    vraagprijs: getal(overdracht.koopprijs),
    transactieprijs: getal(overdracht.transactieprijs),
    transactiedatum: datum(overdracht.transactiedatum),
    transportdatum: datum(overdracht.transportdatum),
    publicatiedatum: datum(object(o.marketing).publicatiedatum),
    gekoppeldeMakelaarCode: tekst(object(o.algemeen).gekoppeldeMakelaar),
    realworksGewijzigdOp: tijdstip(o.tijdstipLaatsteWijziging),
  };
}

export function naarMedewerker(ruw: unknown): MedewerkerGegevens {
  const m = object(ruw);
  const id = getal(m.id);
  if (id === null) throw new Error("medewerker zonder id");
  const roepnaam = tekst(m.roepnaam);
  const tussenvoegsel = tekst(m.tussenvoegsel);
  const achternaam = tekst(m.achternaam);
  const naam = [roepnaam, tussenvoegsel, achternaam].filter(Boolean).join(" ");
  return { realworksId: id, relatiecode: tekst(object(m.overige).relatiecode), weergavenaam: naam || `Medewerker ${id}`, roepnaam, tussenvoegsel, achternaam };
}

export type ObjectenPagina = { objecten: ObjectGegevens[]; ruw: unknown[]; totaal: number | null };

/** Het actuele aanbod van een kantoor, per pagina. Realworks geeft alleen actuele objecten, geen historie. */
export async function* haalWonenObjecten(opties: RealworksOpties, { aantal = 100 }: { aantal?: number } = {}): AsyncGenerator<ObjectenPagina> {
  for await (const pagina of haalAllePaginas(opties, "wonen", `/wonen/v3/objecten?aantal=${aantal}`)) {
    yield { objecten: pagina.resultaten.map(naarObject), ruw: pagina.resultaten, totaal: pagina.paginering?.totaalAantal ?? null };
  }
}

export async function haalMedewerkers(opties: RealworksOpties): Promise<MedewerkerGegevens[]> {
  const medewerkers: MedewerkerGegevens[] = [];
  for await (const pagina of haalAllePaginas(opties, "relaties", "/relaties/v1/medewerker?aantal=100")) {
    medewerkers.push(...pagina.resultaten.map(naarMedewerker));
  }
  return medewerkers;
}

export function naarAgendapunt(ruw: unknown): AgendapuntGegevens {
  const a = object(ruw);
  const id = getal(a.id);
  if (id === null) throw new Error("agendapunt zonder id");
  const relaties = Array.isArray(a.relaties) ? a.relaties.map(object) : [];
  const relatie = (type: string) => getal(relaties.find((r) => r.type === type)?.id);
  return {
    realworksId: id,
    agendatype: tekst(a.agendatype),
    status: tekst(a.status),
    begintijd: tijdstip(a.begintijd),
    eindtijd: tijdstip(a.eindtijd),
    locatie: tekst(a.locatie),
    projectcode: tekst(object(a.project).projectcode),
    medewerkerRealworksId: relatie("Agendapunt voor"),
    relatieId: relatie("Id van de gekoppelde relatie"),
    realworksGewijzigdOp: tijdstip(a.tijdstipLaatsteWijziging),
  };
}

export type AgendaPagina = { agendapunten: AgendapuntGegevens[]; ruw: unknown[]; totaal: number | null };

/** Alle agendapunten van een afdeling, per pagina. De Agenda-API kent geen filters; de hele agenda komt mee. */
export async function* haalAgendapunten(opties: RealworksOpties, afdelingscode: string, { aantal = 100 }: { aantal?: number } = {}): AsyncGenerator<AgendaPagina> {
  for await (const pagina of haalAllePaginas(opties, "agenda", `/agenda/v3/afdeling/${encodeURIComponent(afdelingscode)}?aantal=${aantal}`)) {
    yield { agendapunten: pagina.resultaten.map(naarAgendapunt), ruw: pagina.resultaten, totaal: pagina.paginering?.totaalAantal ?? null };
  }
}
