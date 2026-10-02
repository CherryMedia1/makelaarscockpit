import { describe, expect, it } from "vitest";
import type { ObjectGegevens } from "../realworks-gegevens";
import { isVerkochtStatus, objectNaarVerkoop } from "./realworks-verkoop";

const object = (o: Partial<ObjectGegevens>): ObjectGegevens => ({
  realworksId: 10197032, objectcode: "123", afdelingscode: "935773",
  straat: "Voorbeeldstraat", huisnummer: "12", huisnummertoevoeging: null, postcode: "4701AA", plaats: "Roosendaal",
  status: "VERKOCHT", actief: true, vraagprijs: 400000, transactieprijs: 395000,
  transactiedatum: "2026-10-17", transportdatum: "2026-11-25", publicatiedatum: "2026-06-01",
  gekoppeldeMakelaarCode: "116177", realworksGewijzigdOp: "2026-10-18 09:00:00", ...o,
});

const makelaars = new Map([["116177", "Sam van Voorbeeld"]]);
const instellingen = { verkopenVanaf: "2026-10-01" };

describe("objectNaarVerkoop", () => {
  it("maakt van een verkocht object een koopregel zonder courtage, met de makelaar op relatiecode", () => {
    expect(objectNaarVerkoop(object({}), makelaars, instellingen)).toEqual({
      realworksId: 10197032,
      soort: "koop",
      adres: "Voorbeeldstraat 12, Roosendaal",
      makelaar: "Sam van Voorbeeld",
      makelaarCode: "116177",
      aandeel: 1,
      verkoopdatum: "2026-10-17",
      omzetMaand: "2026-11-01",
      passeerdatum: "2026-11-25",
      verkoopprijs: 395000,
      courtage: null,
      opstartnota: 0,
      notaVerstuurd: false,
      onderVoorbehoud: false,
    });
  });

  it("neemt een verkoop onder voorbehoud mee, gemarkeerd", () => {
    const v = objectNaarVerkoop(object({ status: "VERKOCHT_ONDER_VOORBEHOUD" }), makelaars, instellingen);
    expect(v?.onderVoorbehoud).toBe(true);
  });

  it("slaat objecten over die niet verkocht zijn", () => {
    expect(objectNaarVerkoop(object({ status: "BESCHIKBAAR" }), makelaars, instellingen)).toBeNull();
    expect(objectNaarVerkoop(object({ status: "ONDER_BOD" }), makelaars, instellingen)).toBeNull();
    expect(objectNaarVerkoop(object({ status: null }), makelaars, instellingen)).toBeNull();
  });

  it("slaat verkopen van vóór de startdatum van de koppeling over: die staan in de Excel-historie", () => {
    expect(objectNaarVerkoop(object({ transactiedatum: "2026-09-30" }), makelaars, instellingen)).toBeNull();
    expect(objectNaarVerkoop(object({ transactiedatum: "2026-10-01" }), makelaars, instellingen)).not.toBeNull();
  });

  it("slaat een verkocht object zonder transactiedatum over", () => {
    expect(objectNaarVerkoop(object({ transactiedatum: null }), makelaars, instellingen)).toBeNull();
  });

  it("laat passeerdatum en omzetmaand leeg zolang de transportdatum onbekend is", () => {
    const v = objectNaarVerkoop(object({ transportdatum: null }), makelaars, instellingen);
    expect(v).toMatchObject({ passeerdatum: null, omzetMaand: null });
  });

  it("gebruikt 'Onbekend' als de makelaarcode niet bij een medewerker hoort", () => {
    expect(objectNaarVerkoop(object({ gekoppeldeMakelaarCode: "999999" }), makelaars, instellingen)?.makelaar).toBe("Onbekend");
    expect(objectNaarVerkoop(object({ gekoppeldeMakelaarCode: null }), makelaars, instellingen)).toMatchObject({ makelaar: "Onbekend", makelaarCode: null });
  });

  it("bouwt het adres met toevoeging en zonder ontbrekende delen", () => {
    expect(objectNaarVerkoop(object({ huisnummertoevoeging: "A" }), makelaars, instellingen)?.adres).toBe("Voorbeeldstraat 12 A, Roosendaal");
    expect(objectNaarVerkoop(object({ plaats: null }), makelaars, instellingen)?.adres).toBe("Voorbeeldstraat 12");
    expect(objectNaarVerkoop(object({ straat: null, huisnummer: null, plaats: null }), makelaars, instellingen)?.adres).toBeNull();
  });

  it("laat de verkoopprijs leeg als Realworks nog geen transactieprijs heeft", () => {
    expect(objectNaarVerkoop(object({ transactieprijs: null }), makelaars, instellingen)?.verkoopprijs).toBeNull();
  });
});

describe("isVerkochtStatus", () => {
  it("herkent de twee verkochte statussen van Realworks", () => {
    expect(isVerkochtStatus("VERKOCHT")).toBe(true);
    expect(isVerkochtStatus("VERKOCHT_ONDER_VOORBEHOUD")).toBe(true);
    expect(isVerkochtStatus("BESCHIKBAAR")).toBe(false);
    expect(isVerkochtStatus(null)).toBe(false);
  });
});
