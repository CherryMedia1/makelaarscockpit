// Wie mag inloggen (ADR-006, ADR-009). Alleen gebruikers die bij een kantoor zijn toegevoegd; een Microsoft-inlog moet
// bovendien uit de Microsoft-organisatie van dat kantoor komen. Dat laatste is essentieel: het e-mailadres in een
// Microsoft-token van een willekeurige organisatie is niet te vertrouwen.

export type Rol = "medewerker" | "kantoorbeheerder";

export type GebruikerVoorInlog = {
  id: string;
  tenantId: string;
  email: string;
  naam: string | null;
  rol: Rol;
  actief: boolean;
  /** Laatste dag met toegang ('JJJJ-MM-DD'), voor tijdelijke accounts zoals de pilot-toegang; null = onbeperkt. */
  toegangTot: string | null;
  /** Afwijkende Microsoft-organisatie voor deze gebruiker; null = die van het kantoor. */
  microsoftTenantId: string | null;
  kantoorMicrosoftTenantId: string | null;
};

export type InlogPoging = { methode: "email" } | { methode: "microsoft"; microsoftTenantId: string };

export type InlogOordeel = { toegestaan: true } | { toegestaan: false; reden: "onbekend" | "inactief" | "verlopen" | "andere-organisatie" };

export function normaliseerEmail(invoer: string): string | null {
  const email = invoer.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** `vandaag` als 'JJJJ-MM-DD' in Nederlandse tijd. */
export function beoordeelInlog(gebruiker: GebruikerVoorInlog | null, poging: InlogPoging, vandaag: string): InlogOordeel {
  if (!gebruiker) return { toegestaan: false, reden: "onbekend" };
  if (!gebruiker.actief) return { toegestaan: false, reden: "inactief" };
  if (gebruiker.toegangTot !== null && vandaag > gebruiker.toegangTot) return { toegestaan: false, reden: "verlopen" };
  if (poging.methode === "microsoft") {
    const verwacht = gebruiker.microsoftTenantId ?? gebruiker.kantoorMicrosoftTenantId;
    if (!verwacht || verwacht.toLowerCase() !== poging.microsoftTenantId.toLowerCase()) return { toegestaan: false, reden: "andere-organisatie" };
  }
  return { toegestaan: true };
}

/**
 * Wie mag de financiële invoer per verkoop doen (courtage, opstartnota, verdeling, kosten). In de pilot elke medewerker:
 * een gebruiker is nog niet gekoppeld aan een medewerker uit Realworks, dus "eigen verkopen" (ADR-006) is nog niet te bepalen.
 */
export function magFinancieelInvoeren(rol: Rol): boolean {
  return rol === "medewerker" || rol === "kantoorbeheerder";
}

/** Doelstellingen en gebruikers: alleen de kantoorbeheerder (ADR-006). */
export function magKantoorBeheren(rol: Rol): boolean {
  return rol === "kantoorbeheerder";
}
