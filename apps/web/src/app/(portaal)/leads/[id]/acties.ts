"use server";

// De lead-kaart (issue #54, ADR-020): een bezichtiger in een fase zetten, eigenaar en notitie vastleggen, of hem uit de
// pijplijn halen. Elke medewerker van het kantoor mag dit; de tenant komt uit de sessie. Alleen id's in de log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bewaarLead, bewaarLeadLinks, leesLeadKaart, leesMedewerkerKeuzes, leesPijplijnFases, moduleAan, verwijderLead } from "@makelaarscockpit/db";
import { valideerLeadInvoer, valideerLeadLinks } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { meldLeadContact } from "@/lib/intake";

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
    return lead.nieuw ? { nieuw: { tenantId: sessie.tenantId, leadId: lead.leadId } } : "opgeslagen=1";
  });
  revalidatePath("/leads");
  if (typeof uitkomst === "string") redirect(`${pad}?${uitkomst}`);
  // Een nieuwe lead: de job haalt de contactgegevens uit Realworks. Lukt het versturen niet, dan volgen ze bij de
  // eerstvolgende synchronisatie; de lead zelf is al opgeslagen.
  try {
    await meldLeadContact(uitkomst.nieuw);
  } catch (fout) {
    console.error(`lead ${uitkomst.nieuw.leadId}: verzoek om contactgegevens niet verstuurd: ${fout instanceof Error ? fout.message : String(fout)}`);
  }
  redirect(`${pad}?opgeslagen=1`);
}

/** De links naar social media die een medewerker zelf invult. */
export async function leadLinksOpslaan(bezichtigerId: string, formData: FormData): Promise<void> {
  if (!UUID.test(bezichtigerId)) redirect("/leads");
  const oordeel = valideerLeadLinks({ linkedin: String(formData.get("linkedin") ?? ""), facebook: String(formData.get("facebook") ?? ""), instagram: String(formData.get("instagram") ?? "") });
  const uitkomst = !oordeel.ok
    ? `fout=link-${oordeel.fout}`
    : await metHuidigeTenant(async (tx, sessie) => {
        if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers")) || !(await bewaarLeadLinks(tx, sessie.tenantId, bezichtigerId, oordeel.waarde))) return "fout=onbekend";
        console.log(`links van de lead van bezichtiger ${bezichtigerId} bijgewerkt door gebruiker ${sessie.gebruikerId}`);
        return "opgeslagen=1";
      });
  revalidatePath(`/leads/${bezichtigerId}`);
  redirect(`/leads/${bezichtigerId}?${uitkomst}`);
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
