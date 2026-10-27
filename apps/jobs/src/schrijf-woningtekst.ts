// Schrijft woningteksten van de queue intake-tekst (ADR-016). Eventgestuurde job; multi-tenant via het bericht.
import { DEPLOYMENT_MODEL } from "@makelaarscockpit/ai";
import { maakDb } from "@makelaarscockpit/db";
import { vraagGestructureerd } from "./intake/modellen";
import { leesTekstBericht, schrijfTekst, type Tekstdiensten } from "./intake/schrijf-tekst";
import { verwerkWachtrij } from "./wachtrij";

const diensten: Tekstdiensten = {
  schrijf: (berichten, schema) => vraagGestructureerd("tekst", berichten, schema, "woningtekst"),
  controleer: (berichten, schema) => vraagGestructureerd("controle", berichten, schema, "bronnencontrole"),
};

export async function schrijfWoningteksten(): Promise<void> {
  const db = maakDb();
  console.log(`tekst: schrijven gestart (model ${DEPLOYMENT_MODEL.tekst})`);
  try {
    const aantal = await verwerkWachtrij("intake-tekst", leesTekstBericht, (bericht, laatste) => schrijfTekst(db, diensten, bericht, laatste));
    console.log(`tekst: ${aantal} bericht(en) behandeld`);
  } finally {
    await db.end();
  }
}
