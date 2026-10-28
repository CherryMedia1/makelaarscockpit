// Opschonen van intakedossiers (ADR-015, stap A9), aangeroepen door de dagelijkse sync. Per dossier in één transactie:
// eerst de bestanden in Blob weg, dan de database; mislukt het verwijderen van bestanden, dan blijft alles staan en
// probeert de volgende run het opnieuw. Alleen id's en aantallen in de log.
import { intakeDossiersVoorOpschonen, metTenant, schoonIntakeDossierOp, verwijderIntakeDossier, type Db } from "@makelaarscockpit/db";
import { opschoonActie } from "@makelaarscockpit/domain";

/** Verwijdert alle bestanden onder een prefix in container `intake`; geeft het aantal terug. */
export type VerwijderBestanden = (prefix: string) => Promise<number>;

export async function schoonIntakeOp(db: Db, tenantId: string, vandaag: string, verwijderBestanden: VerwijderBestanden): Promise<{ opgeschoond: number; verwijderd: number }> {
  const dossiers = await metTenant(db, tenantId, (tx) => intakeDossiersVoorOpschonen(tx, tenantId));
  const telling = { opgeschoond: 0, verwijderd: 0 };
  for (const d of dossiers) {
    const actie = opschoonActie(d, vandaag);
    if (!actie) continue;
    await metTenant(db, tenantId, async (tx) => {
      const bestanden = await verwijderBestanden(`${tenantId}/${d.id}/`);
      if (actie === "verwijderen") {
        await verwijderIntakeDossier(tx, tenantId, d.id);
        console.log(`intake: dossier ${d.id} verwijderd (woning 30 dagen van het bord zonder verkoop); ${bestanden} bestanden`);
      } else {
        const t = await schoonIntakeDossierOp(tx, tenantId, d.id);
        console.log(`intake: dossier ${d.id} opgeschoond na verkoop; ${bestanden} bestanden, ${t.velden} velden, ${t.citaten} citaten, ${t.bronnen} bronnen, ${t.teksten} niet-goedgekeurde tekst(en)`);
      }
    });
    telling[actie === "verwijderen" ? "verwijderd" : "opgeschoond"] += 1;
  }
  return telling;
}
