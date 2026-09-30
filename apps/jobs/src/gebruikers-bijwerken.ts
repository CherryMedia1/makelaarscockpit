// Voegt gebruikers toe of werkt ze bij vanuit een lijst in de blob-container `import` (<tenant>/gebruikers.json), en verwijdert
// die lijst daarna. Bedoeld voor de eerste gebruikers van een kantoor, tot het gebruikersbeheer in het portaal zit (issue #5).
// In de log staan alleen aantallen, geen adressen of namen.
import { readFile } from "node:fs/promises";
import { bewaarGebruiker, maakDb, zoekTenant } from "@makelaarscockpit/db";
import { normaliseerEmail, type Rol } from "@makelaarscockpit/domain";
import { leesBlob, omgeving, verwijderBlob } from "./azure";

type Invoer = { email?: unknown; naam?: unknown; rol?: unknown; toegangTot?: unknown; microsoftTenantId?: unknown };

const tekstOfNull = (w: unknown) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

export async function gebruikersBijwerken(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const blob = `${tenantSleutel}/gebruikers.json`;
  const inhoud = process.env.GEBRUIKERS_BESTAND ? await readFile(process.env.GEBRUIKERS_BESTAND) : await leesBlob("import", blob);
  const lijst = JSON.parse(inhoud.toString("utf8")) as Invoer[];
  if (!Array.isArray(lijst)) throw new Error("gebruikers.json moet een lijst zijn");

  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);
    const tel = { toegevoegd: 0, bijgewerkt: 0 };
    for (const [i, g] of lijst.entries()) {
      const email = typeof g.email === "string" ? normaliseerEmail(g.email) : null;
      const rol = g.rol === "medewerker" || g.rol === "kantoorbeheerder" ? (g.rol as Rol) : null;
      const toegangTot = tekstOfNull(g.toegangTot);
      const microsoftTenantId = tekstOfNull(g.microsoftTenantId);
      if (!email) throw new Error(`regel ${i + 1}: ongeldig e-mailadres`);
      if (!rol) throw new Error(`regel ${i + 1}: rol moet medewerker of kantoorbeheerder zijn`);
      if (toegangTot && !/^\d{4}-\d{2}-\d{2}$/.test(toegangTot)) throw new Error(`regel ${i + 1}: toegangTot moet JJJJ-MM-DD zijn`);
      if (microsoftTenantId && !/^[0-9a-f-]{36}$/i.test(microsoftTenantId)) throw new Error(`regel ${i + 1}: microsoftTenantId is geen geldig id`);
      const uitkomst = await bewaarGebruiker(db, { tenantId: tenant.id, email, naam: tekstOfNull(g.naam), rol, toegangTot, microsoftTenantId });
      tel[uitkomst] += 1;
    }
    console.log(`gebruikers voor tenant ${tenant.sleutel}: ${tel.toegevoegd} toegevoegd, ${tel.bijgewerkt} bijgewerkt`);
  } finally {
    await db.end();
  }
  if (!process.env.GEBRUIKERS_BESTAND) {
    await verwijderBlob("import", blob);
    console.log("lijst verwijderd uit de opslag");
  }
}
