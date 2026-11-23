"use client";
// Keuzelijst op een kaartje van het pijplijnbord: zet de lead bij wijzigen meteen in de gekozen fase.
import { Keuze } from "@/components/formulier";

export function FaseKiezer({ actie, faseId, fases, naam }: { actie: (formData: FormData) => Promise<void>; faseId: string; fases: readonly { id: string; naam: string }[]; naam: string }) {
  return (
    <form action={actie}>
      <Keuze name="fase" defaultValue={faseId} aria-label={`Fase van ${naam}`} className="w-full" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {fases.map((f) => (
          <option key={f.id} value={f.id}>{f.naam}</option>
        ))}
      </Keuze>
      <noscript>
        <button type="submit" className="mt-1 text-caption text-primary hover:underline">Verplaatsen</button>
      </noscript>
    </form>
  );
}
