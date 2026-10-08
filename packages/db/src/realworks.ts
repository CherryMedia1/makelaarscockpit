// Spiegelen van Realworks-gegevens (medewerkers, Wonen-objecten). Altijd binnen metTenant, met filter op tenant_id.
import type { MedewerkerGegevens, ObjectGegevens } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

export async function upsertMedewerkers(tx: Tx, tenantId: string, medewerkers: MedewerkerGegevens[]): Promise<void> {
  for (const m of medewerkers) {
    await tx.query(
      `insert into medewerker (tenant_id, realworks_id, relatiecode, weergavenaam, roepnaam, tussenvoegsel, achternaam, gesynchroniseerd_op)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (tenant_id, realworks_id) do update
         set relatiecode = excluded.relatiecode, weergavenaam = excluded.weergavenaam, roepnaam = excluded.roepnaam,
             tussenvoegsel = excluded.tussenvoegsel, achternaam = excluded.achternaam, gesynchroniseerd_op = now()`,
      [tenantId, m.realworksId, m.relatiecode, m.weergavenaam, m.roepnaam, m.tussenvoegsel, m.achternaam],
    );
  }
}

/** Relatiecode → weergavenaam van de medewerkers, om de gekoppelde makelaar van een object op te zoeken. */
export async function leesMakelaarCodes(tx: Tx, tenantId: string): Promise<Map<string, string>> {
  const { rows } = await tx.query("select relatiecode, weergavenaam from medewerker where tenant_id = $1 and relatiecode is not null", [tenantId]);
  return new Map(rows.map((r) => [r.relatiecode as string, r.weergavenaam as string]));
}

export async function upsertObjecten(tx: Tx, tenantId: string, objecten: ObjectGegevens[]): Promise<void> {
  for (const o of objecten) {
    await tx.query(
      `insert into object (tenant_id, realworks_id, objectcode, afdelingscode, straat, huisnummer, huisnummertoevoeging, postcode, plaats,
         status, actief, vraagprijs, transactieprijs, transactiedatum, transportdatum, publicatiedatum, gekoppelde_makelaar_code,
         realworks_gewijzigd_op, gesynchroniseerd_op)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18::timestamp at time zone 'Europe/Amsterdam', now())
       on conflict (tenant_id, realworks_id) do update
         set objectcode = excluded.objectcode, afdelingscode = excluded.afdelingscode, straat = excluded.straat,
             huisnummer = excluded.huisnummer, huisnummertoevoeging = excluded.huisnummertoevoeging, postcode = excluded.postcode,
             plaats = excluded.plaats, status = excluded.status, actief = excluded.actief, vraagprijs = excluded.vraagprijs,
             transactieprijs = excluded.transactieprijs, transactiedatum = excluded.transactiedatum,
             transportdatum = excluded.transportdatum, publicatiedatum = excluded.publicatiedatum,
             gekoppelde_makelaar_code = excluded.gekoppelde_makelaar_code,
             realworks_gewijzigd_op = excluded.realworks_gewijzigd_op, gesynchroniseerd_op = now()`,
      [
        tenantId, o.realworksId, o.objectcode, o.afdelingscode, o.straat, o.huisnummer, o.huisnummertoevoeging, o.postcode, o.plaats,
        o.status, o.actief, o.vraagprijs, o.transactieprijs, o.transactiedatum, o.transportdatum, o.publicatiedatum,
        o.gekoppeldeMakelaarCode, o.realworksGewijzigdOp,
      ],
    );
  }
}

export async function telSpiegel(tx: Tx, tenantId: string): Promise<{ objecten: number; medewerkers: number; perStatus: Record<string, number> }> {
  const objecten = await tx.query("select coalesce(status, 'onbekend') as status, count(*)::int as n from object where tenant_id = $1 group by 1", [tenantId]);
  const medewerkers = await tx.query("select count(*)::int as n from medewerker where tenant_id = $1", [tenantId]);
  const perStatus = Object.fromEntries(objecten.rows.map((r) => [r.status as string, r.n as number]));
  return { objecten: Object.values(perStatus).reduce((t, n) => t + n, 0), medewerkers: medewerkers.rows[0].n, perStatus };
}
