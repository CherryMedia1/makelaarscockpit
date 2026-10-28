"use client";

// Het schrijfprofiel als JSON bewerken (ADR-016, stap B6). De controle (schema en samenhang) gebeurt op de server; de
// fouten komen als lijst terug en de ingevoerde tekst blijft staan.
import { useActionState } from "react";
import { Melding, knopKlassen } from "@/components/basis";
import { Selectievakje, Tekstvak } from "@/components/formulier";
import type { ProfielStand } from "./acties";

export function ProfielFormulier({ actie, begin }: { actie: (vorige: ProfielStand, formData: FormData) => Promise<ProfielStand>; begin: string }) {
  const [stand, verstuur, bezig] = useActionState(actie, { fouten: [], tekst: null });
  return (
    <form action={verstuur} className="flex flex-col gap-4">
      {stand.fouten.length > 0 && (
        <Melding soort="fout" titel="Het profiel is niet opgeslagen">
          {stand.fouten.length === 1 ? stand.fouten[0] : `${stand.fouten.length} problemen: ${stand.fouten.join("; ")}`}
        </Melding>
      )}
      <Tekstvak
        name="profiel"
        aria-label="Schrijfprofiel (JSON)"
        defaultValue={stand.tekst ?? begin}
        rows={24}
        spellCheck={false}
        className="font-mono text-body-sm"
        fout={stand.fouten.length > 0 ? stand.fouten[0] : undefined}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Selectievakje id="activeren" name="activeren" value="ja" defaultChecked label="Direct actief maken" />
        <button type="submit" disabled={bezig} className={knopKlassen("primair")}>
          {bezig ? "Bezig met opslaan…" : "Opslaan als nieuwe versie"}
        </button>
      </div>
    </form>
  );
}
