// De laatste versie van de woningtekst als .txt (ADR-016, punt 9: publiceren als tekst). Alleen voor een ingelogde
// medewerker van het kantoor; nooit gecachet. De bestandsnaam bevat geen adres.
import { haalWoningtekst } from "@/lib/woningtekst";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Niet gevonden", { status: 404 });
  const pagina = await haalWoningtekst(id);
  if (!pagina?.laatste) return new Response("Niet gevonden", { status: 404 });
  // Windows-regeleinden, zodat Kladblok en Word de alinea's goed tonen.
  return new Response(pagina.laatste.tekst.replace(/\r?\n/g, "\r\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="woningtekst-${pagina.laatste.id.slice(0, 8)}.txt"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
