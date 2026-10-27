"use client";
// Kiezer voor het aantal rijen per pagina. Verstuurt bij wijzigen meteen een GET-formulier met de huidige filters,
// zodat alles in de URL blijft staan. Een nieuw aantal begint weer op pagina 1.
import { Keuze } from "@/components/formulier";

export function RijenKiezer({ rijen, opties, behoud }: { rijen: number; opties: readonly number[]; behoud: Record<string, string> }) {
  return (
    <form method="get" className="flex items-center gap-2 text-body-sm text-text-muted">
      {Object.entries(behoud).map(([naam, waarde]) => (
        <input key={naam} type="hidden" name={naam} value={waarde} />
      ))}
      <label htmlFor="rijen">Rijen per pagina</label>
      <Keuze id="rijen" name="rijen" defaultValue={String(rijen)} className="w-20" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {opties.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </Keuze>
      <noscript>
        <button type="submit" className="text-primary hover:underline">Toon</button>
      </noscript>
    </form>
  );
}
