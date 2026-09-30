import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { procent } from "@/lib/format";

export function PaginaKop({ titel, toelichting, children }: { titel: string; toelichting?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-h2">{titel}</h1>
        {toelichting && <p className="mt-1 text-body text-text-muted">{toelichting}</p>}
      </div>
      {children}
    </div>
  );
}

export function Kaart({ titel, toelichting, children, className = "" }: { titel?: string; toelichting?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-6 ${className}`}>
      {titel && (
        <header className="mb-4">
          <h2 className="text-h4">{titel}</h2>
          {toelichting && <p className="mt-0.5 text-body-sm text-text-muted">{toelichting}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function TrendPil({ verschil, omschrijving }: { verschil: number; omschrijving: string }) {
  const positief = verschil >= 0;
  const Pijl = positief ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-caption ${positief ? "bg-succes-bg text-succes-fg" : "bg-fout-bg text-fout-fg"}`}>
      <Pijl aria-hidden size={12} strokeWidth={2} />
      <span className="tabular-nums">{procent(Math.abs(verschil))}</span>
      <span className="font-normal">{omschrijving}</span>
    </span>
  );
}

export function KpiTegel({ label, waarde, verschil, vergelijking, toelichting }: { label: string; waarde: string; verschil?: number | undefined; vergelijking?: string; toelichting?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6">
      <p className="text-label text-text-muted">{label}</p>
      <p className="text-kpi">{waarde}</p>
      {verschil !== undefined && vergelijking && <TrendPil verschil={verschil} omschrijving={vergelijking} />}
      {toelichting && <p className="text-body-sm text-text-muted">{toelichting}</p>}
    </div>
  );
}

const statusStijl = {
  succes: "bg-succes-bg text-succes-fg",
  waarschuwing: "bg-waarschuwing-bg text-waarschuwing-fg",
  fout: "bg-fout-bg text-fout-fg",
  info: "bg-info-bg text-info-fg",
  accent: "bg-accent-subtle text-accent-text",
  inkt: "bg-inkt text-wit",
  neutraal: "bg-surface-sunken text-text-muted",
} as const;

export function Label({ soort, children }: { soort: keyof typeof statusStijl; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption ${statusStijl[soort]}`}>{children}</span>;
}

export function Melding({ titel, children, soort = "info" }: { titel: string; children: React.ReactNode; soort?: "info" | "fout" }) {
  return (
    <div role={soort === "fout" ? "alert" : "note"} className={`flex gap-3 rounded-lg border border-border p-4 ${soort === "fout" ? "bg-fout-bg text-fout-fg" : "bg-info-bg text-info-fg"}`}>
      <Info aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-label">{titel}</p>
        <p className="text-body-sm">{children}</p>
      </div>
    </div>
  );
}

export function LegeStaat({ icoon: Icoon, titel, children }: { icoon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; titel: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
      <Icoon size={40} strokeWidth={1.75} className="text-border-strong" />
      <h2 className="text-h4">{titel}</h2>
      <p className="max-w-md text-body text-text-muted">{children}</p>
    </div>
  );
}

const knopStijl = {
  primair: "bg-primary text-on-primary hover:bg-primary-hover",
  secundair: "border-[1.5px] border-primary bg-surface text-primary hover:bg-primary-subtle",
  ghost: "text-primary hover:bg-primary-subtle",
} as const;

/** Knop volgens BRAND.md §6: 40px hoog, radius md, Figtree 600. */
export function knopKlassen(soort: keyof typeof knopStijl = "primair", breed = false): string {
  return `inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-semibold transition-colors duration-150 ${knopStijl[soort]} ${breed ? "w-full" : ""}`;
}
