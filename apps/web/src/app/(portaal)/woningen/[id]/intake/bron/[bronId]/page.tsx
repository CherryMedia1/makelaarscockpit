import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, FileText } from "lucide-react";
import { Kaart, PaginaKop, knopKlassen } from "@/components/basis";
import { leesIntakeBestand, tijdAnker } from "@/lib/intake";
import { BRON_LABEL } from "@/lib/intake-bestanden";

export const metadata: Metadata = { title: "Bron" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Een regel uit een Plaud-export begint met een tijdstempel tussen blokhaken, bijv. "[00:01:05] Verkoper: ...".
const REGEL = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

/** Weergave van een bron, zodat een medewerker een citaat in zijn context kan nalezen (stap A8). */
export default async function Bron({ params }: { params: Promise<{ id: string; bronId: string }> }) {
  await connection();
  const { id, bronId } = await params;
  if (!UUID.test(id) || !UUID.test(bronId)) notFound();
  const bestand = await leesIntakeBestand(id, bronId);
  if (!bestand) notFound();

  const terug = (
    <Link href={`/woningen/${id}/intake/profiel`} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
      <ArrowLeft aria-hidden size={16} strokeWidth={2} />
      Terug naar het woningprofiel
    </Link>
  );

  if (bestand.type !== "plaud_transcript") {
    return (
      <>
        {terug}
        <PaginaKop titel={BRON_LABEL[bestand.type]} toelichting={bestand.bestandsnaam ?? undefined} />
        <Kaart>
          <a href={`/woningen/${id}/intake/bron/${bronId}/bestand`} target="_blank" rel="noopener" className={knopKlassen("secundair")}>
            <FileText aria-hidden size={18} strokeWidth={2} />
            PDF openen
          </a>
        </Kaart>
      </>
    );
  }

  const regels = bestand.inhoud.toString("utf8").split(/\r?\n/).filter((r) => r.trim() !== "");
  return (
    <>
      {terug}
      <PaginaKop titel="Transcript" toelichting={bestand.bestandsnaam ?? undefined} />
      <Kaart>
        <ol className="-mx-6 -my-6">
          {regels.map((regel, i) => {
            const m = REGEL.exec(regel);
            return (
              <li key={i} id={m ? tijdAnker(m[1]!) : undefined} className="flex scroll-mt-24 gap-4 px-6 py-2 text-body-sm target:bg-accent-subtle">
                <span className="w-20 shrink-0 tabular-nums text-text-muted">{m?.[1] ?? ""}</span>
                <span>{m ? m[2] : regel}</span>
              </li>
            );
          })}
        </ol>
      </Kaart>
    </>
  );
}
