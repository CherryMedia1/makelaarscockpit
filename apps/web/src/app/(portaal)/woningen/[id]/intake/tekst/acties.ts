"use server";

// Woningtekst per woning (ADR-016, stap B5): steekwoorden, schrijven via de wachtrij, bewerken als nieuwe versie en
// goedkeuren. Elke medewerker mag dit (ADR-013); elke actie controleert zelf de sessie, de module en het dossier.
// Alleen id's in de log, nooit steekwoorden of tekst.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { renderTekst, valideerSchrijfprofiel } from "@makelaarscockpit/ai";
import {
  actiefSchrijfprofiel, bewaarSteekwoorden, intakeDossierVanWoning, keurWoningtekstGoed, moduleAan, schrijfprofielOpId, startSchrijven, tekstversies, voegTekstversieToe,
  woningVanDossier, woningtekstVanDossier, zetWoningtekstMislukt, type Tx, type Woningcategorie,
} from "@makelaarscockpit/db";
import { controleerTekst } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { meldWoningtekst } from "@/lib/intake";
import { vereisSessie, type Sessie } from "@/lib/inlog/sessie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLEUTEL = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_STEEKWOORDEN = 2_000;
const MAX_TEKST = 10_000;
const CATEGORIEEN: readonly string[] = ["appartement", "eengezinswoning", "vrijstaand"];

const pad = (woningId: string) => `/woningen/${woningId}/intake/tekst`;
const naar = (woningId: string, zoek: string, anker = ""): never => redirect(`${pad(woningId)}?${zoek}${anker}`);
const fout = (woningId: string, melding: string): never => naar(woningId, `fout=${encodeURIComponent(melding)}`);

/** Het open dossier van deze woning binnen de tenant van de sessie, met de module aan; anders null. */
async function openDossier(tx: Tx, sessie: Sessie, woningId: string) {
  if (!(await moduleAan(tx, sessie.tenantId, "intake"))) return null;
  const dossier = await intakeDossierVanWoning(tx, sessie.tenantId, woningId);
  return dossier && dossier.status === "open" ? dossier : null;
}

async function zetInWachtrij(woningId: string, sessie: Sessie, woningtekstId: string, sectie: string | null): Promise<void> {
  try {
    await meldWoningtekst({ tenantId: sessie.tenantId, woningtekstId, sectie });
  } catch (e) {
    console.error(`tekst: woningtekst ${woningtekstId} niet in de wachtrij gezet: ${e instanceof Error ? e.name : "onbekende fout"}`);
    // Niet op "bezig" laten staan: dan kan de medewerker tien minuten niets.
    await metHuidigeTenant((tx) => zetWoningtekstMislukt(tx, sessie.tenantId, woningtekstId, "wachtrij-niet-bereikbaar"));
    fout(woningId, "De schrijfopdracht kon niet worden verstuurd. Probeer het over een minuut opnieuw.");
  }
  console.log(`tekst: woningtekst ${woningtekstId} ${sectie ? `sectie ${sectie} ` : ""}in de wachtrij gezet door gebruiker ${sessie.gebruikerId}`);
}

/** Bewaart de steekwoorden; met `schrijven` gaat er daarna een schrijfopdracht naar de wachtrij. */
export async function steekwoordenOpslaan(woningId: string, schrijven: boolean, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId)) redirect("/woningen?fout=onbekend");
  const categorie = String(formData.get("woningcategorie") ?? "");

  const uitkomst = await metHuidigeTenant(async (tx) => {
    const dossier = await openDossier(tx, sessie, woningId);
    if (!dossier) return { fout: "Er is geen open intakedossier voor deze woning." };
    const huidig = await woningtekstVanDossier(tx, sessie.tenantId, dossier.id);
    const rij = huidig ? await schrijfprofielOpId(tx, sessie.tenantId, huidig.profielId) : null;
    const profiel = valideerSchrijfprofiel(rij?.profiel ?? (await actiefSchrijfprofiel(tx, sessie.tenantId))?.profiel);
    if (!profiel.geldig) return { fout: "Er is nog geen schrijfprofiel; de kantoorbeheerder stelt dat in." };
    const steekwoorden: Record<string, string> = {};
    for (const v of profiel.profiel.vragenlijst) {
      const waarde = String(formData.get(`vraag-${v.sleutel}`) ?? "").trim();
      if (waarde.length > MAX_STEEKWOORDEN) return { fout: `Te veel tekst bij "${v.label}" (hoogstens ${MAX_STEEKWOORDEN} tekens).` };
      if (waarde) steekwoorden[v.sleutel] = waarde;
    }
    if (schrijven) {
      const leeg = profiel.profiel.vragenlijst.filter((v) => v.verplicht && !steekwoorden[v.sleutel]);
      if (leeg.length > 0) return { fout: `Vul eerst in: ${leeg.map((v) => v.label).join(", ")}.` };
    }
    const id = await bewaarSteekwoorden(tx, sessie.tenantId, dossier.id, steekwoorden, CATEGORIEEN.includes(categorie) ? (categorie as Woningcategorie) : null);
    if (!id) return { fout: "Er is nog geen actief schrijfprofiel; de kantoorbeheerder stelt dat in." };
    if (schrijven && !(await startSchrijven(tx, sessie.tenantId, id))) return { fout: "Er wordt al een tekst geschreven; even geduld." };
    return { id };
  });

  if ("fout" in uitkomst) fout(woningId, uitkomst.fout!);
  const { id } = uitkomst as { id: string };
  if (schrijven) await zetInWachtrij(woningId, sessie, id, null);
  revalidatePath(pad(woningId));
  naar(woningId, schrijven ? "geschreven=bezig" : "opgeslagen=1");
}

/** Schrijft één sectie (of de inleiding) opnieuw; de rest van de tekst blijft staan. */
export async function sectieOpnieuw(woningId: string, sectie: string): Promise<void> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId) || !SLEUTEL.test(sectie)) redirect("/woningen?fout=onbekend");
  const id = await metHuidigeTenant(async (tx) => {
    const dossier = await openDossier(tx, sessie, woningId);
    const tekst = dossier ? await woningtekstVanDossier(tx, sessie.tenantId, dossier.id) : null;
    if (!tekst) return null;
    return (await startSchrijven(tx, sessie.tenantId, tekst.id)) ? tekst.id : "bezig";
  });
  if (!id) fout(woningId, "Er is nog geen tekst voor deze woning.");
  if (id === "bezig") fout(woningId, "Er wordt al een tekst geschreven; even geduld.");
  await zetInWachtrij(woningId, sessie, id!, sectie);
  revalidatePath(pad(woningId));
  naar(woningId, "geschreven=bezig");
}

/**
 * Bewaart de bewerkte tekst als nieuwe versie van een medewerker. De opmaak en de vaste controles gebeuren opnieuw; de
 * bronnencontrole hoort bij de versie van het model en wordt niet herhaald.
 */
export async function versieOpslaan(woningId: string, formData: FormData): Promise<void> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId)) redirect("/woningen?fout=onbekend");
  const inleiding = String(formData.get("inleiding") ?? "").trim();
  const sleutels = formData.getAll("sectie").map(String);
  const secties = sleutels.map((sectie, i) => ({ sectie, kop: String(formData.getAll("kop")[i] ?? "").trim(), tekst: String(formData.getAll("tekst")[i] ?? "").trim() }));
  if (!inleiding) fout(woningId, "De inleiding mag niet leeg zijn.");
  if ([inleiding, ...secties.map((s) => s.tekst)].some((t) => t.length > MAX_TEKST) || sleutels.some((s) => !SLEUTEL.test(s))) fout(woningId, "De tekst is te lang of ongeldig.");

  const uitkomst = await metHuidigeTenant(async (tx) => {
    const dossier = await openDossier(tx, sessie, woningId);
    const tekst = dossier ? await woningtekstVanDossier(tx, sessie.tenantId, dossier.id) : null;
    const vorige = tekst ? (await tekstversies(tx, sessie.tenantId, tekst.id))[0] : null;
    if (!dossier || !tekst || !vorige) return null;
    const geldig = valideerSchrijfprofiel((await schrijfprofielOpId(tx, sessie.tenantId, vorige.profielId))?.profiel);
    if (!geldig.geldig) return null;
    // Lege secties vallen weg; een medewerker kan zo een sectie schrappen.
    const { inhoud, tekst: gerenderd } = renderTekst(geldig.profiel, { inleiding, secties: secties.filter((s) => s.tekst) });
    const woning = await woningVanDossier(tx, sessie.tenantId, dossier.id);
    const feiten = vorige.feiten as { steekwoorden?: Record<string, string>; woningcategorie?: Woningcategorie } | null;
    const controles = controleerTekst({
      secties: geldig.profiel.structuur.secties,
      ingevuld: Object.keys(feiten?.steekwoorden ?? tekst.steekwoorden),
      adres: woning?.adres ?? null,
      plaats: woning?.plaats ?? null,
      lengte: geldig.profiel.lengte[feiten?.woningcategorie ?? "eengezinswoning"],
      inhoud,
    });
    return voegTekstversieToe(tx, sessie.tenantId, tekst.id, { bron: "medewerker", profielId: vorige.profielId, inhoud, tekst: gerenderd, feiten: vorige.feiten, controles, model: null, promptVersie: null, promptHash: null }, sessie.gebruikerId);
  });
  if (!uitkomst) fout(woningId, "Er is geen tekst om op te slaan.");
  console.log(`tekst: versie ${uitkomst} opgeslagen door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(pad(woningId));
  naar(woningId, "bewaard=1", "#tekst");
}

export async function tekstGoedkeuren(woningId: string, versieId: string): Promise<void> {
  const sessie = await vereisSessie();
  if (!UUID.test(woningId) || !UUID.test(versieId)) redirect("/woningen?fout=onbekend");
  const gelukt = await metHuidigeTenant(async (tx) => {
    const dossier = await openDossier(tx, sessie, woningId);
    const tekst = dossier ? await woningtekstVanDossier(tx, sessie.tenantId, dossier.id) : null;
    return tekst ? keurWoningtekstGoed(tx, sessie.tenantId, tekst.id, versieId, sessie.gebruikerId) : false;
  });
  if (!gelukt) fout(woningId, "Deze versie kon niet worden goedgekeurd.");
  console.log(`tekst: versie ${versieId} goedgekeurd door gebruiker ${sessie.gebruikerId}`);
  revalidatePath(pad(woningId));
  revalidatePath(`/woningen/${woningId}/intake`);
  naar(woningId, "goedgekeurd=1", "#klaar");
}
