// Eén stap van de checklist als klein statusteken, met de betekenis als tekst voor schermlezers en als tooltip.
import { Check, Circle, Clock, Minus } from "lucide-react";
import type { StapUitkomst } from "@makelaarscockpit/domain";
import { datum } from "@/lib/format";

const d = (iso: string) => datum(new Date(`${iso}T00:00:00`));

export function stapOmschrijving(label: string, s: StapUitkomst): string {
  const bron = s.bron === "realworks" ? " (uit Realworks)" : "";
  if (s.status === "klaar") return `${label}: klaar${s.datum ? ` op ${d(s.datum)}` : ""}${bron}`;
  if (s.status === "nvt") return `${label}: niet van toepassing`;
  if (s.status === "gepland") return `${label}: gepland${s.datum ? ` op ${d(s.datum)}` : ""}${s.teLaat ? ", datum is voorbij" : ""}${bron}`;
  return `${label}: open`;
}

export function StapTeken({ label, stap }: { label: string; stap: StapUitkomst }) {
  const tekst = stapOmschrijving(label, stap);
  const stijl =
    stap.status === "klaar" ? "bg-succes-bg text-succes-fg"
    : stap.status === "nvt" ? "bg-surface-sunken text-text-muted"
    : stap.status === "gepland" ? (stap.teLaat ? "bg-waarschuwing-bg text-waarschuwing-fg" : "bg-info-bg text-info-fg")
    : "border border-border-strong text-border-strong";
  const Icoon = stap.status === "klaar" ? Check : stap.status === "nvt" ? Minus : stap.status === "gepland" ? Clock : Circle;
  return (
    <span title={tekst} className={`inline-flex size-6 items-center justify-center rounded-full ${stijl}`}>
      <Icoon aria-hidden size={14} strokeWidth={2.25} className={stap.status === "open" ? "opacity-0" : ""} />
      <span className="sr-only">{tekst}</span>
    </span>
  );
}
