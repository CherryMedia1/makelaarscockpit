// Verwerkt berichten van de queue intake-verwerking (ADR-013). Draait als eventgestuurde Container Apps-job: KEDA start
// een uitvoering zodra er berichten staan; die verwerkt ze één voor één tot de queue leeg is of het maximum bereikt is.
// Multi-tenant: de tenant komt uit het bericht, niet uit de omgeving.
import { ServiceBusClient, type ServiceBusReceivedMessage, type ServiceBusReceiver } from "@azure/service-bus";
import { DEPLOYMENT_MODEL } from "@makelaarscockpit/ai";
import { maakDb } from "@makelaarscockpit/db";
import { credential, leesBlob, omgeving } from "./azure";
import { pdfAlsTekst, vraagGestructureerd } from "./intake/modellen";
import { leesBericht, verwerkBron, type Diensten } from "./intake/verwerk-bron";

const QUEUE = "intake-verwerking";
/** Gelijk aan maxDeliveryCount van de queue in servicebus.bicep. */
const MAX_BEZORGINGEN = 5;
const MAX_PER_UITVOERING = 20;

const diensten: Diensten = {
  leesBlob,
  pdfAlsTekst,
  extraheer: (berichten, schema) => vraagGestructureerd("extractie", berichten, schema, "woningprofiel"),
};

/** Houdt het slot op het bericht vast zolang de verwerking duurt (een PDF plus extractie kan langer duren dan de lock van 5 minuten). */
function houdVast(ontvanger: ServiceBusReceiver, bericht: ServiceBusReceivedMessage): () => void {
  const timer = setInterval(() => {
    ontvanger.renewMessageLock(bericht).catch(() => console.warn(`intake: slot op bericht ${bericht.messageId ?? "?"} niet verlengd`));
  }, 120_000);
  return () => clearInterval(timer);
}

export async function verwerkIntake(): Promise<void> {
  const db = maakDb();
  const bus = new ServiceBusClient(omgeving("SERVICEBUS_NAMESPACE"), credential);
  const ontvanger = bus.createReceiver(QUEUE);
  let aantal = 0;
  console.log(`intake: verwerking gestart (model ${DEPLOYMENT_MODEL.extractie})`);
  try {
    while (aantal < MAX_PER_UITVOERING) {
      const [bericht] = await ontvanger.receiveMessages(1, { maxWaitTimeInMs: 5_000 });
      if (!bericht) break;
      aantal += 1;
      const inhoud = leesBericht(bericht.body);
      if (!inhoud) {
        await ontvanger.deadLetterMessage(bericht, { deadLetterReason: "ongeldig-bericht", deadLetterErrorDescription: "verwacht precies tenantId, dossierId en bronId" });
        console.error(`intake: bericht ${bericht.messageId ?? "?"} ongeldig, naar de dead-letter-queue`);
        continue;
      }
      const loslaten = houdVast(ontvanger, bericht);
      try {
        const uitkomst = await verwerkBron(db, diensten, inhoud, (bericht.deliveryCount ?? 1) >= MAX_BEZORGINGEN);
        if (uitkomst === "opnieuw") await ontvanger.abandonMessage(bericht);
        else await ontvanger.completeMessage(bericht);
      } finally {
        loslaten();
      }
    }
  } finally {
    await ontvanger.close();
    await bus.close();
    await db.end();
  }
  console.log(`intake: ${aantal} bericht(en) behandeld`);
}
