import type { Metadata } from "next";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Save, Trash2 } from "lucide-react";
import { FASE_SOORTEN, FASE_SOORT_LABEL, MAX_FASENAAM, STANDAARD_FASES, type FaseSoort } from "@makelaarscockpit/domain";
import { Kaart, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Invoer, Keuze } from "@/components/formulier";
import { haalPijplijnBeheer } from "@/lib/pijplijn";
import { faseActiefZetten, faseToevoegen, faseVerplaatsen, faseVerwijderen, faseWijzigen, standaardFasesToevoegen } from "./acties";

export const metadata: Metadata = { title: "Pijplijn" };

const SOORT_STIJL: Record<FaseSoort, "info" | "succes" | "neutraal"> = { open: "info", gewonnen: "succes", verloren: "neutraal" };

const FOUTEN: Record<string, string> = {
  rechten: "Alleen de kantoorbeheerder kan de pijplijn aanpassen.",
  "naam-leeg": "Geef de fase een naam.",
  "naam-te-lang": `De naam van een fase is hooguit ${MAX_FASENAAM} tekens.`,
  "naam-bestaat": "Er is al een fase met deze naam.",
  soort: "Kies of de fase lopend, gewonnen of verloren is.",
  onbekend: "Deze fase bestaat niet meer.",
  "in-gebruik": "Er zitten of zaten leads in deze fase. Je kunt haar uitzetten, niet verwijderen.",
  "niet-leeg": "Er staan al fases; de standaardfases zijn niet toegevoegd.",
};

/** De fases van de pijplijn voor bezichtigersleads (ADR-020). Alleen voor de kantoorbeheerder. */
export default async function Pijplijn({ searchParams }: { searchParams: Promise<{ opgeslagen?: string; fout?: string }> }) {
  const [beheer, zoek] = await Promise.all([haalPijplijnBeheer(), searchParams]);

  if (beheer.toegang !== "ja") {
    return (
      <>
        <PaginaKop titel="Pijplijn" />
        <Melding titel={beheer.toegang === "geen-beheerder" ? "Alleen voor de kantoorbeheerder" : "Niet beschikbaar"}>
          {beheer.toegang === "geen-beheerder" ? "De fases van de pijplijn worden door de kantoorbeheerder vastgelegd." : "De module Bezichtigersleads staat niet aan voor dit kantoor."}
        </Melding>
      </>
    );
  }
  const { fases } = beheer;

  return (
    <>
      <PaginaKop titel="Pijplijn" toelichting="De fases waarin jullie leads uit bezichtigingen opvolgen, in de volgorde van het bord. Een eindfase is gewonnen of verloren; wat dat inhoudt, bepalen jullie zelf." />

      {zoek.opgeslagen && <Melding titel="Opgeslagen">De pijplijn is bijgewerkt.</Melding>}
      {zoek.fout && (
        <Melding soort="fout" titel="Niet gelukt">
          {FOUTEN[zoek.fout] ?? "Probeer het opnieuw."}
        </Melding>
      )}

      {fases.length === 0 ? (
        <LegeStaat icoon={ListOrdered} titel="Nog geen fases">
          Begin met de standaardfases ({STANDAARD_FASES.map((f) => f.naam).join(", ")}) en pas ze daarna aan, of voeg hieronder je eigen fases toe.
        </LegeStaat>
      ) : (
        <Kaart titel="Fases">
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {fases.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="w-6 text-body-sm tabular-nums text-text-muted">{i + 1}</span>
                <form action={faseWijzigen.bind(null, f.id)} className="flex flex-1 flex-wrap items-center gap-3">
                  <Invoer name="naam" defaultValue={f.naam} maxLength={MAX_FASENAAM} required aria-label={`Naam van fase ${i + 1}`} className="min-w-52 flex-1" />
                  <Keuze name="soort" defaultValue={f.soort} aria-label={`Soort van fase ${i + 1}`} className="w-36">
                    {FASE_SOORTEN.map((s) => (
                      <option key={s} value={s}>{FASE_SOORT_LABEL[s]}</option>
                    ))}
                  </Keuze>
                  <button type="submit" className={`${knopKlassen("ghost")} px-2`}>
                    <Save aria-hidden size={18} strokeWidth={1.75} />
                    Opslaan
                  </button>
                </form>
                <Label soort={f.actief ? SOORT_STIJL[f.soort] : "neutraal"}>{f.actief ? FASE_SOORT_LABEL[f.soort] : "Uitgezet"}</Label>
                <div className="flex items-center gap-1">
                  <form action={faseVerplaatsen.bind(null, f.id, "omhoog")}>
                    <button type="submit" disabled={i === 0} aria-label={`${f.naam} omhoog`} title="Omhoog" className={`${knopKlassen("ghost")} px-2 disabled:cursor-not-allowed disabled:opacity-40`}>
                      <ArrowUp aria-hidden size={18} strokeWidth={1.75} />
                    </button>
                  </form>
                  <form action={faseVerplaatsen.bind(null, f.id, "omlaag")}>
                    <button type="submit" disabled={i === fases.length - 1} aria-label={`${f.naam} omlaag`} title="Omlaag" className={`${knopKlassen("ghost")} px-2 disabled:cursor-not-allowed disabled:opacity-40`}>
                      <ArrowDown aria-hidden size={18} strokeWidth={1.75} />
                    </button>
                  </form>
                  <form action={faseActiefZetten.bind(null, f.id, !f.actief)}>
                    <button type="submit" className={`${knopKlassen("ghost")} px-2`}>{f.actief ? "Uitzetten" : "Aanzetten"}</button>
                  </form>
                  <form action={faseVerwijderen.bind(null, f.id)}>
                    <button type="submit" aria-label={`${f.naam} verwijderen`} title="Verwijderen" className={`${knopKlassen("ghost")} px-2`}>
                      <Trash2 aria-hidden size={18} strokeWidth={1.75} />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Kaart>
      )}

      {fases.length === 0 && (
        <form action={standaardFasesToevoegen}>
          <button type="submit" className={knopKlassen("primair")}>Standaardfases toevoegen</button>
        </form>
      )}

      <Kaart titel="Fase toevoegen" toelichting="Een nieuwe fase komt achteraan; met de pijlen zet je haar op de juiste plek.">
        <form action={faseToevoegen} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1.5 text-label">
            Naam
            <Invoer name="naam" maxLength={MAX_FASENAAM} required placeholder="Bijvoorbeeld: Afspraak gepland" className="min-w-52" />
          </label>
          <label className="flex flex-col gap-1.5 text-label">
            Soort
            <Keuze name="soort" defaultValue="open" className="w-36">
              {FASE_SOORTEN.map((s) => (
                <option key={s} value={s}>{FASE_SOORT_LABEL[s]}</option>
              ))}
            </Keuze>
          </label>
          <button type="submit" className={knopKlassen("secundair")}>
            <Plus aria-hidden size={18} strokeWidth={1.75} />
            Toevoegen
          </button>
        </form>
      </Kaart>
    </>
  );
}
