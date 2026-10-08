// Eenmalige import van het Excel-tabblad "Waardebepaallijst <jaar>" (issue #9): de uitkomst per waardebepaling
// (gewonnen, verloren, ...) uit de Excel wordt gekoppeld aan de agendapunten uit Realworks op datum en adres.
// Leest uit de blob-container `import` (of lokaal via IMPORT_BESTAND). Geen adressen of namen in de log.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { importeerWaardebepalingen, maakDb, metTenant, zoekTenant } from "@makelaarscockpit/db";
import { excelRijNaarWaardebepaling, type ExcelWaardebepalingRij, type WaardebepalingImport } from "@makelaarscockpit/domain";
import { leesBlob, omgeving } from "./azure";

const BRON = "waardebepaallijst-excel";

type Cel = ExcelJS.CellValue;

function waarde(cel: Cel): string | number | Date | boolean | null {
  if (cel === null || cel === undefined) return null;
  if (cel instanceof Date || typeof cel !== "object") return cel;
  if ("result" in cel) return waarde(cel.result as Cel);
  if ("richText" in cel) return cel.richText.map((t) => t.text).join("");
  if ("text" in cel) return String(cel.text);
  return null;
}
const tekst = (cel: Cel): string | null => {
  const w = waarde(cel);
  return w === null || w instanceof Date ? null : String(w);
};
const datum = (cel: Cel): Date | null => {
  const w = waarde(cel);
  if (w instanceof Date) return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  if (typeof w === "number" && w > 20000 && w < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(w) * 86_400_000);
  return null;
};

export async function importWaardebepalingen(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const inhoud = process.env.IMPORT_BESTAND
    ? await readFile(process.env.IMPORT_BESTAND)
    : await leesBlob("import", process.env.IMPORT_BLOB ?? `${tenantSleutel}/waardebepalingen.xlsx`);
  const werkboek = new ExcelJS.Workbook();
  await werkboek.xlsx.load(inhoud as unknown as ArrayBuffer);
  const bladen = werkboek.worksheets.filter((b) => /^waardebepaallijst/i.test(b.name.trim()));
  if (bladen.length === 0) throw new Error('geen tabblad "Waardebepaallijst ..." gevonden');

  const regels: WaardebepalingImport[] = [];
  const fouten: string[] = [];
  let overgeslagen = 0;
  for (const blad of bladen) {
    blad.eachRow((rij, nummer) => {
      if (nummer === 1) return;
      const cel = (kolom: string) => rij.getCell(kolom).value;
      const excelRij: ExcelWaardebepalingRij = {
        rij: nummer, datum: datum(cel("A")), makelaar: tekst(cel("C")), adres: tekst(cel("D")), plaats: tekst(cel("E")),
        status: tekst(cel("F")), verlorenAan: tekst(cel("G")), via: tekst(cel("H")),
      };
      try {
        const regel = excelRijNaarWaardebepaling(excelRij);
        if (regel) regels.push(regel);
        else overgeslagen += 1;
      } catch (fout) {
        fouten.push(`${blad.name}: ${fout instanceof Error ? fout.message : String(fout)}`);
      }
    });
  }
  console.log(`tabbladen: ${bladen.length}; regels: ${regels.length}; zonder datum of adres overgeslagen: ${overgeslagen}; fouten: ${fouten.length}`);
  if (fouten.length > 0) {
    for (const fout of fouten.slice(0, 20)) console.error(`  ${fout}`);
    throw new Error("import afgebroken: los de fouten in de Excel op en probeer opnieuw");
  }
  const perStatus = new Map<string, number>();
  for (const r of regels) perStatus.set(r.status, (perStatus.get(r.status) ?? 0) + 1);
  console.log(`per status: ${JSON.stringify(Object.fromEntries(perStatus))}`);
  if (process.env.ALLEEN_CONTROLE === "1") {
    console.log("alleen controle: er is niets weggeschreven");
    return;
  }
  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);
    const uitkomst = await metTenant(db, tenant.id, (tx) => importeerWaardebepalingen(tx, tenant.id, BRON, regels));
    console.log(`weggeschreven voor tenant ${tenant.sleutel}: ${uitkomst.gekoppeld} gekoppeld aan een agendapunt uit Realworks, ${uitkomst.toegevoegd} als eigen regel toegevoegd`);
  } finally {
    await db.end();
  }
}
