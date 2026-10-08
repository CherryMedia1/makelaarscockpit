"use server";

// Stappen en backoffice per woning. Elke actie controleert zelf de sessie en de rol; alleen id's in de log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bewaarWoningStap, leesWoningen, zetBackoffice } from "@makelaarscockpit/db";
import { magFinancieelInvoeren, valideerStapInvoer } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie } from "@/lib/inlog/sessie";
import { vandaagInNederland } from "@/lib/woningen";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function stapBijwerken(woningId: string, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  const pad = `/woningen/${woningId}`;
  if (!magFinancieelInvoeren(sessie.rol) || !UUID.test(woningId)) redirect("/woningen?fout=rechten");
  const uitkomst = valideerStapInvoer("verkoop", { stap: String(formData.get("stap") ?? ""), status: String(formData.get("status") ?? ""), datum: String(formData.get("datum") ?? "") });
  if (!uitkomst.ok) redirect(`${pad}?fout=${encodeURIComponent(uitkomst.fout)}`);
  const resultaat = await metHuidigeTenant(async (tx) => {
    // Realworks is leidend: een stap die Realworks al als klaar ziet, is niet met de hand te wijzigen.
    const woning = (await leesWoningen(tx, sessie.tenantId, "verkoop", vandaagInNederland(), woningId))[0];
    if (!woning) return "onbekend";
    const huidig = woning.stappen.find((s) => s.sleutel === uitkomst.waarde.stap);
    if (huidig?.status === "klaar" && huidig.bron === "realworks") return "realworks";
    await bewaarWoningStap(tx, sessie.tenantId, woningId, uitkomst.waarde, sessie.gebruikerId);
    return "ok";
  });
  if (resultaat === "onbekend") redirect("/woningen?fout=onbekend");
  if (resultaat === "realworks") redirect(`${pad}?fout=${encodeURIComponent("Deze stap staat in Realworks al op klaar.")}`);
  console.log(`woning ${woningId}: stap ${uitkomst.waarde.stap} bijgewerkt door gebruiker ${sessie.gebruikerId}`);
  revalidatePath("/woningen");
  redirect(`${pad}?opgeslagen=1#stap-${uitkomst.waarde.stap}`);
}

export async function backofficeBijwerken(woningId: string, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  if (!magFinancieelInvoeren(sessie.rol) || !UUID.test(woningId)) redirect("/woningen?fout=rechten");
  const medewerkerId = String(formData.get("backoffice") ?? "");
  const gelukt = await metHuidigeTenant((tx) => zetBackoffice(tx, sessie.tenantId, woningId, UUID.test(medewerkerId) ? medewerkerId : null));
  if (!gelukt) redirect("/woningen?fout=onbekend");
  console.log(`woning ${woningId}: backoffice bijgewerkt door gebruiker ${sessie.gebruikerId}`);
  revalidatePath("/woningen");
  redirect(`/woningen/${woningId}?opgeslagen=1`);
}
