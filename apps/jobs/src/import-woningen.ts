// Import van het Excel-tabblad "Woningen in verkoop" (issue #10, ADR-012): de afgevinkte stappen per woning worden
// overgenomen voor woningen die Realworks op het bord heeft. Realworks is leidend: rijen zonder woning worden overgeslagen.
// Leest uit de blob-container `import` (of lokaal via IMPORT_BESTAND). Geen adressen of namen in de log.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { importeerWoningStappen, maakDb, metTenant, zoekTenant, type WoningImportRij } from "@makelaarscockpit/db";
import { excelCelNaarStap, type HandmatigeStap } from "@makelaarscockpit/domain";
import { leesBlob, omgeving } from "./azure";

type Cel = ExcelJS.CellValue;

function waarde(cel: Cel): string | Date | null {
  if (cel === null || cel === undefined) return null;
  if (cel instanceof Date) return new Date(Date.UTC(cel.getUTCFullYear(), cel.getUTCMonth(), cel.getUTCDate()));
  if (typeof cel !== "object") return String(cel);
  if ("result" in cel) return waarde(cel.result as Cel);
  if ("richText" in cel) return cel.richText.map((t) => t.text).join("");
  if ("text" in cel) return String(cel.text);
  return null;
}

/** Kolomkoppen in de Excel (los van hoofdletters en regeleinden) naar onze stappen. */
const KOLOMMEN: { stap: string; kop: RegExp }[] = [
  { stap: "fotos", kop: /^foto/ },
  { stap: "video", kop: /^woningvideo/ },
  { stap: "energielabel", kop: /^energie/ },
  { stap: "styling", kop: /^st[yi]l?ing/ },
  { stap: "tekst", kop: /^tekst/ },
  { stap: "woningzoeker", kop: /^won zoek/ },
  { stap: "socials", kop: /^socials/ },
  { stap: "funda", kop: /^funda/ },
  { stap: "reel", kop: /^reel/ },
  { stap: "bord", kop: /^bord/ },
  { stap: "verkoopgesprek", kop: /^verkoop gesprek/ },
];

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function importWoningen(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const inhoud = process.env.IMPORT_BESTAND
    ? await readFile(process.env.IMPORT_BESTAND)
    : await leesBlob("import", process.env.IMPORT_BLOB ?? `${tenantSleutel}/woningen.xlsx`);
  const werkboek = new ExcelJS.Workbook();
  await werkboek.xlsx.load(inhoud as unknown as ArrayBuffer);
  const blad = werkboek.worksheets.find((b) => /^woningen in verkoop/i.test(b.name.trim()));
  if (!blad) throw new Error('tabblad "Woningen in verkoop" niet gevonden');

  // De koprij is de eerste rij waarin de kolommen Makelaar en Backoffice staan.
  const kop = (rij: ExcelJS.Row, kolom: number) => String(waarde(rij.getCell(kolom).value) ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let koprij = 0;
  const kolom: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, blad.rowCount) && !koprij; r++) {
    const rij = blad.getRow(r);
    for (let c = 1; c <= blad.columnCount; c++) {
      const k = kop(rij, c);
      if (k === "makelaar") kolom.makelaar = c;
      else if (k === "backoffice") kolom.backoffice = c;
      else if (k.startsWith("volledig in verkoop")) kolom.adres = c;
      else for (const { stap, kop: patroon } of KOLOMMEN) if (patroon.test(k) && !kolom[stap]) kolom[stap] = c;
    }
    if (kolom.makelaar && kolom.adres) koprij = r;
  }
  const ontbreekt = KOLOMMEN.filter(({ stap }) => !kolom[stap]).map(({ stap }) => stap);
  if (!koprij) throw new Error("koprij met Makelaar en adreskolom niet gevonden");
  if (ontbreekt.length > 0) throw new Error(`kolommen niet gevonden voor: ${ontbreekt.join(", ")}`);

  const vandaag = vandaagInNederland();
  const rijen: WoningImportRij[] = [];
  blad.eachRow((rij, nummer) => {
    if (nummer <= koprij) return;
    const adres = waarde(rij.getCell(kolom.adres!).value);
    if (typeof adres !== "string" || !adres.trim()) return;
    const stappen: HandmatigeStap[] = [];
    for (const { stap } of KOLOMMEN) {
      const uitkomst = excelCelNaarStap(waarde(rij.getCell(kolom[stap]!).value), vandaag);
      if (uitkomst) stappen.push({ stap, ...uitkomst });
    }
    const backoffice = kolom.backoffice ? waarde(rij.getCell(kolom.backoffice).value) : null;
    rijen.push({ adres: adres.trim(), backoffice: typeof backoffice === "string" && backoffice.trim() ? backoffice.trim() : null, stappen });
  });
  const perStap = Object.fromEntries(KOLOMMEN.map(({ stap }) => [stap, rijen.filter((r) => r.stappen.some((s) => s.stap === stap)).length]));
  console.log(`rijen met een adres: ${rijen.length}; ingevulde stappen per kolom: ${JSON.stringify(perStap)}`);
  if (process.env.ALLEEN_CONTROLE === "1") {
    console.log("alleen controle: er is niets weggeschreven");
    return;
  }
  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);
    const u = await metTenant(db, tenant.id, (tx) => importeerWoningStappen(tx, tenant.id, "verkoop", rijen));
    console.log(
      `weggeschreven voor tenant ${tenant.sleutel}: ${u.gekoppeld} rijen gekoppeld aan een woning op het bord, ${u.nietGevonden} niet in Realworks en overgeslagen; ` +
        `${u.stappen} stappen overgenomen, ${u.backoffice} keer backoffice ingevuld`,
    );
  } finally {
    await db.end();
  }
}
