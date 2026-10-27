// Het originele bestand van een intakebron (PDF of transcript), voor de bronlink in het woningprofiel (stap A8).
// Alleen voor een ingelogde medewerker van het kantoor, alleen als de bron bij deze woning hoort; nooit gecachet.
import { leesIntakeBestand } from "@/lib/intake";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; bronId: string }> }): Promise<Response> {
  const { id, bronId } = await params;
  if (!UUID.test(id) || !UUID.test(bronId)) return new Response("Niet gevonden", { status: 404 });
  const bestand = await leesIntakeBestand(id, bronId);
  if (!bestand) return new Response("Niet gevonden", { status: 404 });
  return new Response(new Uint8Array(bestand.inhoud), {
    headers: {
      "content-type": bestand.inhoudstype,
      // De naam staat niet in de header: die kan een adres bevatten en komt dan in logs van proxy's terecht.
      "content-disposition": `inline; filename="bron-${bronId}.${bestand.inhoudstype.startsWith("application/pdf") ? "pdf" : "txt"}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
