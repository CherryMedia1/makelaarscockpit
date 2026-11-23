"use server";

// Pijplijnfases beheren (issue #54, ADR-020). Alleen de kantoorbeheerder (ADR-006), alleen met de module bezichtigers
// aan; elke actie controleert dat zelf. De tenant komt uit de sessie. Alleen id's in de log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  leesPijplijnFases, moduleAan, verwijderPijplijnFase, voegPijplijnFaseToe, wijzigPijplijnFase, zetPijplijnFaseActief, zetPijplijnVolgorde, type Tx,
} from "@makelaarscockpit/db";
import { STANDAARD_FASES, magKantoorBeheren, valideerFase, verplaatsFase } from "@makelaarscockpit/domain";
import { metHuidigeTenant } from "@/lib/gegevens";
import { vereisSessie, type Sessie } from "@/lib/inlog/sessie";

const PAD = "/instellingen/pijplijn";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Voert `werk` uit als kantoorbeheerder met de module aan; anders terug naar de pagina met een foutmelding. */
async function alsBeheerder(werk: (tx: Tx, sessie: Sessie) => Promise<string>): Promise<never> {
  const sessie = await vereisSessie();
  if (!magKantoorBeheren(sessie.rol)) redirect(`${PAD}?fout=rechten`);
  const uitkomst = await metHuidigeTenant(async (tx) => ((await moduleAan(tx, sessie.tenantId, "bezichtigers")) ? werk(tx, sessie) : "fout=rechten"));
  revalidatePath(PAD);
  redirect(`${PAD}?${uitkomst}`);
}

export async function faseToevoegen(formData: FormData): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    const oordeel = valideerFase({ naam: String(formData.get("naam") ?? ""), soort: String(formData.get("soort") ?? "") }, await leesPijplijnFases(tx, sessie.tenantId));
    if (!oordeel.ok) return `fout=${oordeel.fout}`;
    const id = await voegPijplijnFaseToe(tx, sessie.tenantId, oordeel.waarde);
    console.log(`pijplijn: fase ${id} toegevoegd door gebruiker ${sessie.gebruikerId}`);
    return "opgeslagen=1";
  });
}

export async function faseWijzigen(id: string, formData: FormData): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    if (!UUID.test(id)) return "fout=onbekend";
    const oordeel = valideerFase({ naam: String(formData.get("naam") ?? ""), soort: String(formData.get("soort") ?? "") }, await leesPijplijnFases(tx, sessie.tenantId), id);
    if (!oordeel.ok) return `fout=${oordeel.fout}`;
    if (!(await wijzigPijplijnFase(tx, sessie.tenantId, id, oordeel.waarde))) return "fout=onbekend";
    console.log(`pijplijn: fase ${id} gewijzigd door gebruiker ${sessie.gebruikerId}`);
    return "opgeslagen=1";
  });
}

export async function faseVerplaatsen(id: string, richting: "omhoog" | "omlaag"): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    await zetPijplijnVolgorde(tx, sessie.tenantId, verplaatsFase(await leesPijplijnFases(tx, sessie.tenantId), id, richting));
    return "opgeslagen=1";
  });
}

export async function faseActiefZetten(id: string, actief: boolean): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    if (!UUID.test(id) || !(await zetPijplijnFaseActief(tx, sessie.tenantId, id, actief))) return "fout=onbekend";
    console.log(`pijplijn: fase ${id} ${actief ? "aangezet" : "uitgezet"} door gebruiker ${sessie.gebruikerId}`);
    return "opgeslagen=1";
  });
}

export async function faseVerwijderen(id: string): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    if (!UUID.test(id) || !(await verwijderPijplijnFase(tx, sessie.tenantId, id))) return "fout=onbekend";
    console.log(`pijplijn: fase ${id} verwijderd door gebruiker ${sessie.gebruikerId}`);
    return "opgeslagen=1";
  });
}

/** Zet de startset neer voor een kantoor dat nog geen fases heeft (onboarding). */
export async function standaardFasesToevoegen(): Promise<void> {
  await alsBeheerder(async (tx, sessie) => {
    if ((await leesPijplijnFases(tx, sessie.tenantId)).length > 0) return "fout=niet-leeg";
    for (const fase of STANDAARD_FASES) await voegPijplijnFaseToe(tx, sessie.tenantId, fase);
    console.log(`pijplijn: standaardfases toegevoegd door gebruiker ${sessie.gebruikerId}`);
    return "opgeslagen=1";
  });
}
