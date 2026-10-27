// Samenvoegregels voor het woningprofiel (plan intake §6, ADR-013): welke bron wint, wanneer een verschil een conflict wordt,
// en hoe lijstitems van verschillende bronnen naast elkaar komen. Regels in code, niet in het model.

export type BronType = "plaud_transcript" | "plaud_note" | "gespreksverslag_pdf" | "checklist_form" | "checklist_pdf" | "meetrapport" | "bag" | "ep_online";
export type VeldStatus = "voorstel" | "bevestigd" | "conflict" | "afgewezen";

export interface Bron {
  id: string;
  type: BronType;
}

/** Een veld zoals het in `intake_veld` staat. */
export interface BestaandVeld {
  id: string;
  pad: string;
  waarde: unknown;
  status: VeldStatus;
  bronId: string;
  bronType: BronType;
}

export interface NieuwVeld {
  pad: string;
  waarde: unknown;
}

export type Overslaanreden = "zelfde waarde" | "al bevestigd" | "binnen drempel";

export type Besluit<T extends NieuwVeld> =
  | { soort: "toevoegen"; veld: T; status: "voorstel" | "conflict" }
  | { soort: "vervangen"; id: string; veld: T }
  | { soort: "markeerConflict"; id: string }
  | { soort: "overslaan"; pad: string; reden: Overslaanreden };

const PRIORITEIT: Record<BronType, number> = {
  meetrapport: 4,
  bag: 3,
  ep_online: 3,
  checklist_form: 2,
  checklist_pdf: 2,
  plaud_transcript: 1,
  plaud_note: 1,
  gespreksverslag_pdf: 1,
};

/** Meetrapport > BAG en EP-Online > checklist > gesprek. Dekt "oppervlaktes" en "merk en type" uit het plan in één volgorde. */
export const bronPrioriteit = (type: BronType): number => PRIORITEIT[type];

/** Relatief verschil dat bij oppervlakte (m²) en inhoud (m³) nog als dezelfde meting telt. */
export const DREMPEL_OPPERVLAK = 0.05;

const normaliseer = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function vergelijkWaarden(pad: string, a: unknown, b: unknown): "gelijk" | "binnen_drempel" | "verschil" {
  if (typeof a === "string" && typeof b === "string") return normaliseer(a) === normaliseer(b) ? "gelijk" : "verschil";
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return "gelijk";
    const relatief = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
    return /_m[23]$/.test(pad) && relatief <= DREMPEL_OPPERVLAK ? "binnen_drempel" : "verschil";
  }
  return JSON.stringify(a) === JSON.stringify(b) ? "gelijk" : "verschil";
}

/** Splitst `keuken.apparatuur[1].merk` in de buitenste lijst, de index en de rest. */
const LIJST = /^([^[]*)\[(\d+)\](.*)$/;

/**
 * Bepaalt per nieuw veld wat er met `intake_veld` moet gebeuren. Een bevestigd veld wordt nooit overschreven; een verschil
 * boven de drempel wordt een conflict, ook als de nieuwe bron sterker is, zodat een medewerker kiest.
 *
 * Lijstindexen van verschillende bronnen betekenen niets ten opzichte van elkaar: items uit een bron die nog niets in een
 * lijst heeft, komen achter de bestaande items. Een losse lijstwaarde (bijv. een verkoopargument) die er al staat, wordt overgeslagen.
 */
export function voegSamen<T extends NieuwVeld>(bestaand: readonly BestaandVeld[], bron: Bron, nieuw: readonly T[]): Besluit<T>[] {
  const levend = bestaand.filter((v) => v.status !== "afgewezen");
  const nieuweIndex = new Map<string, Map<string, number>>();
  const volgende = new Map<string, number>();

  const herschrijf = (veld: T): T | Overslaanreden => {
    const m = LIJST.exec(veld.pad);
    if (!m) return veld;
    const [, lijst, index, rest] = m as unknown as [string, string, string, string];
    const inLijst = bestaand.filter((v) => LIJST.exec(v.pad)?.[1] === lijst);
    if (inLijst.some((v) => v.bronId === bron.id)) return veld;
    if (rest === "" && levend.some((v) => LIJST.exec(v.pad)?.[1] === lijst && LIJST.exec(v.pad)?.[3] === "" && vergelijkWaarden(lijst, v.waarde, veld.waarde) === "gelijk")) {
      return "zelfde waarde";
    }
    if (!volgende.has(lijst)) volgende.set(lijst, Math.max(-1, ...inLijst.map((v) => Number(LIJST.exec(v.pad)![2]))) + 1);
    const indexen = nieuweIndex.get(lijst) ?? new Map<string, number>();
    nieuweIndex.set(lijst, indexen);
    if (!indexen.has(index)) {
      indexen.set(index, volgende.get(lijst)!);
      volgende.set(lijst, volgende.get(lijst)! + 1);
    }
    return { ...veld, pad: `${lijst}[${indexen.get(index)}]${rest}` };
  };

  const besluiten: Besluit<T>[] = [];
  for (const origineel of nieuw) {
    const veld = herschrijf(origineel);
    if (typeof veld === "string") {
      besluiten.push({ soort: "overslaan", pad: origineel.pad, reden: veld });
      continue;
    }
    const opPad = levend.filter((v) => v.pad === veld.pad);
    const vergelijk = (v: BestaandVeld) => vergelijkWaarden(veld.pad, v.waarde, veld.waarde);
    const prioriteit = bronPrioriteit(bron.type);

    const bevestigd = opPad.find((v) => v.status === "bevestigd");
    if (bevestigd) {
      const uitkomst = vergelijk(bevestigd);
      if (uitkomst === "verschil") besluiten.push({ soort: "toevoegen", veld, status: "conflict" });
      else besluiten.push({ soort: "overslaan", pad: veld.pad, reden: uitkomst === "gelijk" ? "al bevestigd" : "binnen drempel" });
      continue;
    }

    const open = opPad.filter((v) => v.status === "voorstel" || v.status === "conflict");
    const eigen = open.find((v) => v.bronId === bron.id);
    if (eigen) {
      besluiten.push(vergelijk(eigen) === "gelijk" ? { soort: "overslaan", pad: veld.pad, reden: "zelfde waarde" } : { soort: "vervangen", id: eigen.id, veld });
      continue;
    }
    if (open.length === 0) {
      besluiten.push({ soort: "toevoegen", veld, status: "voorstel" });
      continue;
    }

    const gelijk = open.find((v) => vergelijk(v) === "gelijk");
    if (gelijk) {
      besluiten.push(prioriteit > bronPrioriteit(gelijk.bronType) ? { soort: "vervangen", id: gelijk.id, veld } : { soort: "overslaan", pad: veld.pad, reden: "zelfde waarde" });
      continue;
    }

    const sterkste = open.reduce((a, b) => (bronPrioriteit(b.bronType) > bronPrioriteit(a.bronType) ? b : a));
    if (vergelijk(sterkste) === "binnen_drempel") {
      besluiten.push(prioriteit > bronPrioriteit(sterkste.bronType) ? { soort: "vervangen", id: sterkste.id, veld } : { soort: "overslaan", pad: veld.pad, reden: "binnen drempel" });
      continue;
    }
    for (const v of open) if (v.status === "voorstel") besluiten.push({ soort: "markeerConflict", id: v.id });
    besluiten.push({ soort: "toevoegen", veld, status: "conflict" });
  }
  return besluiten;
}
