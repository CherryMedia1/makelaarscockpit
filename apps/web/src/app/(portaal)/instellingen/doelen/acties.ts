"use server";

// Maanddoelstellingen voor de omzet (excl. btw). Alleen de kantoorbeheerder (ADR-006); de actie controleert dat zelf.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { zetOmzetdoelen } from "@makelaarscockpit/db";
import { magKantoorBeheren, valideerDoelenInvoer } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie } from "@/lib/inlog/sessie";

export type DoelenStand = { fouten: Record<string, string>; maanden: string[] | null };

export async function doelenOpslaan(jaar: number, _vorige: DoelenStand, formData: FormData): Promise<DoelenStand> {
  const sessie = await vereisSessie();
  if (!magKantoorBeheren(sessie.rol)) return { fouten: { algemeen: "Alleen de kantoorbeheerder kan doelstellingen aanpassen." }, maanden: null };
  const maanden = Array.from({ length: 12 }, (_, i) => String(formData.get(`maand-${i + 1}`) ?? ""));
  const uitkomst = valideerDoelenInvoer({ jaar: String(jaar), maanden });
  if (!uitkomst.ok) return { fouten: uitkomst.fouten, maanden };
  await metHuidigeTenant((tx) => zetOmzetdoelen(tx, sessie.tenantId, uitkomst.waarde));
  console.log(`doelstellingen ${jaar} bijgewerkt door gebruiker ${sessie.gebruikerId}`);
  revalidatePath("/verkoop");
  revalidatePath("/instellingen/doelen");
  redirect(`/instellingen/doelen?jaar=${jaar}&opgeslagen=1`);
}
