// Gedeelde lus voor eventgestuurde jobs op een Service Bus-queue (ADR-013, ADR-016): KEDA start een uitvoering zodra er
// berichten staan; die verwerkt ze één voor één tot de queue leeg is of het maximum bereikt is. Een tijdelijke fout
// laat het bericht terugvallen in de queue; een ongeldig bericht gaat naar de dead-letter-queue.
import { ServiceBusClient, type ServiceBusReceivedMessage, type ServiceBusReceiver } from "@azure/service-bus";
import { credential, omgeving } from "./azure";

/** Gelijk aan maxDeliveryCount van de queues in servicebus.bicep. */
const MAX_BEZORGINGEN = 5;
const MAX_PER_UITVOERING = 20;

export type Uitkomst = "verwerkt" | "overgeslagen" | "opnieuw" | "mislukt";

/** Houdt het slot op het bericht vast zolang de verwerking duurt (langer dan de lock van 5 minuten kan voorkomen). */
function houdVast(ontvanger: ServiceBusReceiver, bericht: ServiceBusReceivedMessage): () => void {
  const timer = setInterval(() => {
    ontvanger.renewMessageLock(bericht).catch(() => console.warn(`wachtrij: slot op bericht ${bericht.messageId ?? "?"} niet verlengd`));
  }, 120_000);
  return () => clearInterval(timer);
}

export async function verwerkWachtrij<B>(queue: string, lees: (body: unknown) => B | null, verwerk: (bericht: B, laatstePoging: boolean) => Promise<Uitkomst>): Promise<number> {
  const bus = new ServiceBusClient(omgeving("SERVICEBUS_NAMESPACE"), credential);
  const ontvanger = bus.createReceiver(queue);
  let aantal = 0;
  try {
    while (aantal < MAX_PER_UITVOERING) {
      const [bericht] = await ontvanger.receiveMessages(1, { maxWaitTimeInMs: 5_000 });
      if (!bericht) break;
      aantal += 1;
      const inhoud = lees(bericht.body);
      if (inhoud === null) {
        await ontvanger.deadLetterMessage(bericht, { deadLetterReason: "ongeldig-bericht", deadLetterErrorDescription: "bericht voldoet niet aan het verwachte formaat" });
        console.error(`${queue}: bericht ${bericht.messageId ?? "?"} ongeldig, naar de dead-letter-queue`);
        continue;
      }
      const loslaten = houdVast(ontvanger, bericht);
      try {
        const uitkomst = await verwerk(inhoud, (bericht.deliveryCount ?? 1) >= MAX_BEZORGINGEN);
        if (uitkomst === "opnieuw") await ontvanger.abandonMessage(bericht);
        else await ontvanger.completeMessage(bericht);
      } finally {
        loslaten();
      }
    }
  } finally {
    await ontvanger.close();
    await bus.close();
  }
  return aantal;
}
