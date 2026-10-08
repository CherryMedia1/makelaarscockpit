import Link from "next/link";
import { ArrowRight, ChartColumn, ClipboardCheck, Home } from "lucide-react";
import { PaginaKop } from "@/components/basis";

const dashboards = [
  { href: "/verkoop", titel: "Verkoop en omzet", tekst: "Verkochte woningen, omzet per maand en per makelaar, tegenover vorig jaar en je doelstelling.", icoon: ChartColumn, klaar: true },
  { href: "/waardebepalingen", titel: "Waardebepalingen", tekst: "Van waardebepaling naar opdracht: gewonnen, verloren en de score per makelaar.", icoon: ClipboardCheck, klaar: true },
  { href: "/woningen", titel: "Woningen in verkoop", tekst: "Per woning zien welke stappen klaar zijn: foto's, tekst, Funda, bord en koopovereenkomst.", icoon: Home, klaar: false },
];

export default function Overzicht() {
  return (
    <>
      <PaginaKop titel="Overzicht" toelichting="Kies een dashboard om te beginnen." />
      <div className="grid gap-4 md:grid-cols-3">
        {dashboards.map(({ href, titel, tekst, icoon: Icoon, klaar }) => (
          <Link key={href} href={href} className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 transition-colors duration-150 hover:border-border-strong">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Icoon aria-hidden size={20} strokeWidth={1.75} />
            </span>
            <h2 className="text-h4">{titel}</h2>
            <p className="flex-1 text-body-sm text-text-muted">{tekst}</p>
            <span className="inline-flex items-center gap-1 text-label text-primary">
              {klaar ? "Bekijken" : "Binnenkort"}
              {klaar && <ArrowRight aria-hidden size={16} strokeWidth={2} className="transition-transform duration-150 group-hover:translate-x-0.5" />}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
