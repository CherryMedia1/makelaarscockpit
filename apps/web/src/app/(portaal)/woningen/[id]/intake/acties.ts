"use server";

// Intake per woning (ADR-013): dossier openen, bestanden uploaden en de checklist opslaan. Elke medewerker mag dit;
// elke actie controleert zelf de sessie en of de module aan staat. Alleen id's in de log, nooit bestandsnamen of inhoud.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leesChecklistFormulier } from "@makelaarscockpit/ai";
import {
  checklistBron, intakeDossierVanWoning, moduleAan, openIntakeDossier, verwerkVeldvoorstellen, verwijderOpenWaardenVanBron, voegIntakeBronToe,
} from "@makelaarscockpit/db";
import { metHuidigeTenant } from "@/lib/gegevens";
import { azureIngesteld, bewaarIntakeBestand, meldIntakeBron } from "@/lib/intake";
import { UPLOAD_SOORTEN, controleerUpload, isUploadSoort } from "@/lib/intake-bestanden";
import { vereisSessie } from "@/lib/inlog/sessie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function intakeStarten(woningId: string): Promise<void> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId)) redirect("/woningen?fout=onbekend");
  const dossierId = await metHuidigeTenant(async (tx) => ((await moduleAan(tx, sessie.tenantId, "intake")) ? openIntakeDossier(tx, sessie.tenantId, woningId, sessie.gebruikerId) : null));
  if (!dossierId) redirect("/woningen?fout=onbekend");
  console.log(`intake: dossier ${dossierId} geopend voor woning ${woningId} door gebruiker ${sessie.gebruikerId}`);
  redirect(`/woningen/${woningId}/intake`);
}

export async function bestandUploaden(woningId: string, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  const pad = `/woningen/${woningId}/intake`;
  const fout = (melding: string): never => redirect(`${pad}?fout=${encodeURIComponent(melding)}`);
  if (!UUID.test(woningId)) redirect("/woningen?fout=onbekend");

  const soort = String(formData.get("soort") ?? "");
  const bestand = formData.get("bestand");
  if (!isUploadSoort(soort)) fout("Kies wat voor bestand het is.");
  if (!(bestand instanceof File) || bestand.size === 0) fout("Kies een bestand.");
  if (!azureIngesteld()) fout("De opslag is in deze omgeving niet ingesteld.");
  const s = soort as keyof typeof UPLOAD_SOORTEN;
  const b = bestand as File;
  const inhoud = new Uint8Array(await b.arrayBuffer());
  const ongeldig = controleerUpload(s, b.name, inhoud);
  if (ongeldig) fout(ongeldig);

  const bronId = crypto.randomUUID();
  const resultaat = await metHuidigeTenant(async (tx) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
    const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
    if (!dossier || dossier.status !== "open") return null;
    const blobPad = `${sessie.tenantId}/${dossier.id}/${bronId}.${UPLOAD_SOORTEN[s].extensie}`;
    // Eerst het bestand, dan de rij: mislukt de upload, dan blijft er geen bron zonder bestand achter.
    await bewaarIntakeBestand(blobPad, Buffer.from(inhoud), UPLOAD_SOORTEN[s].inhoudstype);
    await voegIntakeBronToe(tx, sessie.tenantId, { id: bronId, dossierId: dossier.id, type: s, bestandsnaam: b.name.slice(0, 200), inhoudstype: UPLOAD_SOORTEN[s].inhoudstype, blobPad, toegevoegdDoor: sessie.gebruikerId });
    return dossier.id;
  });
  if (!resultaat) redirect("/woningen?fout=onbekend");

  // Na de commit: de verwerkingsjob moet de bron kunnen lezen. Mislukt het bericht, dan blijft de bron op "nieuw" staan.
  let gemeld = true;
  try {
    await meldIntakeBron({ tenantId: sessie.tenantId, dossierId: resultaat, bronId });
  } catch (e) {
    gemeld = false;
    console.error(`intake: bron ${bronId} niet op de wachtrij gezet: ${e instanceof Error ? e.name : "onbekende fout"}`);
  }
  console.log(`intake: bron ${bronId} (${s}) toegevoegd aan dossier ${resultaat} door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(pad);
  redirect(`${pad}?${gemeld ? "geupload=1" : "wachtrij=0"}`);
}

/** `waarden` per veldnaam; meerkeuzevelden hebben meerdere waarden onder dezelfde naam. */
export type ChecklistStand = { fouten: Record<string, string>; waarden: Record<string, string[]> | null };

export async function checklistOpslaan(woningId: string, _vorige: ChecklistStand, formData: FormData): Promise<ChecklistStand> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId)) return { fouten: { algemeen: "Deze woning bestaat niet." }, waarden: null };
  const waarden: Record<string, string[]> = {};
  for (const [naam, v] of formData.entries()) if (typeof v === "string") (waarden[naam] ??= []).push(v);
  const { velden, fouten } = leesChecklistFormulier(formData.entries());
  if (fouten.length > 0) return { fouten: Object.fromEntries(fouten.map((f) => [f.pad, f.melding])), waarden };

  const telling = await metHuidigeTenant(async (tx) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
    const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
    if (!dossier || dossier.status !== "open") return null;
    const bron = await checklistBron(tx, sessie.tenantId, dossier.id, sessie.gebruikerId);
    const geleegd = await verwijderOpenWaardenVanBron(tx, sessie.tenantId, dossier.id, bron, velden.map((v) => v.pad));
    const uitkomst = await verwerkVeldvoorstellen(
      tx, sessie.tenantId, dossier.id, { id: bron, type: "checklist_form" },
      velden.map((v) => ({ ...v, bewijs: { citaat: null, tijdstempel: null, pagina: null }, zekerheid: 1 })),
    );
    return { dossier: dossier.id, geleegd, ...uitkomst };
  });
  if (!telling) return { fouten: { algemeen: "Er is geen open intakedossier voor deze woning." }, waarden };
  console.log(`intake: checklist dossier ${telling.dossier} door gebruiker ${sessie.gebruikerId}: ${telling.toevoegen} nieuw, ${telling.vervangen} gewijzigd, ${telling.markeerConflict} conflict, ${telling.geleegd} leeggemaakt`);
  revalidatePath(`/woningen/${woningId}/intake`);
  redirect(`/woningen/${woningId}/intake?checklist=1`);
}
