// Formulierelementen volgens BRAND.md §6: label boven het veld, veld 40px met rand border-strong, focus in petrol,
// foutmelding in fout-fg onder het veld met icoon. Geen hooks, dus bruikbaar in server- én clientcomponenten.
import { CircleAlert } from "lucide-react";

const veldKlassen = "h-10 w-full rounded-md border bg-surface px-3 text-body text-text outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:bg-surface-sunken disabled:text-text-muted";

export const invoerKlassen = (fout?: string) => `${veldKlassen} ${fout ? "border-fout-base" : "border-border-strong"}`;

export function Veld({ id, label, fout, hint, children }: { id: string; label: string; fout?: string | undefined; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      {children}
      {hint && !fout && <p className="text-caption text-text-muted">{hint}</p>}
      {fout && <Foutregel id={`${id}-fout`}>{fout}</Foutregel>}
    </div>
  );
}

export function Foutregel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-body-sm text-fout-fg">
      <CircleAlert aria-hidden size={16} strokeWidth={2} className="shrink-0" />
      {children}
    </p>
  );
}

type InvoerProps = React.InputHTMLAttributes<HTMLInputElement> & { fout?: string | undefined };

export function Invoer({ fout, className = "", ...rest }: InvoerProps) {
  return <input {...rest} aria-invalid={fout ? true : undefined} aria-describedby={fout && rest.id ? `${rest.id}-fout` : undefined} className={`${invoerKlassen(fout)} ${className}`} />;
}

type KeuzeProps = React.SelectHTMLAttributes<HTMLSelectElement> & { fout?: string | undefined };

export function Keuze({ fout, className = "", children, ...rest }: KeuzeProps) {
  return (
    <select {...rest} aria-invalid={fout ? true : undefined} className={`${invoerKlassen(fout)} ${className}`}>
      {children}
    </select>
  );
}

export function Selectievakje({ id, label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <label htmlFor={id} className="flex h-10 items-center gap-2.5 text-body">
      <input id={id} type="checkbox" {...rest} className="size-4 rounded-sm border-border-strong accent-primary focus:ring-2 focus:ring-focus focus:ring-offset-2" />
      {label}
    </label>
  );
}
