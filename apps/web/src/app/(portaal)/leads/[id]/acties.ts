"use server";

// De lead-kaart (issue #54, ADR-020): een bezichtiger in een fase zetten, eigenaar en notitie vastleggen, of hem uit de
// pijplijn halen. Elke medewerker van het kantoor mag dit; de tenant komt uit de sessie. Alleen id's in de log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bewaarLead, leesLeadKaart, leesMedewerkerKeuzes, leesPijplijnFases, moduleAan, verwijderLead } from "@makelaarscockpit/db";
import { valideerLeadInvoer } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function leadOpslaan(bezichtigerId: string, formData: FormData): Promise<void> {
  if (!UUID.test(bezichtigerId)) redirect("/leads");
  const pad = `/leads/${bezichtigerId}`;
  const uitkomst = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return "fout=onbekend";
    const kaart = await leesLeadKaart(tx, sessie.tenantId, bezichtigerId);
    if (!kaart) return "fout=onbekend";
    const oordeel = valideerLeadInvoer(
      { faseId: String(formData.get("fase") ?? ""), eigenaarId: String(formData.get("eigenaar") ?? ""), notitie: String(formData.get("notitie") ?? "") },
      await leesPijplijnFases(tx, sessie.tenantId),
      (await leesMedewerkerKeuzes(tx, sessie.tenantId)).map((m) => m.id),
      kaart.lead?.faseId ?? null,
    );
    if (!oordeel.ok) return `fout=${oordeel.fout}`;
    const lead = await bewaarLead(tx, sessie.tenantId, bezichtigerId, oordeel.waarde, sessie.gebruikerId);
    if (!lead) return "fout=onbekend";
    console.log(`lead ${lead.leadId} bijgewerkt door gebruiker ${sessie.gebruikerId}${lead.faseGewijzigd ? ` (fase ${oordeel.waarde.faseId})` : ""}`);
    return "opgeslagen=1";
  });
  revalidatePath("/leads");
  redirect(`${pad}?${uitkomst}`);
}

export async function leadUitPijplijn(bezichtigerId: string): Promise<void> {
  if (!UUID.test(bezichtigerId)) redirect("/leads");
  const gelukt = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return false;
    const weg = await verwijderLead(tx, sessie.tenantId, bezichtigerId);
    if (weg) console.log(`lead van bezichtiger ${bezichtigerId} uit de pijplijn gehaald door gebruiker ${sessie.gebruikerId}`);
    return weg;
  });
  revalidatePath("/leads");
  redirect(`/leads/${bezichtigerId}?${gelukt ? "verwijderd=1" : "fout=onbekend"}`);
}
