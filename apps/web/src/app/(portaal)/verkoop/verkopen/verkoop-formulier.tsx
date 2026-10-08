"use client";

// Het invoerformulier per verkoop. Clientcomponent vanwege de verdelingsregels (toevoegen en verwijderen) en de
// omzet die direct meerekent. De controle gebeurt op de server (acties.ts); de fouten komen per veld terug.
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { berekenVerkoop, leesBedrag, leesPercentage, type RuweVerkoopInvoer, type VerkoopSoort } from "@makelaarscockpit/domain";
import { Melding, knopKlassen } from "@/components/basis";
import { Foutregel, Invoer, Keuze, Selectievakje, Veld } from "@/components/formulier";
import { euro } from "@/lib/format";
import type { FormulierStand } from "./acties";

export type Makelaarkeuze = { id: string; naam: string };

const SOORTEN: { waarde: VerkoopSoort; label: string }[] = [
  { waarde: "koop", label: "Koop" },
  { waarde: "split", label: "Split (gedeeld met ander kantoor)" },
  { waarde: "nieuwbouw", label: "Nieuwbouw" },
  { waarde: "taxatie", label: "Taxatie" },
  { waarde: "huur", label: "Verhuur" },
  { waarde: "overig", label: "Overig" },
];

type Props = {
  actie: (vorige: FormulierStand, formData: FormData) => Promise<FormulierStand>;
  begin: RuweVerkoopInvoer;
  medewerkers: Makelaarkeuze[];
  /** Adres, datums en prijs komen uit Realworks en zijn dan niet te wijzigen (ADR-007). */
  realworksVelden: boolean;
  terugNaar: string;
  knoptekst: string;
};

const leeg = { medewerkerId: "", makelaar: "", aandeel: "" };

export function VerkoopFormulier({ actie, begin, medewerkers, realworksVelden, terugNaar, knoptekst }: Props) {
  const [stand, verstuur, bezig] = useActionState(actie, { fouten: {}, waarden: null });
  const w = stand.waarden ?? begin;
  const f = stand.fouten;

  const [courtageSoort, zetCourtageSoort] = useState(w.courtageSoort || "percentage");
  const [verdeling, zetVerdeling] = useState(w.verdeling.length > 0 ? w.verdeling : [{ ...leeg, aandeel: "100" }]);
  const [bedragen, zetBedragen] = useState({ verkoopprijs: w.verkoopprijs, courtagePercentage: w.courtagePercentage, courtageBedrag: w.courtageBedrag, opstartnota: w.opstartnota });

  const uitkomst = useMemo(() => {
    const prijs = leesBedrag(bedragen.verkoopprijs);
    const nota = leesBedrag(bedragen.opstartnota);
    const pct = leesPercentage(bedragen.courtagePercentage);
    const vast = leesBedrag(bedragen.courtageBedrag);
    if ("fout" in prijs || "fout" in nota || "fout" in pct || "fout" in vast) return null;
    try {
      return berekenVerkoop({
        verkoopprijs: prijs.waarde,
        courtage:
          courtageSoort === "percentage" && pct.waarde !== null ? { soort: "percentage", fractie: pct.waarde }
          : courtageSoort === "vast" && vast.waarde !== null ? { soort: "vast", bedrag: vast.waarde }
          : null,
        opstartnota: nota.waarde ?? 0,
        aandeel: 1,
      });
    } catch {
      return null;
    }
  }, [bedragen, courtageSoort]);

  const bedrag = (naam: keyof typeof bedragen) => (e: React.ChangeEvent<HTMLInputElement>) => zetBedragen({ ...bedragen, [naam]: e.target.value });
  const wijzigRegel = (i: number, deel: Partial<typeof leeg>) => zetVerdeling(verdeling.map((r, j) => (j === i ? { ...r, ...deel } : r)));
  const kiesMakelaar = (i: number, keuze: string) => {
    const gekozen = medewerkers.find((m) => m.id === keuze);
    if (gekozen) wijzigRegel(i, { medewerkerId: keuze, makelaar: gekozen.naam });
    else if (keuze.startsWith("vrij:")) wijzigRegel(i, { medewerkerId: "", makelaar: keuze.slice(5) });
    else wijzigRegel(i, { medewerkerId: "", makelaar: "" });
  };

  return (
    <form action={verstuur} className="flex flex-col gap-6" noValidate>
      {f.algemeen && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {f.algemeen}
        </Melding>
      )}

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-6 sm:grid-cols-2">
        <h2 className="text-h4 sm:col-span-2">Woning en verkoop</h2>
        {realworksVelden && (
          <p className="text-body-sm text-text-muted sm:col-span-2">Adres, datums en verkoopprijs komen uit Realworks en worden daar bijgehouden.</p>
        )}
        <Veld id="soort" label="Soort" fout={f.soort}>
          <Keuze id="soort" name="soort" defaultValue={w.soort || "koop"} fout={f.soort}>
            {SOORTEN.map((s) => (
              <option key={s.waarde} value={s.waarde}>
                {s.label}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld id="adres" label="Adres of omschrijving" fout={f.adres}>
          <Invoer id="adres" name="adres" defaultValue={w.adres} readOnly={realworksVelden} disabled={realworksVelden} fout={f.adres} />
          {realworksVelden && <input type="hidden" name="adres" value={w.adres} />}
        </Veld>
        <Veld id="verkoopdatum" label="Verkoopdatum" fout={f.verkoopdatum}>
          <Invoer id="verkoopdatum" name="verkoopdatum" type="date" defaultValue={w.verkoopdatum} disabled={realworksVelden} fout={f.verkoopdatum} />
          {realworksVelden && <input type="hidden" name="verkoopdatum" value={w.verkoopdatum} />}
        </Veld>
        <Veld id="passeerdatum" label="Passeerdatum" fout={f.passeerdatum} hint="Leeg laten als die nog niet bekend is.">
          <Invoer id="passeerdatum" name="passeerdatum" type="date" defaultValue={w.passeerdatum} disabled={realworksVelden} fout={f.passeerdatum} />
          {realworksVelden && <input type="hidden" name="passeerdatum" value={w.passeerdatum} />}
        </Veld>
        <Veld id="omzetMaand" label="Maand waarin de omzet telt" fout={f.omzetMaand} hint="Standaard de maand van passeren.">
          <Invoer id="omzetMaand" name="omzetMaand" type="month" defaultValue={w.omzetMaand} disabled={realworksVelden} fout={f.omzetMaand} />
          {realworksVelden && <input type="hidden" name="omzetMaand" value={w.omzetMaand} />}
        </Veld>
        <Veld id="verkoopprijs" label="Verkoopprijs" fout={f.verkoopprijs} hint="Leeg bij een taxatie.">
          <Invoer id="verkoopprijs" name="verkoopprijs" inputMode="decimal" defaultValue={w.verkoopprijs} onChange={bedrag("verkoopprijs")} disabled={realworksVelden} fout={f.verkoopprijs} placeholder="395.000" />
          {realworksVelden && <input type="hidden" name="verkoopprijs" value={w.verkoopprijs} />}
        </Veld>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-6 sm:grid-cols-2">
        <h2 className="text-h4 sm:col-span-2">Courtage en nota</h2>
        <Veld id="courtageSoort" label="Courtage afgesproken als" fout={f.courtageSoort}>
          <Keuze id="courtageSoort" name="courtageSoort" value={courtageSoort} onChange={(e) => zetCourtageSoort(e.target.value)} fout={f.courtageSoort}>
            <option value="percentage">Percentage van de verkoopprijs</option>
            <option value="vast">Vast bedrag</option>
            <option value="geen">Geen courtage</option>
          </Keuze>
        </Veld>
        {courtageSoort === "percentage" && (
          <Veld id="courtagePercentage" label="Percentage" fout={f.courtagePercentage} hint="Bijvoorbeeld 1,3 voor 1,3%.">
            <Invoer id="courtagePercentage" name="courtagePercentage" inputMode="decimal" defaultValue={w.courtagePercentage} onChange={bedrag("courtagePercentage")} fout={f.courtagePercentage} placeholder="1,3" />
          </Veld>
        )}
        {courtageSoort === "vast" && (
          <Veld id="courtageBedrag" label="Courtage incl. btw" fout={f.courtageBedrag}>
            <Invoer id="courtageBedrag" name="courtageBedrag" inputMode="decimal" defaultValue={w.courtageBedrag} onChange={bedrag("courtageBedrag")} fout={f.courtageBedrag} placeholder="2.500" />
          </Veld>
        )}
        {courtageSoort === "geen" && <div className="hidden sm:block" />}
        <Veld id="opstartnota" label="Opstartnota of vaste nota incl. btw" fout={f.opstartnota} hint="Negatief bij een verrekening.">
          <Invoer id="opstartnota" name="opstartnota" inputMode="decimal" defaultValue={w.opstartnota} onChange={bedrag("opstartnota")} fout={f.opstartnota} placeholder="595" />
        </Veld>
        <div className="flex items-end">
          <Selectievakje id="notaVerstuurd" name="notaVerstuurd" label="Nota is verstuurd" defaultChecked={w.notaVerstuurd} />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-surface-sunken p-4 text-body-sm sm:col-span-2 sm:grid-cols-4">
          <dt className="text-text-muted">Courtage incl. btw</dt>
          <dd className="text-right tabular-nums sm:text-left">{uitkomst ? euro(uitkomst.courtage) : "–"}</dd>
          <dt className="text-text-muted">Omzet incl. btw</dt>
          <dd className="text-right tabular-nums sm:text-left">{uitkomst ? euro(uitkomst.omzetTotaal) : "–"}</dd>
          <dt className="text-text-muted">Courtage excl. btw</dt>
          <dd className="text-right tabular-nums sm:text-left">{uitkomst ? euro(uitkomst.courtageExBtw) : "–"}</dd>
          <dt className="text-label text-text">Omzet excl. btw</dt>
          <dd className="text-right text-label tabular-nums sm:text-left">{uitkomst ? euro(uitkomst.omzetExBtwZonderAandeel) : "–"}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <div>
          <h2 className="text-h4">Verdeling tussen makelaars</h2>
          <p className="mt-0.5 text-body-sm text-text-muted">Samen 100%. Bij een eigen verkoop staat één makelaar op 100%.</p>
        </div>
        {verdeling.map((regel, i) => {
          const bekend = medewerkers.some((m) => m.id === regel.medewerkerId);
          // Een naam uit de Excel-historie die niet bij een medewerker in Realworks hoort, blijft kiesbaar.
          const keuze = bekend ? regel.medewerkerId : regel.makelaar ? `vrij:${regel.makelaar}` : "";
          return (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_minmax(0,160px)_auto] sm:items-end">
              <Veld id={`verdeling-${i}-makelaar`} label={i === 0 ? "Makelaar" : `Makelaar ${i + 1}`}>
                <Keuze id={`verdeling-${i}-makelaar`} value={keuze} onChange={(e) => kiesMakelaar(i, e.target.value)}>
                  <option value="">Kies een makelaar</option>
                  {medewerkers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.naam}
                    </option>
                  ))}
                  {!bekend && regel.makelaar && <option value={keuze}>{regel.makelaar} (niet in Realworks)</option>}
                </Keuze>
                <input type="hidden" name={`verdeling.${i}.medewerkerId`} value={bekend ? regel.medewerkerId : ""} />
                <input type="hidden" name={`verdeling.${i}.makelaar`} value={regel.makelaar} />
              </Veld>
              <Veld id={`verdeling-${i}-aandeel`} label="Aandeel %">
                <Invoer id={`verdeling-${i}-aandeel`} name={`verdeling.${i}.aandeel`} inputMode="decimal" value={regel.aandeel} onChange={(e) => wijzigRegel(i, { aandeel: e.target.value })} placeholder="50" />
              </Veld>
              <button
                type="button"
                onClick={() => zetVerdeling(verdeling.filter((_, j) => j !== i))}
                disabled={verdeling.length === 1}
                aria-label={`Makelaar ${i + 1} verwijderen`}
                className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-primary-subtle hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 aria-hidden size={18} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
        {f.verdeling && <Foutregel>{f.verdeling}</Foutregel>}
        <button type="button" onClick={() => zetVerdeling([...verdeling, { ...leeg }])} className={`${knopKlassen("ghost")} w-fit`}>
          <Plus aria-hidden size={18} strokeWidth={2} />
          Makelaar toevoegen
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={bezig} className={knopKlassen("primair")}>
          {bezig ? "Bezig met opslaan…" : knoptekst}
        </button>
        <Link href={terugNaar} className={knopKlassen("ghost")}>
          Annuleren
        </Link>
      </div>
    </form>
  );
}
