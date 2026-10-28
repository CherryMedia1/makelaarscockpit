import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Download, PenLine, RefreshCw, TriangleAlert } from "lucide-react";
import type { Tekstcontrole } from "@makelaarscockpit/domain";
import { Kaart, Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Invoer, Keuze, Tekstvak, Veld } from "@/components/formulier";
import { datum } from "@/lib/format";
import { haalWoningtekst } from "@/lib/woningtekst";
import { sectieOpnieuw, steekwoordenOpslaan, tekstGoedkeuren, versieOpslaan } from "./acties";
import { KopieerKnop, Verversen } from "./klein";

export const metadata: Metadata = { title: "Woningtekst" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = {
  concept: { label: "Nog niet geschreven", soort: "neutraal" },
  bezig: { label: "Wordt geschreven", soort: "info" },
  geschreven: { label: "Te controleren", soort: "info" },
  mislukt: { label: "Mislukt", soort: "fout" },
  goedgekeurd: { label: "Goedgekeurd", soort: "succes" },
} as const;

const CATEGORIE = { appartement: "Appartement", eengezinswoning: "Eengezinswoning", vrijstaand: "Vrijstaand / villa" } as const;

function Controles({ lijst }: { lijst: Tekstcontrole[] }) {
  if (lijst.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {lijst.map((c, i) => (
        <li key={i} className="flex items-start gap-1.5 text-body-sm text-waarschuwing-fg">
          <TriangleAlert aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          {c.melding}
        </li>
      ))}
    </ul>
  );
}

type Zoek = { opgeslagen?: string; geschreven?: string; bewaard?: string; goedgekeurd?: string; fout?: string };

/** De woningtekst van een woning (ADR-016, stap B5): steekwoorden, schrijven, bewerken, goedkeuren en kopiëren. */
export default async function Woningtekst({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Zoek> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [pagina, zoek] = await Promise.all([haalWoningtekst(id), searchParams]);
  if (!pagina) notFound();
  const { woning, profiel, tekst, laatste, feiten } = pagina;
  const status = tekst?.status ?? "concept";
  const bezig = status === "bezig";
  const bewerkbaar = pagina.dossierOpen && !bezig;
  const algemeen = (laatste?.controles ?? []).filter((c) => !c.sectie);
  const perSectie = (sectie: string) => (laatste?.controles ?? []).filter((c) => c.sectie === sectie);
  const kopVan = (sleutel: string) => profiel?.inhoud.structuur.secties.find((s) => s.sleutel === sleutel);

  return (
    <>
      {bezig && <Verversen />}
      <Link href={`/woningen/${id}/intake`} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Terug naar de intake
      </Link>
      <PaginaKop titel="Woningtekst" toelichting={[woning.adres, woning.plaats].filter(Boolean).join(", ")}>
        <Label soort={STATUS[status].soort}>{STATUS[status].label}</Label>
      </PaginaKop>

      {zoek.fout && (
        <Melding soort="fout" titel="Niet gelukt">
          {zoek.fout}
        </Melding>
      )}
      {zoek.opgeslagen && <Melding titel="Opgeslagen">De steekwoorden zijn bewaard.</Melding>}
      {zoek.bewaard && <Melding titel="Opgeslagen">Je aanpassingen staan als nieuwe versie klaar om goed te keuren.</Melding>}
      {zoek.goedgekeurd && <Melding titel="Goedgekeurd">De tekst is goedgekeurd en klaar om te kopiëren.</Melding>}
      {bezig && <Melding titel="De tekst wordt geschreven">Dit duurt meestal 30 tot 90 seconden. De pagina ververst vanzelf.</Melding>}
      {status === "mislukt" && (
        <Melding soort="fout" titel="Schrijven is niet gelukt">
          Probeer het opnieuw met de knop Tekst schrijven{tekst?.fout ? ` (foutcode ${tekst.fout})` : ""}.
        </Melding>
      )}
      {!profiel && (
        <Melding titel="Nog geen schrijfprofiel">
          Zonder schrijfprofiel kan er geen tekst worden geschreven.{" "}
          {pagina.beheerder ? <Link href="/instellingen/schrijfprofiel" className="underline">Stel het profiel in.</Link> : "De kantoorbeheerder stelt het in."}
        </Melding>
      )}
      {pagina.teBeoordelen > 0 && (
        <Melding titel={`${pagina.teBeoordelen} ${pagina.teBeoordelen === 1 ? "veld" : "velden"} nog te beoordelen`}>
          Alleen bevestigde velden uit het woningprofiel gaan mee naar de tekst. <Link href={`/woningen/${id}/intake/profiel`} className="underline">Profiel beoordelen</Link>
        </Melding>
      )}
      {feiten && feiten.weggelaten.length > 0 && (
        <Melding titel="Persoonsgegevens worden weggelaten">
          In de steekwoorden staan {feiten.weggelaten.length === 1 ? "een e-mailadres of telefoonnummer" : `${feiten.weggelaten.length} e-mailadressen of telefoonnummers`}; die gaan niet mee naar het model.
        </Melding>
      )}

      {profiel && feiten && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Kaart titel="Steekwoorden" toelichting="Per onderdeel in een paar woorden wat opvalt. Namen van bewoners horen hier niet.">
            <form action={steekwoordenOpslaan.bind(null, id, false)} className="flex flex-col gap-4">
              {[...profiel.inhoud.vragenlijst].sort((a, b) => a.volgorde - b.volgorde).map((v) => (
                <Veld key={v.sleutel} id={`vraag-${v.sleutel}`} label={`${v.label}${v.verplicht ? " *" : ""}`}>
                  <Tekstvak id={`vraag-${v.sleutel}`} name={`vraag-${v.sleutel}`} placeholder={v.hint} defaultValue={tekst?.steekwoorden[v.sleutel] ?? ""} rows={2} disabled={!bewerkbaar} />
                </Veld>
              ))}
              <Veld id="woningcategorie" label="Woningcategorie" hint={`Bepaalt de lengte. Zonder keuze: ${CATEGORIE[feiten.woningcategorie].toLowerCase()} (uit het woningprofiel).`}>
                <Keuze id="woningcategorie" name="woningcategorie" defaultValue={tekst?.woningcategorie ?? ""} disabled={!bewerkbaar}>
                  <option value="">Uit het woningprofiel</option>
                  {Object.entries(CATEGORIE).map(([w, l]) => (
                    <option key={w} value={w}>{l}</option>
                  ))}
                </Keuze>
              </Veld>
              {bewerkbaar && (
                <div className="flex flex-wrap gap-3">
                  <button type="submit" formAction={steekwoordenOpslaan.bind(null, id, true)} className={knopKlassen("primair")}>
                    <PenLine aria-hidden size={18} strokeWidth={2} />
                    {laatste ? "Opnieuw schrijven" : "Tekst schrijven"}
                  </button>
                  <button type="submit" className={knopKlassen("ghost")}>Alleen opslaan</button>
                </div>
              )}
            </form>
          </Kaart>

          <Kaart titel="Feiten uit het woningprofiel" toelichting="Deze bevestigde gegevens gaan mee naar de tekst.">
            <dl className="flex flex-col gap-1 text-body-sm">
              {[["Adres", feiten.adres], ["Plaats", feiten.plaats], ["Energielabel", feiten.energielabel]].filter(([, w]) => w).map(([l, w]) => (
                <div key={l} className="flex gap-2"><dt className="text-text-muted">{l}:</dt><dd>{w}</dd></div>
              ))}
            </dl>
            {feiten.bevestigd.length === 0 ? (
              <p className="mt-3 text-body-sm text-text-muted">Nog geen bevestigde velden; de tekst steunt dan alleen op de steekwoorden.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1 text-body-sm">
                {feiten.bevestigd.map((b) => (
                  <li key={b.label}><span className="text-text-muted">{b.label}:</span> {b.waarde}</li>
                ))}
              </ul>
            )}
          </Kaart>
        </div>
      )}

      {laatste && (
        <section id="tekst" className="scroll-mt-24">
          <Kaart titel="Tekst" toelichting="Pas aan waar nodig en sla op als nieuwe versie. Waarschuwingen komen uit de controles; ze blokkeren niet.">
            <Controles lijst={algemeen} />
            <form action={versieOpslaan.bind(null, id)} className="mt-4 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Veld id="inleiding" label="Inleiding">
                  <Tekstvak id="inleiding" name="inleiding" defaultValue={laatste.inhoud.inleiding} rows={5} disabled={!bewerkbaar} />
                </Veld>
                <Controles lijst={perSectie("inleiding")} />
                {bewerkbaar && (
                  <button type="submit" formAction={sectieOpnieuw.bind(null, id, "inleiding")} className={`${knopKlassen("ghost")} w-fit`}>
                    <RefreshCw aria-hidden size={16} strokeWidth={2} />
                    Inleiding opnieuw schrijven
                  </button>
                )}
              </div>
              {laatste.inhoud.secties.map((s, i) => (
                <fieldset key={s.sectie} className="flex flex-col gap-2 border-t border-border pt-4">
                  <legend className="sr-only">{kopVan(s.sectie)?.standaardkop || s.kop}</legend>
                  <input type="hidden" name="sectie" value={s.sectie} />
                  <Veld id={`kop-${i}`} label="Kop">
                    <Invoer id={`kop-${i}`} name="kop" defaultValue={s.kop} disabled={!bewerkbaar} />
                  </Veld>
                  <Veld id={`tekst-${i}`} label="Tekst" hint="Maak de tekst leeg om deze sectie te schrappen.">
                    <Tekstvak id={`tekst-${i}`} name="tekst" defaultValue={s.tekst} rows={6} disabled={!bewerkbaar} />
                  </Veld>
                  <Controles lijst={perSectie(s.sectie)} />
                  {bewerkbaar && (
                    <button type="submit" formAction={sectieOpnieuw.bind(null, id, s.sectie)} className={`${knopKlassen("ghost")} w-fit`}>
                      <RefreshCw aria-hidden size={16} strokeWidth={2} />
                      Deze sectie opnieuw schrijven
                    </button>
                  )}
                </fieldset>
              ))}
              {bewerkbaar && (
                <button type="submit" className={`${knopKlassen("secundair")} w-fit`}>Opslaan als nieuwe versie</button>
              )}
            </form>
          </Kaart>
        </section>
      )}

      {laatste && (
        <section id="klaar" className="scroll-mt-24">
          <Kaart titel="Klaar om te kopiëren" toelichting="Zo komt de tekst in Realworks, inclusief vaste blokken.">
            <div className="whitespace-pre-wrap rounded-md border border-border bg-surface-sunken p-4 text-body-sm">{laatste.tekst}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <KopieerKnop tekst={laatste.tekst} />
              <a href={`/woningen/${id}/intake/tekst/download`} className={knopKlassen("secundair")}>
                <Download aria-hidden size={18} strokeWidth={2} />
                Downloaden (.txt)
              </a>
              {status !== "goedgekeurd" && bewerkbaar && (
                <form action={tekstGoedkeuren.bind(null, id, laatste.id)}>
                  <button type="submit" className={knopKlassen("secundair")}>Goedkeuren</button>
                </form>
              )}
            </div>
            <p className="mt-4 text-caption text-text-muted">
              {laatste.bron === "model" ? "Geschreven" : "Bewerkt"} op {datum(new Date(laatste.aangemaaktOp))}
              {profiel ? ` met profiel ${profiel.naam}, versie ${profiel.versie}` : ""} · {pagina.aantalVersies} {pagina.aantalVersies === 1 ? "versie" : "versies"}
              {status === "goedgekeurd" && tekst?.goedgekeurdOp ? ` · goedgekeurd op ${datum(new Date(tekst.goedgekeurdOp))}` : ""}
            </p>
          </Kaart>
        </section>
      )}
    </>
  );
}
