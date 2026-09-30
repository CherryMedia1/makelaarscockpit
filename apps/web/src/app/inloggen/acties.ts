"use server";

import { redirect } from "next/navigation";
import { registreerInlog, verbruikInlogToken, zoekGebruikerOpId } from "@makelaarscockpit/db";
import { beoordeelInlog, normaliseerEmail } from "@makelaarscockpit/domain";
import { db } from "@/lib/gegevens-basis";
import { hashToken, vraagInloglinkAan } from "@/lib/inlog/inloglink";
import { startSessie, stopSessie, vandaagInNederland } from "@/lib/inlog/sessie";

export async function inloglinkAanvragen(formData: FormData): Promise<void> {
  const email = normaliseerEmail(String(formData.get("email") ?? ""));
  if (!email) redirect("/inloggen?melding=ongeldig-adres");
  let gelukt = true;
  try {
    await vraagInloglinkAan(email);
  } catch (fout) {
    gelukt = false;
    console.error(`inloglink aanvragen mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
  }
  // Altijd dezelfde bevestiging bij een geldig adres, zodat niet af te leiden is welke adressen bekend zijn.
  redirect(gelukt ? "/inloggen/verstuurd" : "/inloggen?melding=storing");
}

export async function inloglinkBevestigen(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const gebruikerId = token ? await verbruikInlogToken(db(), hashToken(token)) : null;
  if (!gebruikerId) redirect("/inloggen?melding=link-ongeldig");
  const gebruiker = await zoekGebruikerOpId(db(), gebruikerId);
  const oordeel = beoordeelInlog(gebruiker, { methode: "email" }, vandaagInNederland());
  if (!gebruiker || !oordeel.toegestaan) redirect("/inloggen?melding=geen-toegang");
  await startSessie(gebruiker);
  await registreerInlog(db(), gebruiker);
  console.log(`ingelogd via e-maillink: gebruiker ${gebruiker.id}`);
  redirect("/");
}

export async function uitloggen(): Promise<void> {
  await stopSessie();
  redirect("/inloggen?melding=uitgelogd");
}
