// Eenmalige import van de Excel "Lijst verkochte woningen" als historie (issue #8, ADR-007).
// Leest het bestand uit de blob-container `import` (of lokaal via IMPORT_BESTAND) en controleert de totalen per jaar
// tegen de Excel zelf. Er worden geen adressen of namen gelogd, alleen rijnummers en totalen.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { maakDb, metTenant, vervangImport, zetOmzetdoelen, zoekTenant } from "@makelaarscockpit/db";
import { berekenVerkoop, excelRijNaarVerkoop, type Doel, type ExcelRij, type VerkoopRegel } from "@makelaarscockpit/domain";
import { leesBlob, omgeving } from "./azure";

const BRON = "verkooplijst-excel";
const TABBLAD = "Verkocht woningen";

type Cel = ExcelJS.CellValue;

/** De waarde van een cel; bij een formule het opgeslagen resultaat. */
function waarde(cel: Cel): string | number | Date | boolean | null {
  if (cel === null || cel === undefined) return null;
  if (cel instanceof Date || typeof cel !== "object") return cel;
  if ("result" in cel) return waarde(cel.result as Cel);
  if ("richText" in cel) return cel.richText.map((t) => t.text).join("");
  if ("text" in cel) return String(cel.text);
  return null;
}

const getal = (cel: Cel): number | null => {
  const w = waarde(cel);
  if (typeof w === "number" && Number.isFinite(w)) return w;
  if (typeof w === "string" && w.trim() !== "" && Number.isFinite(Number(w))) return Number(w);
  return null;
};
const tekst = (cel: Cel): string | null => {
  const w = waarde(cel);
  return w === null || w instanceof Date ? null : String(w);
};
const datum = (cel: Cel): Date | null => {
  const w = waarde(cel);
  if (w instanceof Date) return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  // Excel-datum als volgnummer (dagen sinds 30-12-1899).
  if (typeof w === "number" && w > 20000 && w < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(w) * 86_400_000);
  return null;
};

function leesRijen(blad: ExcelJS.Worksheet): { rijen: ExcelRij[]; excelOmzetPerJaar: Map<number, number> } {
  const rijen: ExcelRij[] = [];
  const excelOmzetPerJaar = new Map<number, number>();
  blad.eachRow((rij, nummer) => {
    if (nummer === 1) return;
    const cel = (kolom: string) => rij.getCell(kolom).value;
    const excelRij: ExcelRij = {
      rij: nummer,
      makelaar: tekst(cel("A")),
      aandeel: getal(cel("B")),
      type: tekst(cel("C")),
      adres: tekst(cel("D")),
      maandVerkocht: datum(cel("E")),
      maandPasseren: datum(cel("G")),
      passeerdatum: datum(cel("H")),
      nota: tekst(cel("I")),
      verkoopprijs: getal(cel("J")),
      afgesprokenCourtage: getal(cel("K")),
      opstartnota: getal(cel("L")),
      courtage: getal(cel("M")),
    };
    if (!excelRij.makelaar && !excelRij.adres && excelRij.verkoopprijs === null && getal(cel("N")) === null) return;
    rijen.push(excelRij);
    // Controlegetal: kolom N ("Omzet totaal") zoals de Excel die zelf heeft berekend, per jaar van verkoop.
    if (excelRij.maandVerkocht) {
      const jaar = excelRij.maandVerkocht.getUTCFullYear();
      excelOmzetPerJaar.set(jaar, (excelOmzetPerJaar.get(jaar) ?? 0) + (getal(cel("N")) ?? 0));
    }
  });
  return { rijen, excelOmzetPerJaar };
}

/** Doelstellingen staan in de Excel als getal in een formule: (C2-150000)/150000 op tabblad "Omzet per maand <jaar>". */
function leesDoelen(werkboek: ExcelJS.Workbook): Doel[] {
  const doelen: Doel[] = [];
  for (const blad of werkboek.worksheets) {
    const jaar = /^Omzet per maand (\d{4})$/.exec(blad.name.trim())?.[1];
    if (!jaar) continue;
    const cel = blad.getCell("E2").value;
    const formule = cel && typeof cel === "object" && "formula" in cel ? String(cel.formula) : "";
    const bedrag = /\(C2-(\d+(?:\.\d+)?)\)\/\1/.exec(formule)?.[1];
    if (!bedrag) continue;
    for (let maand = 1; maand <= 12; maand++) doelen.push({ jaar: Number(jaar), maand, waarde: Number(bedrag) });
  }
  return doelen;
}

const euro = (bedrag: number) => bedrag.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function importVerkooplijst(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const inhoud = process.env.IMPORT_BESTAND
    ? await readFile(process.env.IMPORT_BESTAND)
    : await leesBlob("import", process.env.IMPORT_BLOB ?? `${tenantSleutel}/verkooplijst.xlsx`);

  const werkboek = new ExcelJS.Workbook();
  await werkboek.xlsx.load(inhoud as unknown as ArrayBuffer);
  const blad = werkboek.getWorksheet(TABBLAD);
  if (!blad) throw new Error(`tabblad "${TABBLAD}" niet gevonden`);

  const { rijen, excelOmzetPerJaar } = leesRijen(blad);
  const regels: VerkoopRegel[] = [];
  const fouten: string[] = [];
  let overgeslagen = 0;
  for (const rij of rijen) {
    try {
      const regel = excelRijNaarVerkoop(rij);
      if (regel) regels.push(regel);
      else overgeslagen += 1;
    } catch (fout) {
      fouten.push(fout instanceof Error ? fout.message : String(fout));
    }
  }
  console.log(`rijen met inhoud: ${rijen.length}; omgezet: ${regels.length}; zonder verkoop- en passeermaand overgeslagen: ${overgeslagen}; fouten: ${fouten.length}`);
  if (fouten.length > 0) {
    for (const fout of fouten.slice(0, 20)) console.error(`  ${fout}`);
    throw new Error("import afgebroken: los de fouten in de Excel op en probeer opnieuw");
  }

  // Controle: onze rekenregels moeten per jaar van verkoop dezelfde omzet geven als kolom N in de Excel.
  const perJaar = new Map<number, { aantal: number; omzet: number; omzetExBtw: number }>();
  for (const regel of regels) {
    if (!regel.verkoopdatum) continue;
    const jaar = Number(regel.verkoopdatum.slice(0, 4));
    const totaal = perJaar.get(jaar) ?? perJaar.set(jaar, { aantal: 0, omzet: 0, omzetExBtw: 0 }).get(jaar)!;
    const uitkomst = berekenVerkoop(regel);
    totaal.aantal += 1;
    totaal.omzet += uitkomst.omzetTotaal;
    totaal.omzetExBtw += uitkomst.omzetTotaalExBtw;
  }
  let afwijking = false;
  console.log("jaar | regels | omzet incl. btw (berekend) | omzet incl. btw (Excel) | verschil | omzet excl. btw");
  for (const jaar of [...perJaar.keys()].sort()) {
    const t = perJaar.get(jaar)!;
    const excel = excelOmzetPerJaar.get(jaar) ?? 0;
    const verschil = t.omzet - excel;
    if (Math.abs(verschil) > 0.5) afwijking = true;
    console.log(`${jaar} | ${t.aantal} | ${euro(t.omzet)} | ${euro(excel)} | ${euro(verschil)} | ${euro(t.omzetExBtw)}`);
  }
  if (afwijking) throw new Error("import afgebroken: de berekende omzet wijkt af van de Excel");

  const doelen = leesDoelen(werkboek);
  console.log(`doelstellingen gevonden: ${doelen.length} maanden (${[...new Set(doelen.map((d) => d.jaar))].join(", ") || "geen"})`);

  if (process.env.ALLEEN_CONTROLE === "1") {
    console.log("alleen controle: er is niets weggeschreven");
    return;
  }
  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);
    await metTenant(db, tenant.id, async (tx) => {
      const aantal = await vervangImport(tx, tenant.id, BRON, regels);
      await zetOmzetdoelen(tx, tenant.id, doelen);
      console.log(`weggeschreven voor tenant ${tenant.sleutel}: ${aantal} verkoopregels, ${doelen.length} doelstellingen`);
    });
  } finally {
    await db.end();
  }
}
