import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Columns3 } from "lucide-react";
import { bouwBord, type BordKaart, type FaseSoort } from "@makelaarscockpit/domain";
import { Label, LegeStaat, Melding, PaginaKop } from "@/components/basis";
import { FaseKiezer } from "@/components/fase-kiezer";
import { LeadTabs } from "@/components/lead-tabs";
import { aantal, datum } from "@/lib/format";
import { haalLeadOverzicht } from "@/lib/leads";
import { leadFaseZetten } from "./acties";

export const metadata: Metadata = { title: "Pijplijnbord" };

const FASE_STIJL: Record<FaseSoort, "info" | "succes" | "neutraal"> = { open: "info", gewonnen: "succes", verloren: "neutraal" };

async function laad() {
  try {
    return await haalLeadOverzicht();
  } catch (fout) {
    console.error(`pijplijnbord laden mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    return null;
  }
}

/** Het pijplijnbord (ADR-020): de leads van het kantoor in een kolom per fase. */
export default async function Pijplijnbord({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  await connection();
  const [d, zoek] = await Promise.all([laad(), searchParams]);
  if (!d || !d.moduleAan) {
    return (
      <>
        <PaginaKop titel="Pijplijnbord" />
        <Melding {...(d ? {} : { soort: "fout" as const })} titel={d ? "Deze module staat niet aan" : "We konden het bord niet ophalen"}>
          {d ? "De module Bezichtigersleads staat niet aan voor dit kantoor." : "Probeer het over een paar minuten opnieuw. Blijft dit zo, neem dan contact op met de beheerder van MakelaarsCockpit."}
        </Melding>
      </>
    );
  }
  const bord = bouwBord(d.fases, d.standen, d.leads);
  const kiesbaar = d.fases.filter((f) => f.actief);
  const totaal = d.standen.length;

  return (
    <>
      <PaginaKop titel="Pijplijnbord" toelichting={`${aantal(totaal)} ${totaal === 1 ? "lead" : "leads"} in de pijplijn. Zet een bezichtiger in de pijplijn vanaf zijn lead-kaart in het overzicht.`}>
        <LeadTabs actief="bord" />
      </PaginaKop>

      {zoek.fout && (
        <Melding soort="fout" titel="Verplaatsen is niet gelukt">
          De lead of de fase bestaat niet meer. Ververs de pagina en probeer het opnieuw.
        </Melding>
      )}

      {bord.length === 0 ? (
        <LegeStaat icoon={Columns3} titel="Nog geen fases">
          De kantoorbeheerder legt de fases van de pijplijn vast onder Instellingen, Pijplijn.
        </LegeStaat>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
          <div className="flex min-w-max items-start gap-4">
            {bord.map((kolom) => (
              <section key={kolom.fase.id} aria-label={kolom.fase.naam} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3">
                <header className="flex items-center justify-between gap-2">
                  <h2 className="text-label">{kolom.fase.naam}</h2>
                  <Label soort={kolom.fase.actief ? FASE_STIJL[kolom.fase.soort] : "neutraal"}>{aantal(kolom.kaarten.length)}</Label>
                </header>
                {!kolom.fase.actief && <p className="text-caption text-text-muted">Deze fase is uitgezet; verplaats de leads naar een andere fase.</p>}
                {kolom.kaarten.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-body-sm text-text-muted">Geen leads</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {kolom.kaarten.map((k) => (
                      <Kaartje key={k.bezichtigerId} kaart={k} faseId={kolom.fase.id} fases={kolom.fase.actief ? kiesbaar : [kolom.fase, ...kiesbaar]} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Kaartje({ kaart, faseId, fases }: { kaart: BordKaart; faseId: string; fases: readonly { id: string; naam: string }[] }) {
  const naam = kaart.naam ?? (kaart.naamGezocht ? "Naam onbekend in Realworks" : "Naam nog niet opgehaald");
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <Link href={`/leads/${kaart.bezichtigerId}`} className="text-label text-primary hover:underline">{naam}</Link>
      <p className="text-body-sm text-text-muted">
        {kaart.laatsteBezichtiging ? (
          <>
            {datum(new Date(`${kaart.laatsteBezichtiging.slice(0, 10)}T00:00:00`))} · {kaart.woning ?? "woning onbekend"}
            {kaart.aantalBezichtigingen > 1 && <> · {aantal(kaart.aantalBezichtigingen)} bezichtigingen</>}
          </>
        ) : (
          "Geen bezichtiging in de laatste zes maanden"
        )}
      </p>
      <p className="text-caption text-text-muted">{kaart.eigenaar ? `Eigenaar: ${kaart.eigenaar}` : "Geen eigenaar"}</p>
      <FaseKiezer actie={leadFaseZetten.bind(null, kaart.bezichtigerId)} faseId={faseId} fases={fases.map((f) => ({ id: f.id, naam: f.naam }))} naam={naam} />
    </li>
  );
}
