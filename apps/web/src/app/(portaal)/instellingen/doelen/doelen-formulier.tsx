"use client";

import { useActionState, useState } from "react";
import { Melding, knopKlassen } from "@/components/basis";
import { Invoer, Veld } from "@/components/formulier";
import { MAANDEN_KORT } from "@/lib/format";
import type { DoelenStand } from "./acties";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function DoelenFormulier({ actie, begin, jaar }: { actie: (vorige: DoelenStand, formData: FormData) => Promise<DoelenStand>; begin: string[]; jaar: number }) {
  const [stand, verstuur, bezig] = useActionState(actie, { fouten: {}, maanden: null });
  const [maanden, zetMaanden] = useState(stand.maanden ?? begin);
  const [alle, zetAlle] = useState("");
  const f = stand.fouten;

  return (
    <form action={verstuur} noValidate className="flex flex-col gap-6">
      {f.algemeen && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {f.algemeen}
        </Melding>
      )}
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-end gap-3">
          <Veld id="alle" label="Zelfde bedrag voor alle maanden">
            <Invoer id="alle" inputMode="decimal" value={alle} onChange={(e) => zetAlle(e.target.value)} placeholder="150.000" className="sm:w-48" />
          </Veld>
          <button type="button" onClick={() => zetMaanden(Array.from({ length: 12 }, () => alle))} className={knopKlassen("secundair")}>
            Vul alle maanden
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {MAANDEN.map((naam, i) => (
            <Veld key={naam} id={`maand-${i + 1}`} label={`${naam.charAt(0).toUpperCase()}${naam.slice(1)} ${jaar}`} fout={f[`maand-${i + 1}`]}>
              <Invoer
                id={`maand-${i + 1}`}
                name={`maand-${i + 1}`}
                inputMode="decimal"
                value={maanden[i] ?? ""}
                onChange={(e) => zetMaanden(maanden.map((m, j) => (j === i ? e.target.value : m)))}
                fout={f[`maand-${i + 1}`]}
                aria-label={`Doel ${MAANDEN_KORT[i]} ${jaar}`}
              />
            </Veld>
          ))}
        </div>
      </section>
      <div>
        <button type="submit" disabled={bezig} className={knopKlassen("primair")}>
          {bezig ? "Bezig met opslaan…" : "Doelstellingen opslaan"}
        </button>
      </div>
    </form>
  );
}
