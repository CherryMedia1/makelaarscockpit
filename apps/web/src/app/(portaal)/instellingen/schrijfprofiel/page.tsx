import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { Kaart, Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { datum } from "@/lib/format";
import { haalSchrijfprofielBeheer } from "@/lib/schrijfprofiel";
import { profielActiveren, profielOpslaan, voorbeeldToevoegen, voorbeeldVerwijderen } from "./acties";
import { ProfielFormulier } from "./profiel-formulier";
import { VoorbeeldFormulier } from "./voorbeeld-formulier";

export const metadata: Metadata = { title: "Schrijfprofiel" };

const CATEGORIE = { appartement: "Appartement", eengezinswoning: "Eengezinswoning", vrijstaand: "Vrijstaand" } as const;
const STATUS = { actief: { label: "Actief", soort: "succes" }, concept: { label: "Concept", soort: "info" }, gearchiveerd: { label: "Archief", soort: "neutraal" } } as const;
const woorden = (t: string) => t.split(/\s+/).filter(Boolean).length;

type Zoek = { opgeslagen?: string; geactiveerd?: string; voorbeeld?: string; fout?: string };

/** Schrijfprofiel en voorbeeldteksten van het kantoor (ADR-016, stap B6). Alleen voor de kantoorbeheerder. */
export default async function Schrijfprofiel({ searchParams }: { searchParams: Promise<Zoek> }) {
  const [beheer, zoek] = await Promise.all([haalSchrijfprofielBeheer(), searchParams]);

  if (beheer.toegang !== "ja") {
    return (
      <>
        <PaginaKop titel="Schrijfprofiel" />
        <Melding titel={beheer.toegang === "geen-beheerder" ? "Alleen voor de kantoorbeheerder" : "Niet beschikbaar"}>
          {beheer.toegang === "geen-beheerder" ? "Het schrijfprofiel voor woningteksten wordt door de kantoorbeheerder vastgelegd." : "De intake-module staat niet aan voor dit kantoor."}
        </Melding>
      </>
    );
  }
  const { actief, versies, voorbeelden } = beheer;

  return (
    <>
      <PaginaKop titel="Schrijfprofiel" toelichting="Hoe woningteksten van dit kantoor eruitzien: opbouw, koppen, toon, lengte en vaste blokken. Elke wijziging wordt een nieuwe versie." />

      {zoek.opgeslagen && <Melding titel="Opgeslagen">Versie {zoek.opgeslagen} van het schrijfprofiel is opgeslagen.</Melding>}
      {zoek.geactiveerd && <Melding titel="Actief gemaakt">Nieuwe woningteksten gebruiken nu deze versie.</Melding>}
      {zoek.voorbeeld && <Melding titel="Voorbeeld toegevoegd">De tekst wordt gebruikt als voorbeeld bij woningen van dezelfde categorie.</Melding>}
      {zoek.fout && (
        <Melding soort="fout" titel="Niet gelukt">
          {zoek.fout === "rechten" ? "Alleen de kantoorbeheerder kan dit." : "Deze versie bestaat niet."}
        </Melding>
      )}
      {!actief && (
        <Melding titel="Nog geen actief profiel">Zonder actief schrijfprofiel kunnen er geen woningteksten worden geschreven. Plak het profiel hieronder en sla het op.</Melding>
      )}

      {versies.length > 0 && (
        <Kaart titel="Versies">
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {versies.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-label">Versie {v.versie}</span>
                  <span className="text-body-sm text-text-muted">{v.naam} · {datum(new Date(v.aangemaaktOp))}</span>
                  <Label soort={STATUS[v.status].soort}>{STATUS[v.status].label}</Label>
                </div>
                {v.status !== "actief" && (
                  <form action={profielActiveren.bind(null, v.id)}>
                    <button type="submit" className={knopKlassen("ghost")}>Actief maken</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Kaart>
      )}

      <Kaart titel={actief ? `Profiel bewerken (nu versie ${actief.versie})` : "Profiel invoeren"} toelichting="JSON volgens het schema van het schrijfprofiel. Bij opslaan wordt het profiel gecontroleerd; fouten verschijnen bovenaan.">
        <ProfielFormulier actie={profielOpslaan} begin={actief ? JSON.stringify(actief.profiel, null, 2) : ""} />
      </Kaart>

      <section id="voorbeelden" className="scroll-mt-24">
        <Kaart titel="Voorbeeldteksten" toelichting="Bestaande woningteksten van het kantoor. Bij elke nieuwe tekst gaan er twee mee, bij voorkeur van dezelfde categorie, om de stijl te laten zien.">
          {voorbeelden.length === 0 ? (
            <p className="mb-6 text-body-sm text-text-muted">Nog geen voorbeeldteksten.</p>
          ) : (
            <ul className="-mx-6 mb-6 divide-y divide-border border-y border-border">
              {voorbeelden.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-label">{v.titel}</p>
                    <p className="text-body-sm text-text-muted">{CATEGORIE[v.woningcategorie]} · {woorden(v.tekst)} woorden</p>
                  </div>
                  <form action={voorbeeldVerwijderen.bind(null, v.id)}>
                    <button type="submit" aria-label={`Voorbeeld ${v.titel} verwijderen`} className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-fout-bg hover:text-fout-fg">
                      <Trash2 aria-hidden size={16} strokeWidth={1.75} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <VoorbeeldFormulier actie={voorbeeldToevoegen} />
        </Kaart>
      </section>
    </>
  );
}
