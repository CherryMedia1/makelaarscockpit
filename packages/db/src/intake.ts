// Intake-module (ADR-013, ADR-015). Altijd binnen metTenant, met filter op tenant_id. Alleen id's in logs.
import { voegSamen, type BestaandVeld, type Besluit, type Bron, type BronType } from "@makelaarscockpit/domain";
import type { Tx } from "./verbinding";

export type Module = "intake";
export type Verwerkstatus = "nieuw" | "bezig" | "verwerkt" | "mislukt" | "verwijderd";

export interface Bewijs {
  citaat: string | null;
  tijdstempel: string | null;
  pagina: number | null;
}

export interface IntakeVeld extends BestaandVeld {
  bewijs: Bewijs | null;
  zekerheid: number | null;
  bevestigdDoor: string | null;
  bevestigdOp: string | null;
}

export interface Veldvoorstel {
  pad: string;
  waarde: unknown;
  bewijs: Bewijs;
  zekerheid: number;
}

export async function moduleAan(tx: Tx, tenantId: string, module: Module): Promise<boolean> {
  const { rowCount } = await tx.query("select 1 from tenant_module where tenant_id = $1 and module = $2", [tenantId, module]);
  return rowCount === 1;
}

/** Opent het dossier van een woning op het bord, of geeft het bestaande. Een woning van een andere tenant bestaat hier niet. */
export async function openIntakeDossier(tx: Tx, tenantId: string, woningId: string, gebruikerId: string | null): Promise<string> {
  await tx.query(
    `insert into intake_dossier (tenant_id, woning_id, aangemaakt_door)
     select tenant_id, id, $3 from woning where tenant_id = $1 and id = $2
     on conflict (tenant_id, woning_id) do nothing`,
    [tenantId, woningId, gebruikerId],
  );
  const dossier = await intakeDossierVanWoning(tx, tenantId, woningId);
  if (!dossier) throw new Error(`woning ${woningId} niet gevonden`);
  return dossier.id;
}

export async function intakeDossierVanWoning(tx: Tx, tenantId: string, woningId: string): Promise<{ id: string; status: "open" | "opgeschoond" } | null> {
  const { rows } = await tx.query("select id, status from intake_dossier where tenant_id = $1 and woning_id = $2", [tenantId, woningId]);
  return rows[0] ?? null;
}

/** `id` mag vooraf gekozen zijn, zodat het blobpad het bron-id kan bevatten. */
export async function voegIntakeBronToe(
  tx: Tx,
  tenantId: string,
  bron: { id?: string; dossierId: string | null; type: BronType; externId?: string; bestandsnaam?: string; inhoudstype?: string; blobPad?: string; toegevoegdDoor?: string },
): Promise<string> {
  const { rows } = await tx.query(
    `insert into intake_bron (id, tenant_id, dossier_id, type, extern_id, bestandsnaam, inhoudstype, blob_pad, toegevoegd_door)
     values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [bron.id ?? null, tenantId, bron.dossierId, bron.type, bron.externId ?? null, bron.bestandsnaam ?? null, bron.inhoudstype ?? null, bron.blobPad ?? null, bron.toegevoegdDoor ?? null],
  );
  return rows[0].id;
}

/** De bron van het digitale checklistformulier: één per dossier, met het dossier-id als extern id. */
export async function checklistBron(tx: Tx, tenantId: string, dossierId: string, gebruikerId: string | null): Promise<string> {
  await tx.query(
    `insert into intake_bron (tenant_id, dossier_id, type, extern_id, verwerkstatus, toegevoegd_door)
     values ($1, $2, 'checklist_form', $3, 'verwerkt', $4)
     on conflict (tenant_id, type, extern_id) do nothing`,
    [tenantId, dossierId, dossierId, gebruikerId],
  );
  const { rows } = await tx.query("select id from intake_bron where tenant_id = $1 and type = 'checklist_form' and extern_id = $2", [tenantId, dossierId]);
  return rows[0].id;
}

/**
 * Verwijdert open waarden van een bron die bij een nieuwe invoer niet meer meekomen (een leeggemaakt veld in de checklist).
 * Bevestigde en afgewezen waarden blijven staan. Blijft er op een pad één conflict over, dan is het weer een voorstel.
 */
export async function verwijderOpenWaardenVanBron(tx: Tx, tenantId: string, dossierId: string, bronId: string, behoudenPaden: readonly string[]): Promise<number> {
  const { rows } = await tx.query(
    `delete from intake_veld
      where tenant_id = $1 and dossier_id = $2 and bron_id = $3 and status in ('voorstel', 'conflict') and not (pad = any($4::text[]))
      returning pad`,
    [tenantId, dossierId, bronId, behoudenPaden],
  );
  if (rows.length > 0) {
    await tx.query(
      `update intake_veld v set status = 'voorstel', gewijzigd_op = now()
        where v.tenant_id = $1 and v.dossier_id = $2 and v.pad = any($3::text[]) and v.status = 'conflict'
          and (select count(*) from intake_veld w where w.tenant_id = $1 and w.dossier_id = $2 and w.pad = v.pad and w.status in ('voorstel', 'conflict', 'bevestigd')) = 1`,
      [tenantId, dossierId, rows.map((r) => r.pad)],
    );
  }
  return rows.length;
}

export interface IntakeBron {
  id: string;
  type: BronType;
  bestandsnaam: string | null;
  verwerkstatus: Verwerkstatus;
  ontvangenOp: string;
}

/** Bronnen van een dossier, nieuwste eerst; het checklistformulier telt niet als bestand. */
export async function intakeBronnen(tx: Tx, tenantId: string, dossierId: string): Promise<IntakeBron[]> {
  const { rows } = await tx.query(
    `select id, type, bestandsnaam, verwerkstatus, ontvangen_op as "ontvangenOp"
       from intake_bron where tenant_id = $1 and dossier_id = $2 and type <> 'checklist_form'
      order by ontvangen_op desc`,
    [tenantId, dossierId],
  );
  return rows;
}

/** `fout` is een technische melding of foutcode, nooit inhoud uit de bron. */
export async function zetIntakeBronStatus(tx: Tx, tenantId: string, bronId: string, status: Verwerkstatus, fout: string | null = null): Promise<void> {
  await tx.query(
    `update intake_bron set verwerkstatus = $3, verwerkfout = $4, verwerkt_op = case when $3 in ('verwerkt', 'mislukt') then now() else verwerkt_op end
      where tenant_id = $1 and id = $2`,
    [tenantId, bronId, status, fout],
  );
}

export async function intakeVelden(tx: Tx, tenantId: string, dossierId: string): Promise<IntakeVeld[]> {
  const { rows } = await tx.query(
    `select v.id, v.pad, v.waarde, v.status, v.bron_id as "bronId", b.type as "bronType", v.bewijs, v.zekerheid::float as zekerheid,
            v.bevestigd_door as "bevestigdDoor", v.bevestigd_op as "bevestigdOp"
       from intake_veld v
       left join intake_bron b on b.tenant_id = v.tenant_id and b.id = v.bron_id
      where v.tenant_id = $1 and v.dossier_id = $2
      order by v.pad, v.aangemaakt_op`,
    [tenantId, dossierId],
  );
  return rows;
}

/**
 * Verwerkt de voorstellen van één bron met de samenvoegregels uit packages/domain. Het dossier wordt vergrendeld,
 * zodat twee bronnen van hetzelfde dossier niet tegelijk samenvoegen.
 */
export async function verwerkVeldvoorstellen(tx: Tx, tenantId: string, dossierId: string, bron: Bron, voorstellen: readonly Veldvoorstel[]): Promise<Record<Besluit<Veldvoorstel>["soort"], number>> {
  await tx.query("select 1 from intake_dossier where tenant_id = $1 and id = $2 for update", [tenantId, dossierId]);
  const besluiten = voegSamen(await intakeVelden(tx, tenantId, dossierId), bron, voorstellen);
  const telling = { toevoegen: 0, vervangen: 0, markeerConflict: 0, overslaan: 0 };
  for (const b of besluiten) {
    telling[b.soort] += 1;
    if (b.soort === "toevoegen") {
      await tx.query(
        `insert into intake_veld (tenant_id, dossier_id, pad, waarde, bron_id, bewijs, zekerheid, status)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8)`,
        [tenantId, dossierId, b.veld.pad, JSON.stringify(b.veld.waarde), bron.id, JSON.stringify(b.veld.bewijs), b.veld.zekerheid, b.status],
      );
    } else if (b.soort === "vervangen") {
      await tx.query(
        `update intake_veld set waarde = $4::jsonb, bron_id = $5, bewijs = $6::jsonb, zekerheid = $7, gewijzigd_door = null, gewijzigd_op = now()
          where tenant_id = $1 and dossier_id = $2 and id = $3`,
        [tenantId, dossierId, b.id, JSON.stringify(b.veld.waarde), bron.id, JSON.stringify(b.veld.bewijs), b.veld.zekerheid],
      );
    } else if (b.soort === "markeerConflict") {
      await tx.query("update intake_veld set status = 'conflict', gewijzigd_op = now() where tenant_id = $1 and dossier_id = $2 and id = $3", [tenantId, dossierId, b.id]);
    }
  }
  return telling;
}

export type Beoordeling = { soort: "bevestigen" } | { soort: "corrigeren"; waarde: unknown } | { soort: "afwijzen" };

/**
 * Een medewerker beoordeelt een veld (elke medewerker mag dat, ADR-013). Bevestigen of corrigeren wijst de andere waarden
 * op hetzelfde pad af, zodat er één bevestigde waarde is. Een correctie is een nieuwe handmatige waarde zonder bron.
 * De waarde van een correctie moet vooraf tegen het woningprofiel-schema gevalideerd zijn.
 */
export async function beoordeelIntakeVeld(tx: Tx, tenantId: string, veldId: string, gebruikerId: string, beoordeling: Beoordeling): Promise<void> {
  const { rows } = await tx.query("select dossier_id, pad from intake_veld where tenant_id = $1 and id = $2", [tenantId, veldId]);
  if (rows.length !== 1) throw new Error(`veld ${veldId} niet gevonden`);
  const { dossier_id: dossierId, pad } = rows[0];
  await tx.query("select 1 from intake_dossier where tenant_id = $1 and id = $2 for update", [tenantId, dossierId]);

  if (beoordeling.soort === "afwijzen") {
    await tx.query("update intake_veld set status = 'afgewezen', gewijzigd_door = $3, gewijzigd_op = now() where tenant_id = $1 and id = $2", [tenantId, veldId, gebruikerId]);
    // Blijft er van een conflict één open waarde over, dan is het geen conflict meer.
    await tx.query(
      `update intake_veld set status = 'voorstel', gewijzigd_op = now()
        where tenant_id = $1 and dossier_id = $2 and pad = $3 and status = 'conflict'
          and (select count(*) from intake_veld w where w.tenant_id = $1 and w.dossier_id = $2 and w.pad = $3 and w.status in ('voorstel', 'conflict', 'bevestigd')) = 1`,
      [tenantId, dossierId, pad],
    );
    return;
  }

  const behouden = beoordeling.soort === "bevestigen" ? veldId : null;
  await tx.query(
    `update intake_veld set status = 'afgewezen', gewijzigd_door = $5, gewijzigd_op = now()
      where tenant_id = $1 and dossier_id = $2 and pad = $3 and status <> 'afgewezen' and id is distinct from $4`,
    [tenantId, dossierId, pad, behouden, gebruikerId],
  );
  if (beoordeling.soort === "bevestigen") {
    await tx.query(
      `update intake_veld set status = 'bevestigd', bevestigd_door = $3, bevestigd_op = now(), gewijzigd_door = $3, gewijzigd_op = now()
        where tenant_id = $1 and id = $2`,
      [tenantId, veldId, gebruikerId],
    );
  } else {
    await tx.query(
      `insert into intake_veld (tenant_id, dossier_id, pad, waarde, status, bevestigd_door, bevestigd_op, gewijzigd_door)
       values ($1, $2, $3, $4::jsonb, 'bevestigd', $5, now(), $5)`,
      [tenantId, dossierId, pad, JSON.stringify(beoordeling.waarde), gebruikerId],
    );
  }
}

export async function registreerIntakeVerbruik(
  tx: Tx,
  tenantId: string,
  v: { dossierId: string | null; stap: string; model: string; inputTokens: number; outputTokens: number; kostenEur: number },
): Promise<void> {
  await tx.query(
    `insert into intake_verbruik (tenant_id, dossier_id, stap, model, input_tokens, output_tokens, kosten_eur)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, v.dossierId, v.stap, v.model, v.inputTokens, v.outputTokens, v.kostenEur],
  );
}
