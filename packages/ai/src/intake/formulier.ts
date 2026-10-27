// Het digitale checklistformulier (stap A6), afgeleid uit het woningprofiel-schema: welke velden, welk soort invoer,
// en het omzetten van formulierinvoer naar waarden per pad. Het portaal tekent alleen wat hier uitkomt.
import { bladen, valideerBlad, woningprofielSchema, type JsonSchema } from "./schema";

export type Invoersoort = "tekst" | "getal" | "geheel" | "janee" | "keuze" | "regels";

export interface Formulierveld {
  /** Ook de `name` van het invoerveld, bijv. `keuken.apparatuur[1].merk` of `verkoopargumenten` (één regel per item). */
  pad: string;
  label: string;
  hint?: string;
  soort: Invoersoort;
  opties?: readonly string[];
  /** Kopje binnen de groep, bijv. "Cv-ketel" of "Apparatuur 2". */
  sectie?: string;
  /** Huidige waarde als tekst voor het formulier; ja/nee voor booleans, één regel per item voor lijsten. */
  waarde: string;
}

export interface Formuliergroep {
  sleutel: string;
  titel: string;
  velden: Formulierveld[];
}

const GROEP_TITEL: Record<string, string> = {
  object: "Woning",
  zaken: "Lijst van zaken",
};

// De indeling per verdieping komt uit het gesprek en het meetrapport; als formulier is ze te omslachtig.
const NIET_IN_CHECKLIST = new Set(["indeling"]);

const labelVan = (naam: string) => {
  const s = naam.replace(/_m2$/, " (m²)").replace(/_m3$/, " (m³)").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const sectieVan = (naam: string, s: JsonSchema) => (s.description && s.description.length <= 30 ? s.description.replace(/\.$/, "") : labelVan(naam));

const isObject = (s: JsonSchema) => s.type === "object";
const isObjectLijst = (s: JsonSchema) => s.type === "array" && s.items?.type === "object";
const isRegels = (s: JsonSchema) => s.type === "array" && s.items !== undefined && s.items.type !== "object";

function soortVan(s: JsonSchema): Invoersoort {
  if (isRegels(s)) return "regels";
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
  const regels = (pad: string) =>
    huidig
      .map((v) => ({ m: new RegExp(`^${pad.replace(/[.[\]]/g, "\\$&")}\\[(\\d+)\\]$`).exec(v.pad), waarde: v.waarde }))
      .filter((v) => v.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
      .map((v) => alsTekst(v.waarde))
      .join("\n");
  const rijen = (lijst: string) => {
    const prefix = `${lijst}[`;
    const indexen = [...new Set(huidig.filter((v) => v.pad.startsWith(prefix)).map((v) => Number(/^\d+/.exec(v.pad.slice(prefix.length))?.[0])))].filter(Number.isInteger).sort((a, b) => a - b);
    return [...indexen, indexen.length === 0 ? 0 : Math.max(...indexen) + 1];
  };

  const velden = (s: JsonSchema, pad: string, naam: string, sectie: string | undefined): Formulierveld[] => {
    if (isObject(s)) {
      return Object.entries(s.properties ?? {}).flatMap(([sub, subSchema]) =>
        velden(subSchema, pad ? `${pad}.${sub}` : sub, sub, isObject(subSchema) ? sectieVan(sub, subSchema) : sectie),
      );
    }
    if (isObjectLijst(s)) return rijen(pad).flatMap((i) => velden(s.items!, `${pad}[${i}]`, naam, `${labelVan(naam)} ${i + 1}`));
    const soort = soortVan(s);
    return [{
      pad,
      label: labelVan(naam),
      soort,
      waarde: soort === "regels" ? regels(pad) : alsTekst(waarden.get(pad)),
      ...(s.description && !isObject(s) ? { hint: s.description } : {}),
      ...(s.enum ? { opties: s.enum.map(String) } : {}),
      ...(sectie ? { sectie } : {}),
    }];
  };

  return Object.entries(woningprofielSchema.properties ?? {})
    .filter(([sleutel]) => !NIET_IN_CHECKLIST.has(sleutel))
    .map(([sleutel, s]) => ({ sleutel, titel: GROEP_TITEL[sleutel] ?? labelVan(sleutel), velden: velden(s, sleutel, sleutel, undefined) }));
}

const BLADEN = new Map(bladen().filter((b) => !NIET_IN_CHECKLIST.has(b.groep)).map((b) => [b.pad, b.schema]));

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
 * overgeslagen; een lijst met regels wordt één item per niet-lege regel.
 */
export function leesChecklistFormulier(invoer: Iterable<[string, unknown]>): { velden: { pad: string; waarde: unknown }[]; fouten: { pad: string; melding: string }[] } {
  const velden: { pad: string; waarde: unknown }[] = [];
  const fouten: { pad: string; melding: string }[] = [];
  for (const [naam, ruw] of invoer) {
    if (typeof ruw !== "string") continue;
    const generiek = naam.replace(/\[\d+\]/g, "[]");
    const blad = BLADEN.get(generiek);
    const item = BLADEN.get(`${generiek}[]`);
    const items = blad ? [[naam, ruw.trim()] as const] : item ? ruw.split("\n").map((r) => r.trim()).filter(Boolean).map((r, i) => [`${naam}[${i}]`, r] as const) : [];
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
