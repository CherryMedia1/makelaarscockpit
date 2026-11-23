// Bezichtigersleads, eerste plak (issue #48, ADR-019): welke agendapunten zijn bezichtigingen, en hoe worden ze per
// relatie tot één lead. Alleen-lezen overzicht voor het kantoor zelf; toestemmingen en acties volgen later.
import type { AgendapuntGegevens } from "../realworks-gegevens";

const BEZICHTIGING = /bezicht|open huis/i;

/** Elke soort bezichtiging telt: 1e, 2e, planner, aankoop, huur en open huis (besluit Tim, 2026-11-23). */
export const isBezichtigingType = (agendatype: string | null): boolean => agendatype !== null && BEZICHTIGING.test(agendatype);

/** Zo lang bewaren we een bezichtiging na de afspraak (besluit Tim, 2026-11-23; ADR-019). */
export const BEZICHTIGING_BEWAARTERMIJN_MAANDEN = 6;

/** De oudste dag ('JJJJ-MM-DD') waarvan we bezichtigingen bewaren: zes maanden voor vandaag. */
export function bezichtigingenVanaf(vandaag: string): string {
  const [jaar, maand, dag] = vandaag.split("-").map(Number) as [number, number, number];
  const eerste = new Date(Date.UTC(jaar, maand - 1 - BEZICHTIGING_BEWAARTERMIJN_MAANDEN, 1));
  // Bestaat de dag niet in die maand (31 augustus → februari), dan de laatste dag van die maand.
  const laatsteDag = new Date(Date.UTC(eerste.getUTCFullYear(), eerste.getUTCMonth() + 1, 0)).getUTCDate();
  eerste.setUTCDate(Math.min(dag, laatsteDag));
  return eerste.toISOString().slice(0, 10);
}

/** Een bezichtiging zoals wij haar spiegelen: type, moment, project en de relatie. Nooit de notities van het agendapunt. */
export type BezichtigingUitRealworks = {
  realworksId: number;
  relatieId: number;
  agendatype: string;
  status: string | null;
  /** 'JJJJ-MM-DD UU:MM:SS' in Nederlandse tijd. */
  tijdstip: string;
  projectcode: string | null;
  projecttype: string | null;
  locatie: string | null;
  medewerkerRealworksId: number | null;
};

/**
 * Maakt van een agendapunt een bezichtiging, of null als het er geen is. Zonder gekoppelde klant is er geen lead: een
 * medewerker als gekoppelde relatie (een blok in de planner) telt niet. Geannuleerde afspraken tellen ook niet, en
 * afspraken van vóór `vanaf` (zie bezichtigingenVanaf) worden niet meer bewaard.
 */
export function naarBezichtiging(a: AgendapuntGegevens, medewerkerIds: ReadonlySet<number>, vanaf: string): BezichtigingUitRealworks | null {
  if (!a.agendatype || !isBezichtigingType(a.agendatype) || !a.begintijd || a.relatieId === null) return null;
  if (a.begintijd.slice(0, 10) < vanaf) return null;
  if (medewerkerIds.has(a.relatieId) || a.status === "Geannuleerd") return null;
  return {
    realworksId: a.realworksId, relatieId: a.relatieId, agendatype: a.agendatype, status: a.status, tijdstip: a.begintijd,
    projectcode: a.projectcode, projecttype: a.projecttype, locatie: a.locatie, medewerkerRealworksId: a.medewerkerRealworksId,
  };
}

/** Eén bezichtiging in het overzicht, al voorzien van naam, woning en makelaar. */
export type BezichtigingRegel = {
  id: string;
  bezichtigerId: string;
  /** Null zolang de naam niet is opgehaald of de relatie niet meer bestaat. */
  naam: string | null;
  /** Is de naam al opgezocht in Realworks? Zo ja en toch leeg, dan staat de relatie er niet (meer) in. */
  naamGezocht: boolean;
  agendatype: string;
  status: string | null;
  /** 'JJJJ-MM-DD UU:MM' in Nederlandse tijd. */
  tijdstip: string;
  projectcode: string | null;
  woning: string | null;
  makelaar: string;
};

export type Lead = {
  bezichtigerId: string;
  naam: string | null;
  naamGezocht: boolean;
  aantal: number;
  aantalWoningen: number;
  eerste: string;
  /** De meest recente bezichtiging tot en met vandaag; null als er alleen geplande zijn. */
  laatste: string | null;
  /** De eerstvolgende geplande bezichtiging, vanaf morgen. */
  komende: string | null;
  /** Een 2e bezichtiging, of dezelfde woning vaker bezocht: een sterker signaal dan losse bezichtigingen. */
  terugNaarZelfdeWoning: boolean;
  /** Makelaars van de bezichtigingen, die van de nieuwste eerst. */
  makelaars: string[];
  /** Nieuwste eerst. */
  bezichtigingen: BezichtigingRegel[];
};

/** Zet de bezichtigingen van dezelfde relatie op één lead; de lead met de meest recente bezichtiging staat bovenaan. */
export function groepeerLeads(regels: readonly BezichtigingRegel[], vandaag: string): Lead[] {
  const perRelatie = new Map<string, BezichtigingRegel[]>();
  for (const r of regels) perRelatie.set(r.bezichtigerId, [...(perRelatie.get(r.bezichtigerId) ?? []), r]);
  const leads = [...perRelatie.entries()].map(([bezichtigerId, lijst]): Lead => {
    const bezichtigingen = [...lijst].sort((a, b) => b.tijdstip.localeCompare(a.tijdstip));
    const geweest = bezichtigingen.filter((b) => b.tijdstip.slice(0, 10) <= vandaag);
    const gepland = bezichtigingen.filter((b) => b.tijdstip.slice(0, 10) > vandaag);
    const codes = bezichtigingen.flatMap((b) => (b.projectcode ? [b.projectcode] : []));
    const woningen = new Set(codes);
    return {
      bezichtigerId,
      naam: bezichtigingen.find((b) => b.naam)?.naam ?? null,
      naamGezocht: bezichtigingen.some((b) => b.naamGezocht),
      aantal: bezichtigingen.length,
      aantalWoningen: woningen.size,
      eerste: bezichtigingen.at(-1)!.tijdstip,
      laatste: geweest[0]?.tijdstip ?? null,
      komende: gepland.at(-1)?.tijdstip ?? null,
      terugNaarZelfdeWoning: codes.length > woningen.size || bezichtigingen.some((b) => /^2e /i.test(b.agendatype)),
      makelaars: [...new Set(bezichtigingen.map((b) => b.makelaar))],
      bezichtigingen,
    };
  });
  return leads.sort((a, b) => b.bezichtigingen[0]!.tijdstip.localeCompare(a.bezichtigingen[0]!.tijdstip));
}

export type LeadFilter = {
  /** 'JJJJ-MM-DD': alleen bezichtigingen op of na deze datum tellen. */
  vanaf?: string;
  projectcode?: string;
  makelaar?: string;
  alleenMeerdere?: boolean;
};

/** Een lead blijft staan als minstens één bezichtiging aan alle filters tegelijk voldoet. */
export function filterLeads(leads: readonly Lead[], filter: LeadFilter): Lead[] {
  const past = (b: BezichtigingRegel) =>
    (!filter.vanaf || b.tijdstip.slice(0, 10) >= filter.vanaf) && (!filter.projectcode || b.projectcode === filter.projectcode) && (!filter.makelaar || b.makelaar === filter.makelaar);
  return leads.filter((l) => (!filter.alleenMeerdere || l.aantal > 1) && l.bezichtigingen.some(past));
}

export type LeadCijfers = { leads: number; meerdere: number; bezichtigingenLaatste30Dagen: number; komend: number };

export function leadCijfers(leads: readonly Lead[], vandaag: string): LeadCijfers {
  const grens = new Date(`${vandaag}T00:00:00Z`);
  grens.setUTCDate(grens.getUTCDate() - 30);
  const vanaf = grens.toISOString().slice(0, 10);
  const alle = leads.flatMap((l) => l.bezichtigingen.map((b) => b.tijdstip.slice(0, 10)));
  return {
    leads: leads.length,
    meerdere: leads.filter((l) => l.aantal > 1).length,
    bezichtigingenLaatste30Dagen: alle.filter((d) => d >= vanaf && d <= vandaag).length,
    komend: alle.filter((d) => d > vandaag).length,
  };
}
