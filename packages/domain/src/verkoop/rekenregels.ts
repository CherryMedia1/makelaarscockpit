// Rekenregels voor de opbrengst van een verkoop, gelijk aan de Excel "Lijst verkochte woningen" van C&R (ADR-007).
// Alle ingevoerde bedragen zijn inclusief btw, net als in de Excel; "ex btw" is delen door 1,21.

export const BTW_TARIEF = 0.21;

/** Afgesproken courtage: een percentage van de verkoopprijs of een vast bedrag (incl. btw). */
export type Courtage = { soort: "percentage"; fractie: number } | { soort: "vast"; bedrag: number };

export type VerkoopInvoer = {
  /** Verkoopprijs (transactieprijs); null bij bijvoorbeeld een taxatie. */
  verkoopprijs: number | null;
  /** Afgesproken courtage; null als er geen courtage is, zoals bij een taxatie. */
  courtage: Courtage | null;
  /** Opstartnota of vaste nota (incl. btw); 0 als die er niet is, negatief bij een verrekening. */
  opstartnota: number;
  /** Aandeel van de makelaar in deze verkoop: 1 voor volledig, 0,5 bij een gedeelde verkoop. */
  aandeel: number;
};

export type VerkoopUitkomst = {
  /** Courtage incl. btw, vóór verdeling. */
  courtage: number;
  /** (Opstartnota + courtage) × aandeel, incl. btw. */
  omzetTotaal: number;
  /** Courtage excl. btw, vóór verdeling. */
  courtageExBtw: number;
  /** Omzet totaal excl. btw, ná verdeling: het bedrag dat op naam van de makelaar telt. */
  omzetTotaalExBtw: number;
  /** (Opstartnota + courtage) excl. btw, vóór verdeling: de omzet van het kantoor op deze verkoop. */
  omzetExBtwZonderAandeel: number;
};

function eisNietNegatief(naam: string, waarde: number): void {
  if (!Number.isFinite(waarde) || waarde < 0) throw new RangeError(`${naam} moet een getal van 0 of hoger zijn, kreeg ${waarde}`);
}

export function exBtw(bedragInclBtw: number): number {
  return bedragInclBtw / (1 + BTW_TARIEF);
}

export function courtageBedrag(invoer: Pick<VerkoopInvoer, "verkoopprijs" | "courtage">): number {
  const { verkoopprijs, courtage } = invoer;
  if (courtage === null) return 0;
  if (courtage.soort === "vast") {
    eisNietNegatief("courtage.bedrag", courtage.bedrag);
    return courtage.bedrag;
  }
  if (!Number.isFinite(courtage.fractie) || courtage.fractie < 0 || courtage.fractie >= 1) {
    throw new RangeError(`courtage.fractie moet tussen 0 en 1 liggen (1,3% = 0,013), kreeg ${courtage.fractie}`);
  }
  if (verkoopprijs === null) throw new RangeError("een courtagepercentage vereist een verkoopprijs");
  eisNietNegatief("verkoopprijs", verkoopprijs);
  return verkoopprijs * courtage.fractie;
}

export function berekenVerkoop(invoer: VerkoopInvoer): VerkoopUitkomst {
  if (!Number.isFinite(invoer.opstartnota)) throw new RangeError(`opstartnota moet een getal zijn, kreeg ${invoer.opstartnota}`);
  if (!Number.isFinite(invoer.aandeel) || invoer.aandeel <= 0 || invoer.aandeel > 1) {
    throw new RangeError(`aandeel moet groter dan 0 en hoogstens 1 zijn, kreeg ${invoer.aandeel}`);
  }
  const courtage = courtageBedrag(invoer);
  const omzetZonderAandeel = invoer.opstartnota + courtage;
  const omzetTotaal = omzetZonderAandeel * invoer.aandeel;
  return {
    courtage,
    omzetTotaal,
    courtageExBtw: exBtw(courtage),
    omzetTotaalExBtw: exBtw(omzetTotaal),
    omzetExBtwZonderAandeel: exBtw(omzetZonderAandeel),
  };
}
