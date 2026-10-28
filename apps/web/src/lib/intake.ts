// Gegevens en Azure-opslag voor de intake-module (ADR-013). Alleen op de server, binnen de tenant van de sessie.
// Bestanden gaan naar Blob-container `intake` onder {tenant}/{dossier}/; een bericht met alleen id's gaat naar de queue.
import "server-only";
import { connection } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import { BlobServiceClient } from "@azure/storage-blob";
import { intakeBronnen, intakeDossierVanWoning, intakeVelden, leesIntakeBron, leesWoningen, moduleAan, type IntakeBron, type IntakeVeld } from "@makelaarscockpit/db";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";
import { vandaagInNederland } from "./woningen";

export type { IntakeBron, IntakeVeld };

export type IntakeOverzicht = {
  woning: { id: string; adres: string | null; plaats: string | null };
  dossier: { id: string; status: "open" | "opgeschoond" } | null;
  bronnen: (IntakeBron & { opnieuwMogelijk: boolean })[];
  velden: IntakeVeld[];
};

/** Een bron die zo lang op "nieuw" staat, is waarschijnlijk niet in de wachtrij gekomen. */
const HANGT_NA_MS = 10 * 60 * 1000;

/** Het intakedossier van een woning, of null als de woning niet bestaat of de module voor dit kantoor niet aan staat. */
export async function haalIntake(woningId: string): Promise<IntakeOverzicht | null> {
  await connection();
  if (!heeftDatabase()) return null;
  return metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
    const woning = (await leesWoningen(tx, sessie.tenantId, "verkoop", vandaagInNederland(), woningId))[0];
    if (!woning) return null;
    const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
    return {
      woning: { id: woning.id, adres: woning.adres, plaats: woning.plaats },
      dossier,
      bronnen: (dossier ? await intakeBronnen(tx, sessie.tenantId, dossier.id) : []).map((b) => ({
        ...b,
        opnieuwMogelijk: b.verwerkstatus === "mislukt" || (b.verwerkstatus === "nieuw" && Date.now() - new Date(b.ontvangenOp).getTime() > HANGT_NA_MS),
      })),
      velden: dossier ? await intakeVelden(tx, sessie.tenantId, dossier.id) : [],
    };
  });
}

export async function intakeModuleAan(): Promise<boolean> {
  if (!heeftDatabase()) return false;
  return metHuidigeTenant((tx, sessie) => moduleAan(tx, sessie.tenantId, "intake"));
}

const globaal = globalThis as unknown as { intakeAzure?: { blob: BlobServiceClient; bus: ServiceBusClient } };

/** Storage en Service Bus met de managed identity; null als de omgeving ze niet kent (lokaal zonder Azure). */
function azure(): { blob: BlobServiceClient; bus: ServiceBusClient } | null {
  const account = process.env.STORAGE_ACCOUNT;
  const namespace = process.env.SERVICEBUS_NAMESPACE;
  if (!account || !namespace) return null;
  if (!globaal.intakeAzure) {
    const clientId = process.env.AZURE_CLIENT_ID;
    const credential = new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : {});
    globaal.intakeAzure = {
      blob: new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential),
      bus: new ServiceBusClient(namespace, credential),
    };
  }
  return globaal.intakeAzure;
}

export const azureIngesteld = () => azure() !== null;

export async function bewaarIntakeBestand(blobPad: string, inhoud: Buffer, inhoudstype: string): Promise<void> {
  const clients = azure();
  if (!clients) throw new Error("opslag niet ingesteld");
  await clients.blob.getContainerClient("intake").getBlockBlobClient(blobPad).uploadData(inhoud, { blobHTTPHeaders: { blobContentType: inhoudstype } });
}

/**
 * Het bestand van een bron, alleen als die bij het intakedossier van deze woning hoort en nog niet is opgeschoond.
 * `null` als dat niet zo is; de aanroeper toont dan "niet gevonden".
 */
export async function leesIntakeBestand(woningId: string, bronId: string): Promise<{ type: IntakeBron["type"]; bestandsnaam: string | null; inhoudstype: string; inhoud: Buffer } | null> {
  if (!heeftDatabase()) return null;
  const bron = await metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
    const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
    const b = await leesIntakeBron(tx, sessie.tenantId, bronId);
    if (!dossier || !b || b.dossierId !== dossier.id || !b.blobPad || b.verwerkstatus === "verwijderd") return null;
    const meta = (await intakeBronnen(tx, sessie.tenantId, dossier.id)).find((x) => x.id === bronId);
    return { type: b.type, blobPad: b.blobPad, bestandsnaam: meta?.bestandsnaam ?? null };
  });
  const clients = azure();
  if (!bron || !clients) return null;
  const inhoud = await clients.blob.getContainerClient("intake").getBlobClient(bron.blobPad).downloadToBuffer();
  const inhoudstype = bron.type === "plaud_transcript" ? "text/plain; charset=utf-8" : "application/pdf";
  return { type: bron.type, bestandsnaam: bron.bestandsnaam, inhoudstype, inhoud };
}

/** Anker van een tijdstempel in de transcriptweergave, bijv. "00:01:05" → "t-00-01-05". */
export const tijdAnker = (tijdstempel: string) => `t-${tijdstempel.replace(/[^0-9]+/g, "-")}`;

/** Zet een bron in de wachtrij voor verwerking (stap A7). Het bericht bevat alleen id's. */
export async function meldIntakeBron(bericht: { tenantId: string; dossierId: string; bronId: string }): Promise<void> {
  const clients = azure();
  if (!clients) throw new Error("wachtrij niet ingesteld");
  const afzender = clients.bus.createSender("intake-verwerking");
  try {
    await afzender.sendMessages({ body: bericht, messageId: bericht.bronId, contentType: "application/json" });
  } finally {
    await afzender.close();
  }
}

/** Zet een schrijfopdracht voor een woningtekst in de wachtrij (ADR-016). Het bericht bevat alleen id's en eventueel een sectiesleutel. */
export async function meldWoningtekst(bericht: { tenantId: string; woningtekstId: string; sectie: string | null }): Promise<void> {
  const clients = azure();
  if (!clients) throw new Error("wachtrij niet ingesteld");
  const afzender = clients.bus.createSender("intake-tekst");
  try {
    await afzender.sendMessages({ body: bericht, messageId: crypto.randomUUID(), contentType: "application/json" });
  } finally {
    await afzender.close();
  }
}
