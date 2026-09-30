import { NextResponse, type NextRequest } from "next/server";
import { registreerInlog, zoekGebruikerOpEmail } from "@makelaarscockpit/db";
import { beoordeelInlog, type GebruikerVoorInlog } from "@makelaarscockpit/domain";
import { db } from "@/lib/gegevens-basis";
import { rondMicrosoftInlogAf } from "@/lib/inlog/microsoft";
import { startSessie, vandaagInNederland } from "@/lib/inlog/sessie";

export async function GET(request: NextRequest) {
  const basis = process.env.PORTAAL_URL ?? "http://localhost:3000";
  const weiger = (reden: string) => {
    // Alleen de reden loggen, geen adres of naam.
    console.log(`Microsoft-inlog geweigerd: ${reden}`);
    return NextResponse.redirect(`${basis}/inloggen?melding=geen-toegang`);
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return weiger(request.nextUrl.searchParams.get("error") ?? "geen code");

  let identiteit;
  try {
    identiteit = await rondMicrosoftInlogAf(code, state);
  } catch (fout) {
    return weiger(fout instanceof Error ? fout.message : "onbekende fout");
  }

  let gebruiker: GebruikerVoorInlog | null = null;
  for (const email of identiteit.emails) {
    gebruiker = await zoekGebruikerOpEmail(db(), email);
    if (gebruiker) break;
  }
  const oordeel = beoordeelInlog(gebruiker, { methode: "microsoft", microsoftTenantId: identiteit.microsoftTenantId }, vandaagInNederland());
  if (!gebruiker || !oordeel.toegestaan) return weiger(oordeel.toegestaan ? "onbekend" : oordeel.reden);

  await startSessie(gebruiker);
  await registreerInlog(db(), gebruiker);
  console.log(`ingelogd via Microsoft: gebruiker ${gebruiker.id}`);
  return NextResponse.redirect(`${basis}/`);
}
