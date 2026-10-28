"use client";

// Een voorbeeldtekst toevoegen (ADR-016, stap B6): een bestaande, goedgekeurde woningtekst van het kantoor.
import { useActionState } from "react";
import { Melding, knopKlassen } from "@/components/basis";
import { Invoer, Keuze, Tekstvak, Veld } from "@/components/formulier";
import type { VoorbeeldStand } from "./acties";

export function VoorbeeldFormulier({ actie }: { actie: (vorige: VoorbeeldStand, formData: FormData) => Promise<VoorbeeldStand> }) {
  const [stand, verstuur, bezig] = useActionState(actie, { fouten: {}, waarden: null });
  const w = stand.waarden;
  const f = stand.fouten;
  return (
    <form action={verstuur} className="flex flex-col gap-4">
      {f.algemeen && (
        <Melding soort="fout" titel="Niet toegevoegd">
          {f.algemeen}
        </Melding>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Veld id="voorbeeld-titel" label="Titel" fout={f.titel} hint="Bijv. het adres of het soort woning.">
          <Invoer id="voorbeeld-titel" name="titel" defaultValue={w?.titel ?? ""} fout={f.titel} maxLength={120} />
        </Veld>
        <Veld id="voorbeeld-categorie" label="Woningcategorie" fout={f.woningcategorie}>
          <Keuze id="voorbeeld-categorie" name="woningcategorie" defaultValue={w?.woningcategorie ?? ""} fout={f.woningcategorie}>
            <option value="" disabled>Kies…</option>
            <option value="appartement">Appartement</option>
            <option value="eengezinswoning">Eengezinswoning</option>
            <option value="vrijstaand">Vrijstaand / villa</option>
          </Keuze>
        </Veld>
      </div>
      <Veld id="voorbeeld-tekst" label="Woningtekst" fout={f.tekst} hint="Plak de volledige tekst zoals die op Funda staat, met koppen.">
        <Tekstvak id="voorbeeld-tekst" name="tekst" defaultValue={w?.tekst ?? ""} rows={12} fout={f.tekst} />
      </Veld>
      <button type="submit" disabled={bezig} className={`${knopKlassen("secundair")} w-fit`}>
        {bezig ? "Bezig…" : "Voorbeeld toevoegen"}
      </button>
    </form>
  );
}
