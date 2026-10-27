// Woningtekst-module (ADR-016). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
// Profielen en tekstinhoud zijn JSON; het schema en de controles staan in packages/ai en packages/domain.
import type { Tekstcontrole, TekstInhoud } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

export type Woningcategorie = "appartement" | "eengezinswoning" | "vrijstaand";
export type ProfielStatus = "concept" | "actief" | "gearchiveerd";
export type WoningtekstStatus = "concept" | "bezig" | "geschreven" | "mislukt" | "goedgekeurd";

export interface SchrijfprofielRij {
  id: string;
  versie: number;
  status: ProfielStatus;
  naam: string;
  profiel: unknown;
  aangemaaktOp: string;
}

const PROFIEL_KOLOMMEN = `id, versie, status, naam, profiel, aangemaakt_op as "aangemaaktOp"`;

export async function actiefSchrijfprofiel(tx: Tx, tenantId: string): Promise<SchrijfprofielRij | null> {
  const { rows } = await tx.query(`select ${PROFIEL_KOLOMMEN} from intake_schrijfprofiel where tenant_id = $1 and status = 'actief'`, [tenantId]);
  return rows[0] ?? null;
}

export async function schrijfprofielOpId(tx: Tx, tenantId: string, id: string): Promise<SchrijfprofielRij | null> {
  const { rows } = await tx.query(`select ${PROFIEL_KOLOMMEN} from intake_schrijfprofiel where tenant_id = $1 and id = $2`, [tenantId, id]);
  return rows[0] ?? null;
}

/** Alle versies, nieuwste eerst, zonder het profiel zelf. */
export async function schrijfprofielVersies(tx: Tx, tenantId: string): Promise<Omit<SchrijfprofielRij, "profiel">[]> {
  const { rows } = await tx.query(`select id, versie, status, naam, aangemaakt_op as "aangemaaktOp" from intake_schrijfprofiel where tenant_id = $1 order by versie desc`, [tenantId]);
  return rows;
}

/**
 * Bewaart een profiel als nieuwe versie; met `activeren` wordt die de actieve en gaat de vorige naar het archief.
 * Het profiel moet vooraf gevalideerd zijn (valideerSchrijfprofiel in packages/ai).
 */
export async function bewaarSchrijfprofiel(tx: Tx, tenantId: string, p: { naam: string; profiel: unknown }, gebruikerId: string | null, activeren: boolean): Promise<{ id: string; versie: number }> {
  // Twee gelijktijdige opslagen krijgen geen dubbel versienummer.
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`schrijfprofiel:${tenantId}`]);
  if (activeren) await tx.query("update intake_schrijfprofiel set status = 'gearchiveerd' where tenant_id = $1 and status = 'actief'", [tenantId]);
  const { rows } = await tx.query(
    `insert into intake_schrijfprofiel (tenant_id, versie, status, naam, profiel, aangemaakt_door)
     select $1, coalesce(max(versie), 0) + 1, $2, $3, $4::jsonb, $5 from intake_schrijfprofiel where tenant_id = $1
     returning id, versie`,
    [tenantId, activeren ? "actief" : "concept", p.naam, JSON.stringify(p.profiel), gebruikerId],
  );
  return rows[0];
}

export async function activeerSchrijfprofiel(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  if (!(await schrijfprofielOpId(tx, tenantId, id))) return false;
  await tx.query("update intake_schrijfprofiel set status = 'gearchiveerd' where tenant_id = $1 and status = 'actief' and id <> $2", [tenantId, id]);
  await tx.query("update intake_schrijfprofiel set status = 'actief' where tenant_id = $1 and id = $2", [tenantId, id]);
  return true;
}

export interface Schrijfvoorbeeld {
  id: string;
  titel: string;
  woningcategorie: Woningcategorie;
  tekst: string;
  aangemaaktOp: string;
}

export async function schrijfvoorbeelden(tx: Tx, tenantId: string): Promise<Schrijfvoorbeeld[]> {
  const { rows } = await tx.query(
    `select id, titel, woningcategorie, tekst, aangemaakt_op as "aangemaaktOp" from intake_schrijfvoorbeeld where tenant_id = $1 order by woningcategorie, titel`,
    [tenantId],
  );
  return rows;
}

/** `aantal` voorbeelden, eerst van dezelfde categorie, daarna de nieuwste. */
export async function kiesSchrijfvoorbeelden(tx: Tx, tenantId: string, categorie: Woningcategorie, aantal: number): Promise<{ titel: string; tekst: string }[]> {
  if (aantal <= 0) return [];
  const { rows } = await tx.query(
    `select titel, tekst from intake_schrijfvoorbeeld where tenant_id = $1 order by (woningcategorie = $2) desc, aangemaakt_op desc limit $3`,
    [tenantId, categorie, aantal],
  );
  return rows;
}

export async function voegSchrijfvoorbeeldToe(tx: Tx, tenantId: string, v: { titel: string; woningcategorie: Woningcategorie; tekst: string }, gebruikerId: string | null): Promise<string> {
  const { rows } = await tx.query(
    "insert into intake_schrijfvoorbeeld (tenant_id, titel, woningcategorie, tekst, aangemaakt_door) values ($1, $2, $3, $4, $5) returning id",
    [tenantId, v.titel, v.woningcategorie, v.tekst, gebruikerId],
  );
  return rows[0].id;
}

export async function verwijderSchrijfvoorbeeld(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await tx.query("delete from intake_schrijfvoorbeeld where tenant_id = $1 and id = $2", [tenantId, id]);
  return rowCount === 1;
}

export interface Woningtekst {
  id: string;
  dossierId: string;
  profielId: string;
  steekwoorden: Record<string, string>;
  woningcategorie: Woningcategorie | null;
  status: WoningtekstStatus;
  fout: string | null;
  goedgekeurdeVersieId: string | null;
  goedgekeurdDoor: string | null;
  goedgekeurdOp: string | null;
  gewijzigdOp: string;
}

const TEKST_KOLOMMEN = `id, dossier_id as "dossierId", profiel_id as "profielId", steekwoorden, woningcategorie, status, fout,
  goedgekeurde_versie_id as "goedgekeurdeVersieId", goedgekeurd_door as "goedgekeurdDoor", goedgekeurd_op as "goedgekeurdOp", gewijzigd_op as "gewijzigdOp"`;

/** Adres, plaats en energielabel van de woning van een dossier, uit de Realworks-kopie. */
export async function woningVanDossier(tx: Tx, tenantId: string, dossierId: string): Promise<{ adres: string | null; plaats: string | null; energieklasse: string | null } | null> {
  const { rows } = await tx.query(
    `select w.adres, w.plaats, o.energieklasse
       from intake_dossier d
       join woning w on w.tenant_id = d.tenant_id and w.id = d.woning_id
       left join object o on o.tenant_id = w.tenant_id and o.id = w.object_id
      where d.tenant_id = $1 and d.id = $2`,
    [tenantId, dossierId],
  );
  return rows[0] ?? null;
}

export async function woningtekstVanDossier(tx: Tx, tenantId: string, dossierId: string): Promise<Woningtekst | null> {
  const { rows } = await tx.query(`select ${TEKST_KOLOMMEN} from intake_woningtekst where tenant_id = $1 and dossier_id = $2`, [tenantId, dossierId]);
  return rows[0] ?? null;
}

export async function woningtekstOpId(tx: Tx, tenantId: string, id: string): Promise<Woningtekst | null> {
  const { rows } = await tx.query(`select ${TEKST_KOLOMMEN} from intake_woningtekst where tenant_id = $1 and id = $2`, [tenantId, id]);
  return rows[0] ?? null;
}

/** Bewaart de steekwoorden; maakt de woningtekst aan met het actieve profiel als die er nog niet is. Null als er geen actief profiel is. */
export async function bewaarSteekwoorden(tx: Tx, tenantId: string, dossierId: string, steekwoorden: Record<string, string>, woningcategorie: Woningcategorie | null): Promise<string | null> {
  const profiel = await actiefSchrijfprofiel(tx, tenantId);
  if (!profiel) return null;
  const { rows } = await tx.query(
    `insert into intake_woningtekst (tenant_id, dossier_id, profiel_id, steekwoorden, woningcategorie)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (tenant_id, dossier_id) do update set steekwoorden = excluded.steekwoorden, woningcategorie = excluded.woningcategorie, gewijzigd_op = now()
     returning id`,
    [tenantId, dossierId, profiel.id, JSON.stringify(steekwoorden), woningcategorie],
  );
  return rows[0].id;
}

/**
 * Zet de tekst op "bezig" met het actieve profiel. Weigert als er al een schrijfopdracht loopt, tenzij die langer dan
 * tien minuten geleden begon (de job is dan vastgelopen).
 */
export async function startSchrijven(tx: Tx, tenantId: string, woningtekstId: string): Promise<boolean> {
  const profiel = await actiefSchrijfprofiel(tx, tenantId);
  if (!profiel) return false;
  const { rowCount } = await tx.query(
    `update intake_woningtekst set status = 'bezig', fout = null, profiel_id = $3, gewijzigd_op = now()
      where tenant_id = $1 and id = $2 and (status <> 'bezig' or gewijzigd_op < now() - interval '10 minutes')`,
    [tenantId, woningtekstId, profiel.id],
  );
  return rowCount === 1;
}

export async function zetWoningtekstMislukt(tx: Tx, tenantId: string, woningtekstId: string, fout: string): Promise<void> {
  await tx.query("update intake_woningtekst set status = 'mislukt', fout = $3, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, woningtekstId, fout]);
}

export interface Tekstversie {
  id: string;
  bron: "model" | "medewerker";
  profielId: string;
  inhoud: TekstInhoud;
  tekst: string;
  feiten: unknown;
  controles: Tekstcontrole[];
  model: string | null;
  promptVersie: string | null;
  promptHash: string | null;
  aangemaaktDoor: string | null;
  aangemaaktOp: string;
}

/** Voegt een versie toe en zet de tekst op "geschreven" (ook na goedkeuren: een nieuwe versie moet opnieuw goedgekeurd worden). */
export async function voegTekstversieToe(
  tx: Tx,
  tenantId: string,
  woningtekstId: string,
  v: Omit<Tekstversie, "id" | "aangemaaktOp" | "aangemaaktDoor">,
  gebruikerId: string | null,
): Promise<string> {
  const { rows } = await tx.query(
    `insert into intake_woningtekst_versie (tenant_id, woningtekst_id, bron, profiel_id, inhoud, tekst, feiten, controles, model, prompt_versie, prompt_hash, aangemaakt_door)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12) returning id`,
    [tenantId, woningtekstId, v.bron, v.profielId, JSON.stringify(v.inhoud), v.tekst, v.feiten === undefined ? null : JSON.stringify(v.feiten), JSON.stringify(v.controles), v.model, v.promptVersie, v.promptHash, gebruikerId],
  );
  await tx.query("update intake_woningtekst set status = 'geschreven', fout = null, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, woningtekstId]);
  return rows[0].id;
}

/** Versies van een tekst, nieuwste eerst. */
export async function tekstversies(tx: Tx, tenantId: string, woningtekstId: string): Promise<Tekstversie[]> {
  const { rows } = await tx.query(
    `select id, bron, profiel_id as "profielId", inhoud, tekst, feiten, controles, model, prompt_versie as "promptVersie", prompt_hash as "promptHash",
            aangemaakt_door as "aangemaaktDoor", aangemaakt_op as "aangemaaktOp"
       from intake_woningtekst_versie where tenant_id = $1 and woningtekst_id = $2 order by aangemaakt_op desc, id`,
    [tenantId, woningtekstId],
  );
  return rows;
}

/** Keurt een versie goed (elke medewerker mag dat, ADR-013). Weigert een versie van een andere tekst. */
export async function keurWoningtekstGoed(tx: Tx, tenantId: string, woningtekstId: string, versieId: string, gebruikerId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `update intake_woningtekst set status = 'goedgekeurd', goedgekeurde_versie_id = $3, goedgekeurd_door = $4, goedgekeurd_op = now(), gewijzigd_op = now()
      where tenant_id = $1 and id = $2
        and exists (select 1 from intake_woningtekst_versie v where v.tenant_id = $1 and v.id = $3 and v.woningtekst_id = $2)`,
    [tenantId, woningtekstId, versieId, gebruikerId],
  );
  return rowCount === 1;
}
