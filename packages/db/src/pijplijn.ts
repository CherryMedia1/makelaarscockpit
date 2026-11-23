// Pijplijn voor bezichtigersleads (issue #54, ADR-020). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
import type { FaseSoort, LeadInvoer, LeadLinks, PijplijnFase, RelatieContact } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

/** Alle fases van de tenant in volgorde, ook de uitgezette. */
export async function leesPijplijnFases(tx: Tx, tenantId: string): Promise<PijplijnFase[]> {
  const { rows } = await tx.query("select id, naam, volgorde, soort, actief from pijplijn_fase where tenant_id = $1 order by volgorde, aangemaakt_op", [tenantId]);
  return rows as PijplijnFase[];
}

/** Voegt een fase toe aan het eind van de pijplijn. */
export async function voegPijplijnFaseToe(tx: Tx, tenantId: string, fase: { naam: string; soort: FaseSoort }): Promise<string> {
  const { rows } = await tx.query(
    `insert into pijplijn_fase (tenant_id, naam, soort, volgorde)
     values ($1, $2, $3, (select coalesce(max(volgorde), 0) + 1 from pijplijn_fase where tenant_id = $1))
     returning id`,
    [tenantId, fase.naam, fase.soort],
  );
  return rows[0].id as string;
}

export async function wijzigPijplijnFase(tx: Tx, tenantId: string, id: string, fase: { naam: string; soort: FaseSoort }): Promise<boolean> {
  const { rowCount } = await tx.query("update pijplijn_fase set naam = $3, soort = $4 where tenant_id = $1 and id = $2", [tenantId, id, fase.naam, fase.soort]);
  return rowCount === 1;
}

export async function zetPijplijnFaseActief(tx: Tx, tenantId: string, id: string, actief: boolean): Promise<boolean> {
  const { rowCount } = await tx.query("update pijplijn_fase set actief = $3 where tenant_id = $1 and id = $2", [tenantId, id, actief]);
  return rowCount === 1;
}

/** Zet de fases in de volgorde van `ids`; id's van een andere tenant doen niets. */
export async function zetPijplijnVolgorde(tx: Tx, tenantId: string, ids: readonly string[]): Promise<void> {
  await tx.query(
    `update pijplijn_fase f set volgorde = d.plek
       from unnest($2::uuid[]) with ordinality as d(id, plek)
      where f.tenant_id = $1 and f.id = d.id`,
    [tenantId, ids],
  );
}

/** Verwijdert een fase, behalve als er leads in zitten of ooit in zaten: dan kan ze alleen worden uitgezet. */
export async function verwijderPijplijnFase(tx: Tx, tenantId: string, id: string): Promise<"verwijderd" | "in-gebruik" | "onbekend"> {
  const gebruik = await tx.query(
    `select exists (select 1 from lead where tenant_id = $1 and fase_id = $2)
         or exists (select 1 from lead_historie where tenant_id = $1 and (naar_fase_id = $2 or van_fase_id = $2)) as bezet`,
    [tenantId, id],
  );
  if (gebruik.rows[0].bezet) return "in-gebruik";
  const { rowCount } = await tx.query("delete from pijplijn_fase where tenant_id = $1 and id = $2", [tenantId, id]);
  return rowCount === 1 ? "verwijderd" : "onbekend";
}

export type LeadStand = { bezichtigerId: string; faseId: string; fase: string; soort: FaseSoort; eigenaar: string | null; naam: string | null; naamGezocht: boolean };

/** Per bezichtiger met een lead: de fase en de eigenaar, voor het overzicht. */
export async function leesLeadStanden(tx: Tx, tenantId: string): Promise<LeadStand[]> {
  const { rows } = await tx.query(
    `select l.bezichtiger_id as "bezichtigerId", f.id as "faseId", f.naam as fase, f.soort, m.weergavenaam as eigenaar,
            b.naam, b.naam_opgehaald_op is not null as "naamGezocht"
       from lead l
       join bezichtiger b on b.id = l.bezichtiger_id and b.tenant_id = l.tenant_id
       join pijplijn_fase f on f.id = l.fase_id and f.tenant_id = l.tenant_id
       left join medewerker m on m.id = l.eigenaar_medewerker_id and m.tenant_id = l.tenant_id
      where l.tenant_id = $1`,
    [tenantId],
  );
  return rows as LeadStand[];
}

export type LeadKaart = {
  bezichtigerId: string;
  naam: string | null;
  naamGezocht: boolean;
  lead: {
    id: string;
    faseId: string;
    eigenaarId: string | null;
    notitie: string | null;
    aangemaaktOp: Date;
    gewijzigdOp: Date;
    email: string | null;
    telefoon: string | null;
    website: string | null;
    links: LeadLinks;
    /** Null zolang de contactgegevens nog niet uit Realworks zijn opgehaald. */
    contactOpgehaaldOp: Date | null;
  } | null;
  historie: { op: Date; van: string | null; naar: string; door: string | null }[];
};

/** De bezichtiger met zijn lead en de historie van de fase; null als de bezichtiger niet bij deze tenant hoort. */
export async function leesLeadKaart(tx: Tx, tenantId: string, bezichtigerId: string): Promise<LeadKaart | null> {
  const basis = await tx.query(
    `select b.id as "bezichtigerId", b.naam, b.naam_opgehaald_op is not null as "naamGezocht",
            l.id as "leadId", l.fase_id as "faseId", l.eigenaar_medewerker_id as "eigenaarId", l.notitie, l.aangemaakt_op as "aangemaaktOp", l.gewijzigd_op as "gewijzigdOp",
            l.email, l.telefoon, l.website, l.linkedin_url as linkedin, l.facebook_url as facebook, l.instagram_url as instagram, l.contact_opgehaald_op as "contactOpgehaaldOp"
       from bezichtiger b
       left join lead l on l.bezichtiger_id = b.id and l.tenant_id = b.tenant_id
      where b.tenant_id = $1 and b.id = $2`,
    [tenantId, bezichtigerId],
  );
  const r = basis.rows[0];
  if (!r) return null;
  const historie = r.leadId
    ? (
        await tx.query(
          `select h.op, v.naam as van, n.naam as naar, g.naam as door
             from lead_historie h
             join pijplijn_fase n on n.id = h.naar_fase_id and n.tenant_id = h.tenant_id
             left join pijplijn_fase v on v.id = h.van_fase_id and v.tenant_id = h.tenant_id
             left join gebruiker g on g.id = h.door_gebruiker_id and g.tenant_id = h.tenant_id
            where h.tenant_id = $1 and h.lead_id = $2
            order by h.op desc`,
          [tenantId, r.leadId],
        )
      ).rows
    : [];
  return {
    bezichtigerId: r.bezichtigerId, naam: r.naam, naamGezocht: r.naamGezocht,
    lead: r.leadId
      ? {
          id: r.leadId, faseId: r.faseId, eigenaarId: r.eigenaarId, notitie: r.notitie, aangemaaktOp: r.aangemaaktOp, gewijzigdOp: r.gewijzigdOp,
          email: r.email, telefoon: r.telefoon, website: r.website, links: { linkedin: r.linkedin, facebook: r.facebook, instagram: r.instagram }, contactOpgehaaldOp: r.contactOpgehaaldOp,
        }
      : null,
    historie: historie as LeadKaart["historie"],
  };
}

/**
 * Zet de bezichtiger in de pijplijn of werkt zijn lead bij. Een nieuwe of gewijzigde fase komt in de historie.
 * Geeft null als de bezichtiger niet bij deze tenant hoort.
 */
export async function bewaarLead(tx: Tx, tenantId: string, bezichtigerId: string, invoer: LeadInvoer, gebruikerId: string): Promise<{ leadId: string; faseGewijzigd: boolean; nieuw: boolean } | null> {
  const bezichtiger = await tx.query("select 1 from bezichtiger where tenant_id = $1 and id = $2", [tenantId, bezichtigerId]);
  if (bezichtiger.rowCount !== 1) return null;
  const vorige = await tx.query("select id, fase_id from lead where tenant_id = $1 and bezichtiger_id = $2 for update", [tenantId, bezichtigerId]);
  const vorigeFase: string | null = vorige.rows[0]?.fase_id ?? null;
  const { rows } = await tx.query(
    `insert into lead (tenant_id, bezichtiger_id, fase_id, eigenaar_medewerker_id, notitie, aangemaakt_door)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (tenant_id, bezichtiger_id) do update
       set fase_id = excluded.fase_id, eigenaar_medewerker_id = excluded.eigenaar_medewerker_id, notitie = excluded.notitie, gewijzigd_op = now()
     returning id`,
    [tenantId, bezichtigerId, invoer.faseId, invoer.eigenaarId, invoer.notitie, gebruikerId],
  );
  const leadId = rows[0].id as string;
  const faseGewijzigd = vorigeFase !== invoer.faseId;
  if (faseGewijzigd) {
    await tx.query("insert into lead_historie (tenant_id, lead_id, van_fase_id, naar_fase_id, door_gebruiker_id) values ($1, $2, $3, $4, $5)", [tenantId, leadId, vorigeFase, invoer.faseId, gebruikerId]);
  }
  return { leadId, faseGewijzigd, nieuw: vorigeFase === null };
}

/** De leads waarvan de contactgegevens uit Realworks moeten komen: één lead, of alle leads van de tenant. */
export async function leadsVoorContact(tx: Tx, tenantId: string, leadId?: string): Promise<{ leadId: string; relatieId: number }[]> {
  const { rows } = await tx.query(
    `select l.id as "leadId", b.realworks_relatie_id as "relatieId"
       from lead l
       join bezichtiger b on b.id = l.bezichtiger_id and b.tenant_id = l.tenant_id
      where l.tenant_id = $1 and ($2::uuid is null or l.id = $2)
      order by l.contact_opgehaald_op nulls first`,
    [tenantId, leadId ?? null],
  );
  return rows.map((r) => ({ leadId: r.leadId as string, relatieId: Number(r.relatieId) }));
}

/**
 * Legt de contactgegevens uit Realworks vast. Realworks is leidend voor e-mail, telefoon en website. Een link naar
 * social media uit Realworks vult alleen een leeg veld: wat een medewerker heeft ingevuld, blijft staan. Met
 * `contact` null (relatie niet meer in Realworks) wordt alleen vastgelegd dat het is geprobeerd.
 */
export async function zetLeadContact(tx: Tx, tenantId: string, leadId: string, contact: RelatieContact | null): Promise<void> {
  if (!contact) {
    await tx.query("update lead set contact_opgehaald_op = now() where tenant_id = $1 and id = $2", [tenantId, leadId]);
    return;
  }
  await tx.query(
    `update lead
        set email = $3, telefoon = $4, website = $5, linkedin_url = coalesce(linkedin_url, $6), facebook_url = coalesce(facebook_url, $7),
            instagram_url = coalesce(instagram_url, $8), contact_opgehaald_op = now()
      where tenant_id = $1 and id = $2`,
    [tenantId, leadId, contact.email, contact.telefoon, contact.website, contact.links.linkedin, contact.links.facebook, contact.links.instagram],
  );
}

/** Legt de links vast die een medewerker op de lead-kaart invult; false als de bezichtiger geen lead heeft. */
export async function bewaarLeadLinks(tx: Tx, tenantId: string, bezichtigerId: string, links: LeadLinks): Promise<boolean> {
  const { rowCount } = await tx.query(
    "update lead set linkedin_url = $3, facebook_url = $4, instagram_url = $5, gewijzigd_op = now() where tenant_id = $1 and bezichtiger_id = $2",
    [tenantId, bezichtigerId, links.linkedin, links.facebook, links.instagram],
  );
  return rowCount === 1;
}

/**
 * Zet een bestaande lead in een andere fase, vanaf het bord; eigenaar en notitie blijven staan. Geeft null als de
 * bezichtiger geen lead heeft bij deze tenant.
 */
export async function zetLeadFase(tx: Tx, tenantId: string, bezichtigerId: string, faseId: string, gebruikerId: string): Promise<{ leadId: string; faseGewijzigd: boolean } | null> {
  const vorige = await tx.query("select id, fase_id from lead where tenant_id = $1 and bezichtiger_id = $2 for update", [tenantId, bezichtigerId]);
  const lead = vorige.rows[0];
  if (!lead) return null;
  if (lead.fase_id === faseId) return { leadId: lead.id, faseGewijzigd: false };
  await tx.query("update lead set fase_id = $3, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, lead.id, faseId]);
  await tx.query("insert into lead_historie (tenant_id, lead_id, van_fase_id, naar_fase_id, door_gebruiker_id) values ($1, $2, $3, $4, $5)", [tenantId, lead.id, lead.fase_id, faseId, gebruikerId]);
  return { leadId: lead.id, faseGewijzigd: true };
}

/** Haalt de bezichtiger uit de pijplijn: de lead en zijn historie verdwijnen, de bezichtiger en zijn bezichtigingen blijven. */
export async function verwijderLead(tx: Tx, tenantId: string, bezichtigerId: string): Promise<boolean> {
  const { rowCount } = await tx.query("delete from lead where tenant_id = $1 and bezichtiger_id = $2", [tenantId, bezichtigerId]);
  return rowCount === 1;
}
