// Het digitale checklistformulier (stap A6), afgeleid uit het woningprofiel-schema: welke velden, welk soort invoer,
// en het omzetten van formulierinvoer naar waarden per pad. Het portaal tekent alleen wat hier uitkomt.
import { bladen, valideerBlad, woningprofielSchema, type JsonSchema } from "./schema";

export type Invoersoort = "tekst" | "getal" | "geheel" | "janee" | "keuze" | "regels" | "meerkeuze";

export interface Formulierveld {
  /**
   * Ook de `name` van het invoerveld, bijv. `keuken.apparatuur[1].merk`, `verkoopargumenten` (één regel per item) of
   * `object.tuin.kenmerken` (meerkeuze: één aangekruiste waarde per invoer met deze naam).
   */
  pad: string;
  label: string;
  hint?: string;
  soort: Invoersoort;
  opties?: readonly string[];
  /** Kopje binnen de groep, bijv. "Cv-ketel" of "Apparatuur 2". */
  sectie?: string;
  /** Huidige waarde als tekst voor het formulier; ja/nee voor booleans, één regel per item voor lijsten. */
  waarde: string;
  /** Bij meerkeuze: de aangekruiste opties. */
  gekozen?: string[];
}

export interface Formuliergroep {
  sleutel: string;
  titel: string;
  velden: Formulierveld[];
}

// Titels en volgorde volgen het papieren intakeformulier van C&R; de volgorde zelf staat in het schema.
const GROEP_TITEL: Record<string, string> = {
  object: "Woning",
  indeling: "Verdiepingen",
  gebreken: "Gebreken en asbest",
  vve: "VvE",
  zaken: "Lijst van zaken",
};

// De losse ruimtes per verdieping komen uit het gesprek en het meetrapport; als formulier is dat te omslachtig.
const NIET_IN_CHECKLIST = new Set(["indeling[].ruimtes"]);
const generiek = (pad: string) => pad.replace(/\[\d+\]/g, "[]");
const uitgesloten = (pad: string) => [...NIET_IN_CHECKLIST].some((p) => generiek(pad) === p || generiek(pad).startsWith(`${p}[]`) || generiek(pad).startsWith(`${p}.`));

const labelVan = (naam: string) => {
  const s = naam.replace(/_m2$/, " (m²)").replace(/_m3$/, " (m³)").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const sectieVan = (naam: string, s: JsonSchema) => (s.description && s.description.length <= 30 ? s.description.replace(/\.$/, "") : labelVan(naam));

const isObject = (s: JsonSchema) => s.type === "object";
const isObjectLijst = (s: JsonSchema) => s.type === "array" && s.items?.type === "object";
const isRegels = (s: JsonSchema) => s.type === "array" && s.items !== undefined && s.items.type !== "object";

function soortVan(s: JsonSchema): Invoersoort {
  if (isRegels(s)) return s.items!.enum ? "meerkeuze" : "regels";
  if (s.enum) return "keuze";
  if (s.type === "integer") return "geheel";
  if (s.type === "number") return "getal";
  if (s.type === "boolean") return "janee";
  return "tekst";
}

const alsTekst = (waarde: unknown) => (waarde === true ? "ja" : waarde === false ? "nee" : waarde === undefined || waarde === null ? "" : String(waarde));

/**
 * De groepen en velden van het checklistformulier, gevuld met `huidig` (velden met concrete paden, bijv. de eerdere
 * invoer van de checklist). Lijsten met items krijgen hun bestaande rijen plus één lege rij.
 */
export function checklistFormulier(huidig: readonly { pad: string; waarde: unknown }[]): Formuliergroep[] {
  const waarden = new Map(huidig.map((v) => [v.pad, v.waarde]));
  const items = (pad: string) =>
    huidig
      .map((v) => ({ m: new RegExp(`^${pad.replace(/[.[\]]/g, "\\$&")}\\[(\\d+)\\]$`).exec(v.pad), waarde: v.waarde }))
      .filter((v) => v.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
      .map((v) => alsTekst(v.waarde));
  const rijen = (lijst: string) => {
    const prefix = `${lijst}[`;
    const indexen = [...new Set(huidig.filter((v) => v.pad.startsWith(prefix)).map((v) => Number(/^\d+/.exec(v.pad.slice(prefix.length))?.[0])))].filter(Number.isInteger).sort((a, b) => a - b);
    return [...indexen, indexen.length === 0 ? 0 : Math.max(...indexen) + 1];
  };

  const velden = (s: JsonSchema, pad: string, naam: string, sectie: string | undefined): Formulierveld[] => {
    if (isObject(s)) {
      return Object.entries(s.properties ?? {})
        .filter(([sub]) => !uitgesloten(pad ? `${pad}.${sub}` : sub))
        .flatMap(([sub, subSchema]) => velden(subSchema, pad ? `${pad}.${sub}` : sub, sub, isObject(subSchema) ? sectieVan(sub, subSchema) : sectie));
    }
    if (isObjectLijst(s)) return rijen(pad).flatMap((i) => velden(s.items!, `${pad}[${i}]`, naam, `${labelVan(naam)} ${i + 1}`));
    const soort = soortVan(s);
    const lijst = soort === "regels" || soort === "meerkeuze" ? items(pad) : [];
    const opties = s.enum ?? s.items?.enum;
    return [{
      pad,
      label: labelVan(naam),
      soort,
      waarde: lijst.length > 0 ? lijst.join("\n") : alsTekst(waarden.get(pad)),
      ...(soort === "meerkeuze" ? { gekozen: lijst } : {}),
      ...(s.description && !isObject(s) ? { hint: s.description } : {}),
      ...(opties ? { opties: opties.map(String) } : {}),
      ...(sectie ? { sectie } : {}),
    }];
  };

  return Object.entries(woningprofielSchema.properties ?? {})
    .filter(([sleutel]) => !uitgesloten(sleutel))
    .map(([sleutel, s]) => ({ sleutel, titel: GROEP_TITEL[sleutel] ?? labelVan(sleutel), velden: velden(s, sleutel, sleutel, undefined) }));
}

const BLADEN = new Map(bladen().filter((b) => !uitgesloten(b.pad)).map((b) => [b.pad, b.schema]));

function lees(schema: JsonSchema, tekst: string): { waarde: unknown } | { melding: string } {
  let waarde: unknown = tekst;
  if (schema.enum) {
    if (!schema.enum.includes(tekst)) return { melding: "Kies een waarde uit de lijst." };
  } else if (schema.type === "integer" || schema.type === "number") {
    const getal = Number(tekst.replace(",", "."));
    if (schema.type === "integer" && !Number.isInteger(getal)) return { melding: "Vul een heel getal in." };
    if (!Number.isFinite(getal)) return { melding: "Vul een getal in." };
    waarde = getal;
  } else if (schema.type === "boolean") {
    if (tekst !== "ja" && tekst !== "nee") return { melding: "Kies ja of nee." };
    waarde = tekst === "ja";
  }
  if (valideerBlad(schema, waarde)) return { waarde };
  const { minimum: min, maximum: max } = schema;
  if (min !== undefined && max !== undefined) return { melding: `Vul een waarde van ${min} tot en met ${max} in.` };
  if (min !== undefined) return { melding: `Vul een waarde van minstens ${min} in.` };
  return { melding: "Ongeldige waarde." };
}

/**
 * Zet de invoer van het checklistformulier om naar waarden met concrete paden. Lege velden en onbekende namen worden
 * overgeslagen; een lijst met regels wordt één item per niet-lege regel, en bij meerkeuze telt elke invoer met dezelfde
 * naam als volgend item.
 */
export function leesChecklistFormulier(invoer: Iterable<[string, unknown]>): { velden: { pad: string; waarde: unknown }[]; fouten: { pad: string; melding: string }[] } {
  const velden: { pad: string; waarde: unknown }[] = [];
  const fouten: { pad: string; melding: string }[] = [];
  const volgende = new Map<string, number>();
  const nummer = (naam: string) => {
    const i = volgende.get(naam) ?? 0;
    volgende.set(naam, i + 1);
    return `${naam}[${i}]`;
  };
  for (const [naam, ruw] of invoer) {
    if (typeof ruw !== "string") continue;
    const blad = BLADEN.get(generiek(naam));
    const item = BLADEN.get(`${generiek(naam)}[]`);
    const regels = item ? (item.enum ? [ruw.trim()] : ruw.split("\n").map((r) => r.trim())).filter(Boolean) : [];
    const items = blad ? [[naam, ruw.trim()] as const] : regels.map((r) => [nummer(naam), r] as const);
    const schema = (blad ?? item)!;
    for (const [pad, tekst] of items) {
      if (tekst === "") continue;
      const uitkomst = lees(schema, tekst);
      if ("waarde" in uitkomst) velden.push({ pad, waarde: uitkomst.waarde });
      else fouten.push({ pad: blad ? pad : naam, melding: uitkomst.melding });
    }
  }
  return { velden, fouten };
}
