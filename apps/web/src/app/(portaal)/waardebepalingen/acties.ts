"use server";

// De uitkomst van een waardebepaling vastleggen (status, verloren aan, binnengehaald via). De actie controleert sessie en rol zelf.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bewaarWaardebepalingInvoer } from "@makelaarscockpit/db";
import { magFinancieelInvoeren, valideerWaardebepalingInvoer } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie } from "@/lib/inlog/sessie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function waardebepalingBijwerken(id: string, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  const terug = String(formData.get("terug") ?? "/waardebepalingen");
  const pad = terug.startsWith("/waardebepalingen") ? terug : "/waardebepalingen";
  if (!magFinancieelInvoeren(sessie.rol) || !UUID.test(id)) redirect(`${pad}${pad.includes("?") ? "&" : "?"}fout=rechten`);
  const uitkomst = valideerWaardebepalingInvoer({
    status: String(formData.get("status") ?? ""),
    verlorenAan: String(formData.get("verlorenAan") ?? ""),
    binnengehaaldVia: String(formData.get("binnengehaaldVia") ?? ""),
  });
  if (!uitkomst.ok) redirect(`${pad}${pad.includes("?") ? "&" : "?"}fout=status`);
  const gelukt = await metHuidigeTenant((tx) => bewaarWaardebepalingInvoer(tx, sessie.tenantId, id, uitkomst.waarde, sessie.gebruikerId));
  if (gelukt) console.log(`waardebepaling ${id} bijgewerkt door gebruiker ${sessie.gebruikerId}`);
  revalidatePath("/waardebepalingen");
  redirect(`${pad}${pad.includes("?") ? "&" : "?"}opgeslagen=1#wb-${id}`);
}
