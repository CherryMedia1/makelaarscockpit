// Contactgegevens en social media-links op de lead-kaart (issue #54, ADR-020). Links komen uit Realworks of worden door
// een medewerker ingevuld; er wordt niets bij externe bronnen opgezocht.
export const PLATFORMS = ["linkedin", "facebook", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram" };

const DOMEIN: Record<Platform, string> = { linkedin: "linkedin.com", facebook: "facebook.com", instagram: "instagram.com" };
const MAX_LINK = 300;

/** Het platform waar een https-link naartoe wijst, op basis van het domein; null voor alles daarbuiten. */
export function platformVanUrl(tekst: string): Platform | null {
  let url: URL;
  try {
    url = new URL(tekst);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find((p) => host === DOMEIN[p] || host.endsWith(`.${DOMEIN[p]}`)) ?? null;
}

export type LeadLinks = Record<Platform, string | null>;

/** Controleert handmatig ingevulde links: leeg mag, anders een https-link naar het juiste platform. */
export function valideerLeadLinks(invoer: Record<Platform, string>): { ok: true; waarde: LeadLinks } | { ok: false; fout: Platform } {
  const waarde: LeadLinks = { linkedin: null, facebook: null, instagram: null };
  for (const p of PLATFORMS) {
    const link = invoer[p].trim();
    if (!link) continue;
    if (link.length > MAX_LINK || platformVanUrl(link) !== p) return { ok: false, fout: p };
    waarde[p] = link;
  }
  return { ok: true, waarde };
}

/** Wat we van een relatie uit Realworks overnemen voor een lead. */
export type RelatieContact = { email: string | null; telefoon: string | null; website: string | null; links: LeadLinks };
