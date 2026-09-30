import type { Metadata } from "next";
import { Melding, knopKlassen } from "@/components/basis";
import { microsoftBeschikbaar } from "@/lib/inlog/microsoft";
import { inloglinkAanvragen } from "./acties";

export const metadata: Metadata = { title: "Inloggen" };

const meldingen: Record<string, { titel: string; tekst: string; soort: "info" | "fout" }> = {
  "geen-toegang": { titel: "Dit account heeft geen toegang", tekst: "Vraag je kantoorbeheerder om je toe te voegen aan MakelaarsCockpit.", soort: "fout" },
  "link-ongeldig": { titel: "Deze inloglink werkt niet meer", tekst: "De link is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.", soort: "fout" },
  "ongeldig-adres": { titel: "Dat is geen geldig e-mailadres", tekst: "Controleer het adres en probeer het opnieuw.", soort: "fout" },
  storing: { titel: "Inloggen lukt nu even niet", tekst: "Probeer het over een paar minuten opnieuw.", soort: "fout" },
  verlopen: { titel: "Je sessie is verlopen", tekst: "Log opnieuw in om verder te gaan.", soort: "info" },
  uitgelogd: { titel: "Je bent uitgelogd", tekst: "Tot de volgende keer.", soort: "info" },
};

export default async function Inloggen({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const melding = meldingen[(await searchParams).melding ?? ""];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h3">Inloggen</h1>
        <p className="mt-1 text-body text-text-muted">Log in met het account van je kantoor.</p>
      </div>

      {melding && (
        <Melding soort={melding.soort} titel={melding.titel}>
          {melding.tekst}
        </Melding>
      )}

      {microsoftBeschikbaar() && (
        <>
          <a href="/api/inloggen/microsoft" className={knopKlassen("primair", true)}>
            Inloggen met Microsoft
          </a>
          <div className="flex items-center gap-3 text-caption text-text-muted">
            <span className="h-px flex-1 bg-border" />
            of met een link per e-mail
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form action={inloglinkAanvragen} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-label">
          E-mailadres
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="naam@kantoor.nl"
          className="h-10 rounded-md border border-border-strong bg-surface px-3 text-body outline-none transition-colors duration-150 focus:border-primary"
        />
        <button type="submit" className={knopKlassen(microsoftBeschikbaar() ? "secundair" : "primair", true)}>
          Stuur mij een inloglink
        </button>
      </form>

      <p className="text-body-sm text-text-muted">Alleen medewerkers die door hun kantoor zijn toegevoegd kunnen inloggen.</p>
    </div>
  );
}
