"use server";

// Schrijfprofiel en voorbeeldteksten beheren (ADR-016, stap B6). Alleen de kantoorbeheerder (ADR-006), alleen met de
// intake-module aan; elke actie controleert dat zelf. Alleen id's in de log, nooit profiel- of tekstinhoud.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { valideerSchrijfprofiel } from "@makelaarscockpit/ai";
import { activeerSchrijfprofiel, bewaarSchrijfprofiel, moduleAan, verwijderSchrijfvoorbeeld, voegSchrijfvoorbeeldToe, type Woningcategorie } from "@makelaarscockpit/db";
import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie } from "@/lib/inlog/sessie";

const PAD = "/instellingen/schrijfprofiel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROFIEL = 100_000;
const MAX_VOORBEELD = 20_000;
const CATEGORIEEN: readonly Woningcategorie[] = ["appartement", "eengezinswoning", "vrijstaand"];

/** Sessie van een kantoorbeheerder met de intake-module aan, of null. */
async function beheerder() {
  const sessie = await vereisSessie();
  if (!magKantoorBeheren(sessie.rol)) return null;
  return (await metHuidigeTenant((tx) => moduleAan(tx, sessie.tenantId, "intake"))) ? sessie : null;
}

export type ProfielStand = { fouten: string[]; tekst: string | null };

export async function profielOpslaan(_vorige: ProfielStand, formData: FormData): Promise<ProfielStand> {
  const sessie = await beheerder();
  if (!sessie) return { fouten: ["Alleen de kantoorbeheerder kan het schrijfprofiel aanpassen."], tekst: null };
  const tekst = String(formData.get("profiel") ?? "");
  const activeren = formData.get("activeren") === "ja";
  if (tekst.length > MAX_PROFIEL) return { fouten: ["Het profiel is te groot (meer dan 100.000 tekens)."], tekst };
  let json: unknown;
  try {
    json = JSON.parse(tekst);
  } catch (e) {
    return { fouten: [`Geen geldige JSON: ${e instanceof Error ? e.message : "onbekende fout"}`], tekst };
  }
  const uitkomst = valideerSchrijfprofiel(json);
  if (!uitkomst.geldig) return { fouten: uitkomst.fouten, tekst };
  const versie = await metHuidigeTenant((tx) => bewaarSchrijfprofiel(tx, sessie.tenantId, { naam: uitkomst.profiel.naam, profiel: uitkomst.profiel }, sessie.gebruikerId, activeren));
  console.log(`schrijfprofiel: versie ${versie.versie} (${versie.id}) opgeslagen${activeren ? " en actief" : ""} door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(PAD);
  redirect(`${PAD}?opgeslagen=${versie.versie}`);
}

export async function profielActiveren(id: string): Promise<void> {
  const sessie = await beheerder();
  if (!sessie || !UUID.test(id)) redirect(`${PAD}?fout=rechten`);
  const gelukt = await metHuidigeTenant((tx) => activeerSchrijfprofiel(tx, sessie.tenantId, id));
  if (!gelukt) redirect(`${PAD}?fout=onbekend`);
  console.log(`schrijfprofiel: ${id} actief gemaakt door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(PAD);
  redirect(`${PAD}?geactiveerd=1`);
}

export type VoorbeeldStand = { fouten: Record<string, string>; waarden: { titel: string; woningcategorie: string; tekst: string } | null };

export async function voorbeeldToevoegen(_vorige: VoorbeeldStand, formData: FormData): Promise<VoorbeeldStand> {
  const sessie = await beheerder();
  const waarden = { titel: String(formData.get("titel") ?? "").trim(), woningcategorie: String(formData.get("woningcategorie") ?? ""), tekst: String(formData.get("tekst") ?? "").trim() };
  if (!sessie) return { fouten: { algemeen: "Alleen de kantoorbeheerder kan voorbeeldteksten toevoegen." }, waarden };
  const fouten: Record<string, string> = {};
  if (waarden.titel === "" || waarden.titel.length > 120) fouten.titel = "Vul een titel in van hoogstens 120 tekens.";
  if (!CATEGORIEEN.includes(waarden.woningcategorie as Woningcategorie)) fouten.woningcategorie = "Kies een categorie.";
  if (waarden.tekst.length < 200) fouten.tekst = "Plak een volledige woningtekst (minstens 200 tekens).";
  if (waarden.tekst.length > MAX_VOORBEELD) fouten.tekst = "De tekst is te lang (meer dan 20.000 tekens).";
  if (Object.keys(fouten).length > 0) return { fouten, waarden };
  const id = await metHuidigeTenant((tx) => voegSchrijfvoorbeeldToe(tx, sessie.tenantId, { titel: waarden.titel, woningcategorie: waarden.woningcategorie as Woningcategorie, tekst: waarden.tekst }, sessie.gebruikerId));
  console.log(`schrijfprofiel: voorbeeldtekst ${id} toegevoegd door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(PAD);
  redirect(`${PAD}?voorbeeld=1#voorbeelden`);
}

export async function voorbeeldVerwijderen(id: string): Promise<void> {
  const sessie = await beheerder();
  if (!sessie || !UUID.test(id)) redirect(`${PAD}?fout=rechten`);
  await metHuidigeTenant((tx) => verwijderSchrijfvoorbeeld(tx, sessie.tenantId, id));
  console.log(`schrijfprofiel: voorbeeldtekst ${id} verwijderd door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(PAD);
  redirect(`${PAD}#voorbeelden`);
}
