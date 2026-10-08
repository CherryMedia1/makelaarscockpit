// Import van de Excel-tabbladen "Woningen in verkoop" en "Status kovks" (issue #10, ADR-012): de afgevinkte stappen per
// woning worden overgenomen voor woningen die Realworks op het bord heeft. Realworks is leidend: rijen zonder woning
// worden overgeslagen.
// Leest uit de blob-container `import` (of lokaal via IMPORT_BESTAND). Geen adressen of namen in de log.
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { importeerWoningStappen, maakDb, metTenant, zoekTenant, type WoningImportRij } from "@makelaarscockpit/db";
import { excelCelNaarStap, type HandmatigeStap, type Spoor } from "@makelaarscockpit/domain";
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

type Kolom = { stap: string; kop: RegExp };
type Blad = { spoor: Spoor; naam: RegExp; adres: RegExp; backoffice: boolean; kolommen: Kolom[] };

/** Kolomkoppen in de Excel (los van hoofdletters en regeleinden) naar onze stappen. */
const BLADEN: Blad[] = [
  {
    spoor: "verkoop", naam: /^woningen in verkoop/i, adres: /^volledig in verkoop/, backoffice: true,
    kolommen: [
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
    ],
  },
  {
    spoor: "kovk", naam: /^status kovk/i, adres: /^adres$/, backoffice: false,
    kolommen: [
      { stap: "toegang_move", kop: /^toegang move/ },
      { stap: "bieders_afgebeld", kop: /^bieders afgebeld/ },
      { stap: "kovk_opgemaakt", kop: /^kovk opgemaakt/ },
      { stap: "kovk_akkoord", kop: /^kovk akkoord/ },
      { stap: "kovk_getekend", kop: /^getekend/ },
      { stap: "bedenktijd", kop: /^bedenktijd/ },
    ],
  },
];

const vandaagInNederland = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function leesBlad(blad: ExcelJS.Worksheet, def: Blad, vandaag: string): WoningImportRij[] {
  // De koprij is de eerste rij waarin de adreskolom en alle stappen staan.
  const kop = (rij: ExcelJS.Row, kolom: number) => String(waarde(rij.getCell(kolom).value) ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let koprij = 0;
  let kolom: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, blad.rowCount) && !koprij; r++) {
    const rij = blad.getRow(r);
    kolom = {};
    for (let c = 1; c <= blad.columnCount; c++) {
      const k = kop(rij, c);
      if (k === "backoffice") kolom.backoffice = c;
      else if (def.adres.test(k)) kolom.adres = c;
      else for (const { stap, kop: patroon } of def.kolommen) if (patroon.test(k) && !kolom[stap]) kolom[stap] = c;
    }
    if (kolom.adres) koprij = r;
  }
  if (!koprij) throw new Error(`tabblad "${blad.name}": koprij met de adreskolom niet gevonden`);
  const ontbreekt = def.kolommen.filter(({ stap }) => !kolom[stap]).map(({ stap }) => stap);
  if (ontbreekt.length > 0) throw new Error(`tabblad "${blad.name}": kolommen niet gevonden voor: ${ontbreekt.join(", ")}`);

  const rijen: WoningImportRij[] = [];
  blad.eachRow((rij, nummer) => {
    if (nummer <= koprij) return;
    const adres = waarde(rij.getCell(kolom.adres!).value);
    if (typeof adres !== "string" || !adres.trim()) return;
    const stappen: HandmatigeStap[] = [];
    for (const { stap } of def.kolommen) {
      const uitkomst = excelCelNaarStap(waarde(rij.getCell(kolom[stap]!).value), vandaag);
      if (uitkomst) stappen.push({ stap, ...uitkomst });
    }
    const backoffice = def.backoffice && kolom.backoffice ? waarde(rij.getCell(kolom.backoffice).value) : null;
    rijen.push({ adres: adres.trim(), backoffice: typeof backoffice === "string" && backoffice.trim() ? backoffice.trim() : null, stappen });
  });
  const perStap = Object.fromEntries(def.kolommen.map(({ stap }) => [stap, rijen.filter((r) => r.stappen.some((s) => s.stap === stap)).length]));
  console.log(`tabblad ${def.spoor}: rijen met een adres: ${rijen.length}; ingevulde stappen per kolom: ${JSON.stringify(perStap)}`);
  return rijen;
}

export async function importWoningen(): Promise<void> {
  const tenantSleutel = omgeving("TENANT_SLEUTEL");
  const inhoud = process.env.IMPORT_BESTAND
    ? await readFile(process.env.IMPORT_BESTAND)
    : await leesBlob("import", process.env.IMPORT_BLOB ?? `${tenantSleutel}/woningen.xlsx`);
  const werkboek = new ExcelJS.Workbook();
  await werkboek.xlsx.load(inhoud as unknown as ArrayBuffer);
  const vandaag = vandaagInNederland();
  const perSpoor: { spoor: Spoor; rijen: WoningImportRij[] }[] = [];
  for (const def of BLADEN) {
    const blad = werkboek.worksheets.find((b) => def.naam.test(b.name.trim()));
    if (!blad) throw new Error(`tabblad voor ${def.spoor} niet gevonden`);
    perSpoor.push({ spoor: def.spoor, rijen: leesBlad(blad, def, vandaag) });
  }
  if (process.env.ALLEEN_CONTROLE === "1") {
    console.log("alleen controle: er is niets weggeschreven");
    return;
  }
  const db = maakDb();
  try {
    const tenant = await zoekTenant(db, tenantSleutel);
    for (const { spoor, rijen } of perSpoor) {
      const u = await metTenant(db, tenant.id, (tx) => importeerWoningStappen(tx, tenant.id, spoor, rijen));
      console.log(
        `${spoor}, tenant ${tenant.sleutel}: ${u.gekoppeld} rijen gekoppeld aan een woning op het bord, ${u.nietGevonden} niet in Realworks en overgeslagen; ` +
          `${u.stappen} stappen overgenomen, ${u.backoffice} keer backoffice ingevuld`,
      );
    }
  } finally {
    await db.end();
  }
}
