// Gegevens voor de woningtekst van een woning (ADR-016, stap B5). Alleen op de server, binnen de tenant van de sessie.
import "server-only";
import { connection } from "next/server";
import { valideerSchrijfprofiel, verzamelFeiten, type Schrijfprofiel, type Tekstfeiten } from "@makelaarscockpit/ai";
import {
  actiefSchrijfprofiel, intakeDossierVanWoning, intakeVelden, leesWoningen, moduleAan, schrijfprofielOpId, tekstversies, woningVanDossier, woningtekstVanDossier,
  type Tekstversie, type Woningtekst,
} from "@makelaarscockpit/db";
import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { heeftDatabase, metHuidigeTenant } from "./gegevens";
import { vandaagInNederland } from "./woningen";

export type { Tekstversie, Woningtekst };

export type WoningtekstPagina = {
  woning: { id: string; adres: string | null; plaats: string | null };
  dossierOpen: boolean;
  beheerder: boolean;
  /** Het profiel van de tekst (de versie waarmee geschreven is), anders het actieve profiel. */
  profiel: { id: string; versie: number; naam: string; inhoud: Schrijfprofiel } | null;
  tekst: Woningtekst | null;
  laatste: Tekstversie | null;
  aantalVersies: number;
  /** Voorvertoning van de feiten met de opgeslagen steekwoorden. */
  feiten: Tekstfeiten | null;
  teBeoordelen: number;
};

export async function haalWoningtekst(woningId: string): Promise<WoningtekstPagina | null> {
  await connection();
  if (!heeftDatabase()) return null;
  return metHuidigeTenant(async (tx, sessie) => {
    if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
    const woning = (await leesWoningen(tx, sessie.tenantId, "verkoop", vandaagInNederland(), woningId))[0];
    if (!woning) return null;
    const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
    if (!dossier) return null;
    const tekst = await woningtekstVanDossier(tx, sessie.tenantId, dossier.id);
    const rij = tekst ? await schrijfprofielOpId(tx, sessie.tenantId, tekst.profielId) : await actiefSchrijfprofiel(tx, sessie.tenantId);
    const geldig = rij ? valideerSchrijfprofiel(rij.profiel) : null;
    const profiel = rij && geldig?.geldig ? { id: rij.id, versie: rij.versie, naam: rij.naam, inhoud: geldig.profiel } : null;
    const versies = tekst ? await tekstversies(tx, sessie.tenantId, tekst.id) : [];
    const velden = await intakeVelden(tx, sessie.tenantId, dossier.id);
    const basis = await woningVanDossier(tx, sessie.tenantId, dossier.id);
    return {
      woning: { id: woning.id, adres: woning.adres, plaats: woning.plaats },
      dossierOpen: dossier.status === "open",
      beheerder: magKantoorBeheren(sessie.rol),
      profiel,
      tekst,
      laatste: versies[0] ?? null,
      aantalVersies: versies.length,
      feiten: profiel && basis ? verzamelFeiten({ woning: basis, velden, steekwoorden: tekst?.steekwoorden ?? {}, profiel: profiel.inhoud, categorie: tekst?.woningcategorie ?? null }) : null,
      teBeoordelen: new Set(velden.filter((v) => v.status === "voorstel" || v.status === "conflict").map((v) => v.pad)).size,
    };
  });
}
