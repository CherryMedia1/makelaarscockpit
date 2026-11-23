"use server";

// Synchroniseren op verzoek (issue #51): legt de aanvraag vast en zet een bericht met alleen id's in de wachtrij.
// De tenant komt uit de sessie. De actie controleert sessie en module zelf.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moduleAan, trekBezichtigerSyncIn, vraagBezichtigerSyncAan } from "@makelaarscockpit/db";
import { heeftDatabase, metHuidigeTenant } from "@/lib/gegevens";
import { meldBezichtigerSync } from "@/lib/intake";

export async function leadsSynchroniseren(): Promise<void> {
  if (!heeftDatabase()) redirect("/leads?sync=mislukt");
  const uitkomst = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "bezichtigers"))) return { soort: "geen-module" as const };
    const aanvraag = await vraagBezichtigerSyncAan(tx, sessie.tenantId, sessie.gebruikerId);
    return "id" in aanvraag ? { soort: "aangevraagd" as const, id: aanvraag.id, tenantId: sessie.tenantId, gebruikerId: sessie.gebruikerId } : { soort: aanvraag.reden };
  });
  if (uitkomst.soort !== "aangevraagd") redirect(uitkomst.soort === "geen-module" ? "/leads" : `/leads?sync=${uitkomst.soort}`);
  try {
    await meldBezichtigerSync({ tenantId: uitkomst.tenantId, syncId: uitkomst.id });
  } catch (fout) {
    // Zonder bericht komt er geen run: de aanvraag gaat weg, zodat de knop niet een half uur geblokkeerd blijft.
    console.error(`leads synchroniseren: aanvraag ${uitkomst.id} niet in de wachtrij gezet: ${fout instanceof Error ? fout.message : String(fout)}`);
    await metHuidigeTenant((tx, sessie) => trekBezichtigerSyncIn(tx, sessie.tenantId, uitkomst.id));
    redirect("/leads?sync=mislukt");
  }
  console.log(`leads synchroniseren: aanvraag ${uitkomst.id} door gebruiker ${uitkomst.gebruikerId}`);
  revalidatePath("/leads");
  redirect("/leads?sync=gestart");
}
