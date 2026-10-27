// Het woningprofiel-schema als enige bron van waarheid (ADR-013): validatie, het extractieschema voor het model,
// de lijst met bladvelden voor formulier en review, en de omzetting van modeloutput naar veldvoorstellen.
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import schemaJson from "./woningprofiel.schema.json" with { type: "json" };
import { citaatKomtVoor } from "./extractie";
import type { Woningprofiel } from "./woningprofiel";

export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  required?: string[];
  anyOf?: JsonSchema[];
}

export const woningprofielSchema = schemaJson as JsonSchema;

/** Waar een waarde vandaan komt: een citaat met tijdstempel (transcript) of pagina (PDF). */
export interface Bewijs {
  citaat: string;
  tijdstempel: string | null;
  pagina: number | null;
}

/** Eén voorgestelde waarde, klaar voor `intake_veld` met status `voorstel`. */
export interface Veldvoorstel {
  pad: string;
  waarde: unknown;
  bewijs: Bewijs;
  zekerheid: number;
}

/** Een bladveld uit het schema; in het pad staat `[]` voor een lijst, bijv. `keuken.apparatuur[].merk`. */
export interface Blad {
  pad: string;
  groep: string;
  schema: JsonSchema;
}

const ajv = new Ajv2020({ allErrors: true });
const valideerHeel = ajv.compile<Woningprofiel>(woningprofielSchema);

export function valideerProfiel(profiel: unknown): { geldig: true; profiel: Woningprofiel } | { geldig: false; fouten: string[] } {
  if (valideerHeel(profiel)) return { geldig: true, profiel };
  return { geldig: false, fouten: (valideerHeel.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message ?? ""}`.trim()) };
}

const isObject = (s: JsonSchema) => s.type === "object";
const isLijst = (s: JsonSchema) => s.type === "array" && s.items !== undefined;

export function bladen(schema: JsonSchema = woningprofielSchema, prefix = ""): Blad[] {
  if (isObject(schema)) {
    return Object.entries(schema.properties ?? {}).flatMap(([naam, sub]) => bladen(sub, prefix ? `${prefix}.${naam}` : naam));
  }
  if (isLijst(schema)) return bladen(schema.items!, `${prefix}[]`);
  return [{ pad: prefix, groep: prefix.split(/[.[]/)[0]!, schema }];
}

const BEWIJS_SCHEMA: JsonSchema = {
  type: "object",
  description: "Letterlijk citaat waaruit de waarde blijkt, met tijdstempel (mm:ss of uu:mm:ss) in het transcript of paginanummer in de PDF.",
  properties: {
    citaat: { type: "string" },
    tijdstempel: { anyOf: [{ type: "string" }, { type: "null" }] },
    pagina: { anyOf: [{ type: "integer" }, { type: "null" }] },
  },
  required: ["citaat", "tijdstempel", "pagina"],
  additionalProperties: false,
};

// Alleen trefwoorden die gestructureerde output in strikte modus ondersteunt; grenzen controleert valideerProfiel achteraf.
const kaleWaarde = ({ type, enum: e, description }: JsonSchema): JsonSchema => ({ ...(type ? { type } : {}), ...(e ? { enum: e } : {}), ...(description ? { description } : {}) });

function verpakBlad(blad: JsonSchema): JsonSchema {
  return {
    anyOf: [
      {
        type: "object",
        properties: { waarde: kaleWaarde(blad), bewijs: BEWIJS_SCHEMA, zekerheid: { type: "number", description: "Zekerheid tussen 0 en 1." } },
        required: ["waarde", "bewijs", "zekerheid"],
        additionalProperties: false,
      },
      { type: "null" },
    ],
  };
}

/**
 * Schema voor de extractie-output van het model (gestructureerde output, strikte modus): elk blad wordt
 * `{ waarde, bewijs, zekerheid }` of null als de bron er niets over zegt. Alle eigenschappen zijn verplicht.
 */
export function extractieSchema(schema: JsonSchema = woningprofielSchema): JsonSchema {
  if (isObject(schema)) {
    const properties = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([naam, sub]) => [naam, extractieSchema(sub)]));
    return { type: "object", ...(schema.description ? { description: schema.description } : {}), properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (isLijst(schema)) return { type: "array", ...(schema.description ? { description: schema.description } : {}), items: extractieSchema(schema.items!) };
  return verpakBlad(schema);
}

const bladValidatie = new Map<JsonSchema, ValidateFunction>();
export const valideerBlad = (schema: JsonSchema, waarde: unknown): boolean => {
  let v = bladValidatie.get(schema);
  if (!v) bladValidatie.set(schema, (v = ajv.compile(schema)));
  return v(waarde);
};

export type Weggooireden = "geen bewijs" | "citaat niet in bron" | "ongeldige waarde";

/**
 * Zet extractie-output om in veldvoorstellen met concrete paden (`indeling[0].ruimtes[1].naam`).
 * Een blad zonder citaat of met een waarde die niet aan het schema voldoet, wordt weggegooid; met `brontekst` ook een
 * blad waarvan het citaat niet letterlijk in de bron staat (verzonnen bewijs). De reden komt terug met alleen het pad,
 * zodat het gelogd kan worden zonder inhoud.
 */
export function naarVeldvoorstellen(extractie: unknown, schema: JsonSchema = woningprofielSchema, brontekst?: string): { voorstellen: Veldvoorstel[]; weggegooid: { pad: string; reden: Weggooireden }[] } {
  const voorstellen: Veldvoorstel[] = [];
  const weggegooid: { pad: string; reden: Weggooireden }[] = [];

  const loop = (s: JsonSchema, data: unknown, pad: string) => {
    if (data === null || data === undefined) return;
    if (isObject(s)) {
      if (typeof data !== "object") return;
      for (const [naam, sub] of Object.entries(s.properties ?? {})) loop(sub, (data as Record<string, unknown>)[naam], pad ? `${pad}.${naam}` : naam);
      return;
    }
    if (isLijst(s)) {
      if (Array.isArray(data)) data.forEach((item, i) => loop(s.items!, item, `${pad}[${i}]`));
      return;
    }
    const blad = data as Partial<Veldvoorstel>;
    if (blad.waarde === null || blad.waarde === undefined) return;
    if (!blad.bewijs || typeof blad.bewijs.citaat !== "string" || blad.bewijs.citaat.trim() === "") {
      weggegooid.push({ pad, reden: "geen bewijs" });
      return;
    }
    if (brontekst !== undefined && !citaatKomtVoor(brontekst, blad.bewijs.citaat)) {
      weggegooid.push({ pad, reden: "citaat niet in bron" });
      return;
    }
    if (!valideerBlad(s, blad.waarde)) {
      weggegooid.push({ pad, reden: "ongeldige waarde" });
      return;
    }
    const zekerheid = typeof blad.zekerheid === "number" ? Math.min(1, Math.max(0, blad.zekerheid)) : 0;
    voorstellen.push({ pad, waarde: blad.waarde, bewijs: { citaat: blad.bewijs.citaat, tijdstempel: blad.bewijs.tijdstempel ?? null, pagina: blad.bewijs.pagina ?? null }, zekerheid });
  };

  loop(schema, extractie, "");
  return { voorstellen, weggegooid };
}

/** Bouwt een profiel uit velden met concrete paden, bijv. de bevestigde velden van een dossier. */
export function profielUitVelden(velden: readonly { pad: string; waarde: unknown }[]): Woningprofiel {
  const profiel: Record<string, unknown> = {};
  for (const { pad, waarde } of velden) {
    const stukken = pad.match(/[^.[\]]+/g) ?? [];
    let plek: Record<string, unknown> | unknown[] = profiel;
    stukken.forEach((stuk, i) => {
      const sleutel = /^\d+$/.test(stuk) ? Number(stuk) : stuk;
      const laatste = i === stukken.length - 1;
      const doel = plek as Record<string | number, unknown>;
      if (laatste) {
        doel[sleutel] = waarde;
      } else {
        doel[sleutel] ??= /^\d+$/.test(stukken[i + 1]!) ? [] : {};
        plek = doel[sleutel] as Record<string, unknown> | unknown[];
      }
    });
  }
  // Lijsten met gaten (bijv. alleen indeling[2] bevestigd) worden aaneengesloten.
  const dicht = (w: unknown): unknown => (Array.isArray(w) ? w.filter((x) => x !== undefined).map(dicht) : w && typeof w === "object" ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, dicht(v)])) : w);
  return dicht(profiel) as Woningprofiel;
}
