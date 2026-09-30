// Notatie volgens BRAND.md §4: "€ 310.000", "12,5%", "3 okt. 2026".

const euroFormatter = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const decimaalFormatter = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const geheelFormatter = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const datumFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export function euro(bedrag: number): string {
  const teken = bedrag < 0 ? "-" : "";
  return `${teken}€ ${euroFormatter.format(Math.abs(Math.round(bedrag)))}`;
}

export function euroKort(bedrag: number): string {
  const abs = Math.abs(bedrag);
  if (abs >= 1_000_000) return `${bedrag < 0 ? "-" : ""}€ ${decimaalFormatter.format(abs / 1_000_000)} mln`;
  if (abs >= 1_000) return `${bedrag < 0 ? "-" : ""}€ ${geheelFormatter.format(abs / 1_000)}k`;
  return euro(bedrag);
}

export function getal(waarde: number): string {
  return geheelFormatter.format(waarde);
}

/** Aantal met hoogstens één decimaal, voor gedeelde verkopen die als een halve woning tellen. */
export function aantal(waarde: number): string {
  return Number.isInteger(waarde) ? geheelFormatter.format(waarde) : decimaalFormatter.format(waarde);
}

const maandJaarFormatter = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric" });
export function maandJaar(d: Date): string {
  return maandJaarFormatter.format(d);
}

export function procent(fractie: number, metTeken = false): string {
  const waarde = fractie * 100;
  const tekst = Number.isInteger(Math.round(waarde * 10) / 10) ? geheelFormatter.format(waarde) : decimaalFormatter.format(waarde);
  const teken = metTeken && waarde > 0 ? "+" : "";
  return `${teken}${tekst}%`;
}

export function datum(d: Date): string {
  return datumFormatter.format(d);
}

export const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;
