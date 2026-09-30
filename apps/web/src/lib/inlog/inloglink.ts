// Inloglink per e-mail: een eenmalig token van 15 minuten; alleen de hash staat in de database (ADR-009).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { bewaarInlogToken, telRecenteInlogTokens, zoekGebruikerOpEmail } from "@makelaarscockpit/db";
import { beoordeelInlog } from "@makelaarscockpit/domain";
import { db } from "../gegevens-basis";
import { vandaagInNederland } from "./sessie";

const GELDIG_MINUTEN = 15;
const MAX_PER_KWARTIER = 5;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function verstuur(aan: string, link: string): Promise<void> {
  const endpoint = process.env.ACS_ENDPOINT;
  const afzender = process.env.MAIL_AFZENDER;
  if (!endpoint || !afzender) {
    // Alleen bij lokaal ontwikkelen en testen: geen e-maildienst, dus de link in de serverlog. Nooit aanzetten in Azure.
    if (process.env.INLOGLINK_NAAR_LOG !== "1") throw new Error("e-maildienst niet ingesteld");
    console.log(`inloglink (lokaal, niet verstuurd): ${link}`);
    return;
  }
  const { EmailClient } = await import("@azure/communication-email");
  const { DefaultAzureCredential } = await import("@azure/identity");
  const clientId = process.env.AZURE_CLIENT_ID;
  const client = new EmailClient(endpoint, new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : {}));
  const poller = await client.beginSend({
    senderAddress: afzender,
    recipients: { to: [{ address: aan }] },
    content: {
      subject: "Je inloglink voor MakelaarsCockpit",
      plainText: `Je hebt een inloglink aangevraagd voor MakelaarsCockpit.\n\nOpen deze link om in te loggen (${GELDIG_MINUTEN} minuten geldig, één keer te gebruiken):\n${link}\n\nHeb je dit niet aangevraagd? Dan hoef je niets te doen.`,
      html: `<div style="font-family:Figtree,Arial,sans-serif;color:#14202B;background:#F5F0E8;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E7DDD0;border-radius:16px;padding:32px">
    <p style="font-size:20px;font-weight:600;margin:0 0 12px">Inloggen bij MakelaarsCockpit</p>
    <p style="margin:0 0 24px;line-height:24px">Je hebt een inloglink aangevraagd. De link is ${GELDIG_MINUTEN} minuten geldig en werkt één keer.</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1E4D57;color:#FFFFFF;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:10px">Inloggen</a></p>
    <p style="margin:0;color:#5E6770;font-size:14px;line-height:20px">Heb je dit niet aangevraagd? Dan hoef je niets te doen.</p>
  </div>
</div>`,
    },
  });
  await poller.pollUntilDone();
}

/**
 * Maakt en verstuurt een inloglink als het adres bij een gebruiker met toegang hoort. De aanroeper toont altijd dezelfde
 * melding, zodat niet af te leiden is welke adressen bekend zijn.
 */
export async function vraagInloglinkAan(email: string): Promise<void> {
  const gebruiker = await zoekGebruikerOpEmail(db(), email);
  const oordeel = beoordeelInlog(gebruiker, { methode: "email" }, vandaagInNederland());
  if (!gebruiker || !oordeel.toegestaan) {
    console.log(`inloglink niet verstuurd: ${oordeel.toegestaan ? "onbekend" : oordeel.reden}`);
    return;
  }
  if ((await telRecenteInlogTokens(db(), gebruiker, 15)) >= MAX_PER_KWARTIER) {
    console.log(`inloglink niet verstuurd: te veel aanvragen voor gebruiker ${gebruiker.id}`);
    return;
  }
  const token = randomBytes(32).toString("base64url");
  await bewaarInlogToken(db(), gebruiker, hashToken(token), GELDIG_MINUTEN);
  const basis = process.env.PORTAAL_URL ?? "http://localhost:3000";
  await verstuur(gebruiker.email, `${basis}/inloggen/bevestig?token=${token}`);
  console.log(`inloglink verstuurd voor gebruiker ${gebruiker.id}`);
}
