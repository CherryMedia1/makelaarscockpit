// Het woningprofiel ter beoordeling (stap A8): leesbare veldnamen, ordening per groep in de volgorde van het schema,
// conflicten apart, en het lezen van een correctie volgens het schema. De beoordeling zelf staat in packages/db.
import { groepTitel, labelVan, leesInvoer, sectieVan } from "./formulier";
import { bladen, woningprofielSchema, type JsonSchema } from "./schema";

const TOKENS = /([^.[\]]+)|\[(\d+)\]/g;
const generiek = (pad: string) => pad.replace(/\[\d+\]/g, "[]");

/** Leesbare naam van een veld, bijv. `keuken.apparatuur[1].soort` → "Keuken › Apparatuur 2 › Soort". */
export function padLabel(pad: string): string {
  const delen: string[] = [];
  let s: JsonSchema | undefined = woningprofielSchema;
  let vorige = "";
  for (const [, naam, index] of pad.matchAll(TOKENS)) {
    if (!s) return pad;
    if (naam !== undefined) {
      s = s.properties?.[naam];
      if (!s) return pad;
      delen.push(delen.length === 0 ? groepTitel(naam) : s.type === "object" ? sectieVan(naam, s) : labelVan(naam));
      vorige = naam;
    } else {
      const items: JsonSchema | undefined = s.items;
      // Een lijst met items direct onder de groep (sanitair, indeling) krijgt een eigen deel: "Sanitair › Sanitair 1".
      if (delen.length === 1 && items?.type === "object") delen.push(`${labelVan(vorige)} ${Number(index) + 1}`);
      else delen[delen.length - 1] += ` ${Number(index) + 1}`;
      s = items;
    }
  }
  return delen.join(" › ");
}

const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2, useGrouping: false });

/** Een waarde zoals een medewerker hem leest: ja/nee, getallen met komma. */
export function toonWaarde(waarde: unknown): string {
  if (waarde === true) return "ja";
  if (waarde === false) return "nee";
  if (typeof waarde === "number") return getal.format(waarde);
  return String(waarde ?? "");
}

const ALLE_BLADEN = new Map(bladen().map((b) => [b.pad, b.schema]));

/** Leest een correctie voor één veld volgens het schema van dat pad. */
export function leesVeldwaarde(pad: string, tekst: string): { waarde: unknown } | { melding: string } {
  const schema = ALLE_BLADEN.get(generiek(pad));
  if (!schema) return { melding: "Onbekend veld." };
  if (tekst.trim() === "") return { melding: "Vul een waarde in, of wijs het veld af." };
  return leesInvoer(schema, tekst.trim());
}

type Status = "voorstel" | "bevestigd" | "conflict" | "afgewezen";

export interface VeldOverzicht<R> {
  pad: string;
  label: string;
  /** Conflict als er een conflict is, anders voorstel als er nog iets te beoordelen is, anders bevestigd. */
  status: Exclude<Status, "afgewezen">;
  rijen: R[];
}

const VOLGORDE = new Map(bladen().map((b, i) => [b.pad, i]));
const GROEPEN = Object.keys(woningprofielSchema.properties ?? {});

function vergelijkPaden(a: string, b: string): number {
  const verschil = (VOLGORDE.get(generiek(a)) ?? Infinity) - (VOLGORDE.get(generiek(b)) ?? Infinity);
  if (verschil !== 0 && Number.isFinite(verschil)) return verschil;
  const ia = [...a.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const ib = [...b.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) if ((ia[i] ?? -1) !== (ib[i] ?? -1)) return (ia[i] ?? -1) - (ib[i] ?? -1);
  return a.localeCompare(b);
}

/**
 * Ordent de velden van een dossier voor de beoordeling: conflicten apart (bovenaan te tonen), de rest per groep in de
 * volgorde van het schema. Afgewezen waarden vallen weg; `teBeoordelen` telt de velden met een voorstel of conflict.
 */
export function profielOverzicht<R extends { pad: string; status: Status }>(rijen: readonly R[]): {
  conflicten: VeldOverzicht<R>[];
  groepen: { sleutel: string; titel: string; velden: VeldOverzicht<R>[] }[];
  teBeoordelen: number;
} {
  const perPad = new Map<string, R[]>();
  for (const r of rijen) if (r.status !== "afgewezen") perPad.set(r.pad, [...(perPad.get(r.pad) ?? []), r]);
  const velden = [...perPad.entries()]
    .sort(([a], [b]) => vergelijkPaden(a, b))
    .map(([pad, r]): VeldOverzicht<R> => ({
      pad,
      label: padLabel(pad),
      status: r.some((x) => x.status === "conflict") ? "conflict" : r.some((x) => x.status === "voorstel") ? "voorstel" : "bevestigd",
      rijen: r,
    }));
  const overig = velden.filter((v) => v.status !== "conflict");
  return {
    conflicten: velden.filter((v) => v.status === "conflict"),
    groepen: GROEPEN.map((sleutel) => ({ sleutel, titel: groepTitel(sleutel), velden: overig.filter((v) => v.pad.split(/[.[]/)[0] === sleutel) })).filter((g) => g.velden.length > 0),
    teBeoordelen: velden.filter((v) => v.status !== "bevestigd").length,
  };
}
