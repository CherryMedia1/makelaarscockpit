"use server";

// Server actions voor de invoer per verkoop. Elke actie controleert zelf de sessie en de rol: een action is ook
// rechtstreeks via POST te bereiken. Er worden alleen id's gelogd.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bewaarVerkoopInvoer, maakHandmatigeVerkoop, verwijderKostenregel, voegKostenregelToe } from "@makelaarscockpit/db";
import {
  magFinancieelInvoeren, valideerKostenregelInvoer, valideerVerkoopInvoer,
  type KostenregelFouten, type RuweKostenregelInvoer, type RuweVerkoopInvoer, type VerkoopInvoerFouten,
} from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie } from "@/lib/inlog/sessie";

export type FormulierStand = { fouten: VerkoopInvoerFouten & { algemeen?: string }; waarden: RuweVerkoopInvoer | null };
export type KostenStand = { fouten: KostenregelFouten & { algemeen?: string }; waarden: RuweKostenregelInvoer | null; toegevoegd: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tekst = (formData: FormData, naam: string) => String(formData.get(naam) ?? "");

/** Leest het formulier; de verdeling staat als verdeling.0.medewerkerId, verdeling.0.aandeel, enzovoort. */
function leesFormulier(formData: FormData): RuweVerkoopInvoer {
  const rijen = new Map<number, { medewerkerId: string; makelaar: string; aandeel: string }>();
  for (const [sleutel, waarde] of formData.entries()) {
    const m = /^verdeling\.(\d+)\.(medewerkerId|makelaar|aandeel)$/.exec(sleutel);
    if (!m) continue;
    const i = Number(m[1]);
    const rij = rijen.get(i) ?? { medewerkerId: "", makelaar: "", aandeel: "" };
    rij[m[2] as "medewerkerId" | "makelaar" | "aandeel"] = String(waarde);
    rijen.set(i, rij);
  }
  return {
    soort: tekst(formData, "soort"),
    adres: tekst(formData, "adres"),
    verkoopdatum: tekst(formData, "verkoopdatum"),
    passeerdatum: tekst(formData, "passeerdatum"),
    omzetMaand: tekst(formData, "omzetMaand"),
    verkoopprijs: tekst(formData, "verkoopprijs"),
    courtageSoort: tekst(formData, "courtageSoort"),
    courtagePercentage: tekst(formData, "courtagePercentage"),
    courtageBedrag: tekst(formData, "courtageBedrag"),
    opstartnota: tekst(formData, "opstartnota"),
    notaVerstuurd: formData.get("notaVerstuurd") === "on",
    verdeling: [...rijen.entries()].sort(([a], [b]) => a - b).map(([, rij]) => rij),
  };
}

function naVerandering(id?: string): void {
  revalidatePath("/verkoop");
  revalidatePath("/verkoop/verkopen");
  if (id) revalidatePath(`/verkoop/verkopen/${id}`);
}

export async function verkoopOpslaan(id: string, _vorige: FormulierStand, formData: FormData): Promise<FormulierStand> {
  const sessie = await vereisSessie();
  if (!magFinancieelInvoeren(sessie.rol)) return { fouten: { algemeen: "Je hebt geen rechten om dit in te vullen." }, waarden: null };
  if (!UUID.test(id)) return { fouten: { algemeen: "Deze verkoop bestaat niet." }, waarden: null };
  const waarden = leesFormulier(formData);
  const uitkomst = valideerVerkoopInvoer(waarden);
  if (!uitkomst.ok) return { fouten: uitkomst.fouten, waarden };
  const gelukt = await metHuidigeTenant((tx) => bewaarVerkoopInvoer(tx, sessie.tenantId, id, uitkomst.waarde, sessie.gebruikerId));
  if (!gelukt) return { fouten: { algemeen: "Deze verkoop bestaat niet meer." }, waarden };
  console.log(`verkoop ${id} bijgewerkt door gebruiker ${sessie.gebruikerId}`);
  naVerandering(id);
  redirect(`/verkoop/verkopen/${id}?opgeslagen=1`);
}

export async function verkoopToevoegen(_vorige: FormulierStand, formData: FormData): Promise<FormulierStand> {
  const sessie = await vereisSessie();
  if (!magFinancieelInvoeren(sessie.rol)) return { fouten: { algemeen: "Je hebt geen rechten om dit in te vullen." }, waarden: null };
  const waarden = leesFormulier(formData);
  const uitkomst = valideerVerkoopInvoer(waarden);
  if (!uitkomst.ok) return { fouten: uitkomst.fouten, waarden };
  const id = await metHuidigeTenant((tx) => maakHandmatigeVerkoop(tx, sessie.tenantId, uitkomst.waarde, sessie.gebruikerId));
  console.log(`verkoop ${id} handmatig toegevoegd door gebruiker ${sessie.gebruikerId}`);
  naVerandering(id);
  redirect(`/verkoop/verkopen/${id}?opgeslagen=1`);
}

export async function kostenregelToevoegen(verkoopId: string, vorige: KostenStand, formData: FormData): Promise<KostenStand> {
  const sessie = await vereisSessie();
  if (!magFinancieelInvoeren(sessie.rol)) return { ...vorige, fouten: { algemeen: "Je hebt geen rechten om kosten in te vullen." }, waarden: null };
  if (!UUID.test(verkoopId)) return { ...vorige, fouten: { algemeen: "Deze verkoop bestaat niet." }, waarden: null };
  const waarden: RuweKostenregelInvoer = {
    soort: tekst(formData, "soort"), leverancier: tekst(formData, "leverancier"), omschrijving: tekst(formData, "omschrijving"),
    bedrag: tekst(formData, "bedrag"), datum: tekst(formData, "datum"),
  };
  const uitkomst = valideerKostenregelInvoer(waarden);
  if (!uitkomst.ok) return { ...vorige, fouten: uitkomst.fouten, waarden };
  const gelukt = await metHuidigeTenant((tx) => voegKostenregelToe(tx, sessie.tenantId, verkoopId, uitkomst.waarde, sessie.gebruikerId));
  if (!gelukt) return { ...vorige, fouten: { algemeen: "Deze verkoop bestaat niet meer." }, waarden };
  console.log(`kostenregel toegevoegd aan verkoop ${verkoopId} door gebruiker ${sessie.gebruikerId}`);
  naVerandering(verkoopId);
  // Leeg formulier na een geslaagde toevoeging; de teller zorgt dat React de velden opnieuw opbouwt.
  return { fouten: {}, waarden: null, toegevoegd: vorige.toegevoegd + 1 };
}

export async function kostenregelVerwijderen(verkoopId: string, kostenregelId: string): Promise<void> {
  const sessie = await vereisSessie();
  if (!magFinancieelInvoeren(sessie.rol) || !UUID.test(verkoopId) || !UUID.test(kostenregelId)) return;
  const gelukt = await metHuidigeTenant((tx) => verwijderKostenregel(tx, sessie.tenantId, verkoopId, kostenregelId));
  if (gelukt) console.log(`kostenregel ${kostenregelId} verwijderd door gebruiker ${sessie.gebruikerId}`);
  naVerandering(verkoopId);
}
