"use server";

// Een lead vanaf het pijplijnbord in een andere fase zetten (issue #54, ADR-020). Elke medewerker van het kantoor mag
// dit; de tenant komt uit de sessie. Alleen id's in de log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leesPijplijnFases, moduleAan, zetLeadFase } from "@makelaarscockpit/db";
import { metHuidigeTenant } from "@/lib/gegevens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function leadFaseZetten(bezichtigerId: string, formData: FormData): Promise<void> {
  const faseId = String(formData.get("fase") ?? "");
  const gelukt =
    UUID.test(bezichtigerId) &&
    UUID.test(faseId) &&
    (await metHuidigeTenant(async (tx, sessie) => {
      if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return false;
      // Alleen een fase van dit kantoor die aan staat.
      if (!(await leesPijplijnFases(tx, sessie.tenantId)).some((f) => f.id === faseId && f.actief)) return false;
      const lead = await zetLeadFase(tx, sessie.tenantId, bezichtigerId, faseId, sessie.gebruikerId);
      if (lead?.faseGewijzigd) console.log(`lead ${lead.leadId} naar fase ${faseId} door gebruiker ${sessie.gebruikerId}`);
      return lead !== null;
    }));
  revalidatePath("/leads");
  redirect(gelukt ? "/leads/pijplijn" : "/leads/pijplijn?fout=1");
}
