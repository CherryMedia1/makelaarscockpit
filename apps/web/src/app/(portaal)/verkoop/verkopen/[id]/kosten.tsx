"use client";

// Kosten per woning: lijst met verwijderen, een regel toevoegen, en opbrengst, kosten en resultaat onderaan.
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { resultaatPerWoning, type KostenSoort } from "@makelaarscockpit/domain";
import { Melding, knopKlassen } from "@/components/basis";
import { Invoer, Keuze, Veld } from "@/components/formulier";
import { datum, euro } from "@/lib/format";
import type { Kostenregel } from "@/lib/verkoop-invoer";
import type { KostenStand } from "../acties";

const SOORT_LABEL: Record<KostenSoort, string> = { fotograaf: "Fotograaf", videograaf: "Videograaf", advertentie: "Advertentie", styling: "Styling", energielabel: "Energielabel", overig: "Overig" };

type Props = {
  kosten: Kostenregel[];
  omzetExBtw: number | null;
  toevoegen: (vorige: KostenStand, formData: FormData) => Promise<KostenStand>;
  verwijderen: (kostenregelId: string) => Promise<void>;
};

export function Kosten({ kosten, omzetExBtw, toevoegen, verwijderen }: Props) {
  const [stand, verstuur, bezig] = useActionState(toevoegen, { fouten: {}, waarden: null, toegevoegd: 0 });
  const w = stand.waarden;
  const f = stand.fouten;
  const r = resultaatPerWoning(omzetExBtw, kosten);
  const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <h2 className="text-h4">Kosten voor deze woning</h2>
        <p className="mt-0.5 text-body-sm text-text-muted">Bedragen zoals op de factuur, incl. btw. Het resultaat is excl. btw, net als de omzet.</p>
      </div>

      {f.algemeen && (
        <Melding soort="fout" titel="Toevoegen is niet gelukt">
          {f.algemeen}
        </Melding>
      )}

      {kosten.length > 0 && (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-body-sm">
            <thead>
              <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                <th scope="col" className="px-6 py-3 font-semibold">Datum</th>
                <th scope="col" className="px-3 py-3 font-semibold">Soort</th>
                <th scope="col" className="px-3 py-3 font-semibold">Leverancier</th>
                <th scope="col" className="px-3 py-3 font-semibold">Omschrijving</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Bedrag</th>
                <th scope="col" className="px-6 py-3"><span className="sr-only">Verwijderen</span></th>
              </tr>
            </thead>
            <tbody>
              {kosten.map((k) => (
                <tr key={k.id} className="h-12 border-t border-border">
                  <td className="whitespace-nowrap px-6">{datum(new Date(`${k.datum}T00:00:00`))}</td>
                  <td className="whitespace-nowrap px-3">{SOORT_LABEL[k.soort]}</td>
                  <td className="px-3">{k.leverancier ?? ""}</td>
                  <td className="px-3 text-text-muted">{k.omschrijving ?? ""}</td>
                  <td className="whitespace-nowrap px-3 text-right tabular-nums">{euro(k.bedrag)}</td>
                  <td className="px-6 text-right">
                    <form action={verwijderen.bind(null, k.id)}>
                      <button type="submit" aria-label="Kostenregel verwijderen" className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-fout-bg hover:text-fout-fg">
                        <Trash2 aria-hidden size={16} strokeWidth={1.75} />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form key={stand.toegevoegd} action={verstuur} noValidate className="grid gap-3 rounded-md bg-surface-sunken p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,120px)_minmax(0,150px)_auto] lg:items-end">
        <Veld id="kosten-soort" label="Soort" fout={f.soort}>
          <Keuze id="kosten-soort" name="soort" defaultValue={w?.soort ?? "fotograaf"} fout={f.soort}>
            {(Object.keys(SOORT_LABEL) as KostenSoort[]).map((s) => (
              <option key={s} value={s}>
                {SOORT_LABEL[s]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld id="kosten-leverancier" label="Leverancier" fout={f.leverancier}>
          <Invoer id="kosten-leverancier" name="leverancier" defaultValue={w?.leverancier ?? ""} fout={f.leverancier} />
        </Veld>
        <Veld id="kosten-omschrijving" label="Omschrijving" fout={f.omschrijving}>
          <Invoer id="kosten-omschrijving" name="omschrijving" defaultValue={w?.omschrijving ?? ""} fout={f.omschrijving} />
        </Veld>
        <Veld id="kosten-bedrag" label="Bedrag incl. btw" fout={f.bedrag}>
          <Invoer id="kosten-bedrag" name="bedrag" inputMode="decimal" defaultValue={w?.bedrag ?? ""} fout={f.bedrag} placeholder="250" />
        </Veld>
        <Veld id="kosten-datum" label="Datum" fout={f.datum}>
          <Invoer id="kosten-datum" name="datum" type="date" defaultValue={w?.datum ?? vandaag} fout={f.datum} />
        </Veld>
        <button type="submit" disabled={bezig} className={knopKlassen("secundair")}>
          <Plus aria-hidden size={18} strokeWidth={2} />
          {bezig ? "Bezig…" : "Toevoegen"}
        </button>
      </form>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
        <dt className="text-text-muted">Omzet excl. btw</dt>
        <dd className="text-right tabular-nums sm:text-left">{omzetExBtw === null ? "nog niet ingevuld" : euro(omzetExBtw)}</dd>
        <dt className="text-text-muted">Kosten excl. btw</dt>
        <dd className="text-right tabular-nums sm:text-left">{euro(r.kostenExBtw)}</dd>
        <dt className="text-label text-text">Resultaat excl. btw</dt>
        <dd className="text-right text-label tabular-nums sm:text-left">{r.resultaatExBtw === null ? "–" : euro(r.resultaatExBtw)}</dd>
        <dt className="text-text-muted">Kosten incl. btw</dt>
        <dd className="text-right tabular-nums sm:text-left">{euro(r.kostenInclBtw)}</dd>
      </dl>
    </section>
  );
}
