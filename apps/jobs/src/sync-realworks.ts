// Spiegelt medewerkers en het actuele Wonen-aanbod van één tenant uit Realworks (issue #4, ADR-005).
// Ruwe antwoorden gaan naar de blob-container raw-realworks; in de log staan alleen aantallen en statussen.
import { maakDb, metTenant, telSpiegel, upsertMedewerkers, upsertObjecten, zoekTenant } from "@makelaarscockpit/db";
import { haalMedewerkers, haalWonenObjecten, type RealworksApi, type RealworksOpties } from "@makelaarscockpit/realworks";
import { leesSecret, omgeving, schrijfBlob } from "./azure";

export async function syncRealworks(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const tokens = new Map<RealworksApi, Promise<string>>();
  const opties: RealworksOpties = {
    token: (api) => tokens.get(api) ?? tokens.set(api, leesSecret(`tenant-${tenantSleutel}-realworks-token-${api}`)).get(api)!,
  };
  const nu = new Date().toISOString();
  const map = `${tenantSleutel}/${nu.slice(0, 10)}/${nu.slice(11, 19).replaceAll(":", "")}`;

  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);

    const medewerkers = await haalMedewerkers(opties);
    await metTenant(db, tenant.id, (tx) => upsertMedewerkers(tx, tenant.id, medewerkers));
    console.log(`medewerkers gespiegeld: ${medewerkers.length}`);

    let pagina = 0;
    let objecten = 0;
    for await (const blok of haalWonenObjecten(opties)) {
      pagina += 1;
      await schrijfBlob("raw-realworks", `${map}-wonen-${String(pagina).padStart(3, "0")}.json`, JSON.stringify(blok.ruw));
      await metTenant(db, tenant.id, (tx) => upsertObjecten(tx, tenant.id, blok.objecten));
      objecten += blok.objecten.length;
      console.log(`wonen pagina ${pagina}: ${blok.objecten.length} objecten (totaal volgens Realworks: ${blok.totaal ?? "onbekend"})`);
    }

    const stand = await metTenant(db, tenant.id, (tx) => telSpiegel(tx, tenant.id));
    console.log(`opgehaald: ${objecten} objecten; in de database: ${stand.objecten} objecten, ${stand.medewerkers} medewerkers`);
    console.log(`objecten per status: ${JSON.stringify(stand.perStatus)}`);
  } finally {
    await db.end();
  }
}
