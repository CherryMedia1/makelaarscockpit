// Verwerkt berichten van de queue intake-verwerking (ADR-013): elke bron wordt tekst, velden met bewijs, samengevoegd
// in het woningprofiel. Multi-tenant: de tenant komt uit het bericht, niet uit de omgeving.
import { DEPLOYMENT_MODEL } from "@makelaarscockpit/ai";
import { maakDb } from "@makelaarscockpit/db";
import { leesBlob } from "./azure";
import { pdfAlsTekst, vraagGestructureerd } from "./intake/modellen";
import { leesBericht, verwerkBron, type Diensten } from "./intake/verwerk-bron";
import { verwerkWachtrij } from "./wachtrij";

const diensten: Diensten = {
  leesBlob,
  pdfAlsTekst,
  extraheer: (berichten, schema) => vraagGestructureerd("extractie", berichten, schema, "woningprofiel"),
};

export async function verwerkIntake(): Promise<void> {
  const db = maakDb();
  console.log(`intake: verwerking gestart (model ${DEPLOYMENT_MODEL.extractie})`);
  try {
    const aantal = await verwerkWachtrij("intake-verwerking", leesBericht, (bericht, laatste) => verwerkBron(db, diensten, bericht, laatste));
    console.log(`intake: ${aantal} bericht(en) behandeld`);
  } finally {
    await db.end();
  }
}
