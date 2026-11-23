// Namen van bezichtigers ophalen (ADR-019, issue #55), los van database en netwerk zodat het gedrag te testen is.
// Een fout op één relatie houdt de rest niet tegen; bij een limiet van Realworks (429) wachten we en gaan we door.
// Uitkomsten bevatten alleen aantallen en een HTTP-status, nooit een naam of relatie-id.
import { RealworksFout, type RelatieNaam } from "@makelaarscockpit/realworks";

export type NaamUitkomst = { relatieId: number; naam: string | null };

export type NamenResultaat = {
  /** Namen die zijn opgehaald. */
  opgehaald: number;
  /** Relaties die niet (meer) in Realworks staan. */
  onbekend: number;
  /** Relaties die Realworks weigert te tonen (400 of 403). */
  geweigerd: number;
  /** Relaties waar deze run niet aan toe kwam; die volgen bij de volgende run. */
  open: number;
  gestopt: string | null;
};

export type NamenOpties = {
  haalNaam: (relatieId: number) => Promise<RelatieNaam>;
  bewaar: (namen: NaamUitkomst[]) => Promise<void>;
  slaap?: (ms: number) => Promise<void>;
  nu?: () => number;
  tegelijk?: number;
  budgetMs?: number;
};

/** Zo vaak wachten we achter elkaar op een limiet voordat de run stopt. */
const MAX_WACHTBEURTEN = 4;
/** Zoveel relaties zonder één opgehaalde naam betekent dat de koppeling niet klopt (verkeerde bedrijfscode, vrijgave). */
const MAX_ZONDER_SUCCES = 20;

export async function haalNamenOp(ids: readonly number[], o: NamenOpties): Promise<NamenResultaat> {
  const slaap = o.slaap ?? ((ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms)));
  const nu = o.nu ?? Date.now;
  const tegelijk = o.tegelijk ?? 3;
  const budgetMs = o.budgetMs ?? 5 * 60 * 1000;
  const start = nu();
  const r: NamenResultaat = { opgehaald: 0, onbekend: 0, geweigerd: 0, open: ids.length, gestopt: null };
  // Zolang er nog geen naam is opgehaald, weten we niet of "niet gevonden" en "geweigerd" over de relatie gaan of over
  // de koppeling. Die uitkomsten wachten daarom tot de eerste naam binnen is.
  let uitgesteld: { relatieId: number; soort: "onbekend" | "geweigerd"; status: string }[] = [];
  let wachtbeurten = 0;
  const rij = [...ids];

  while (rij.length > 0 && !r.gestopt) {
    if (nu() - start > budgetMs) {
      r.gestopt = "tijdsbudget op";
      break;
    }
    const blok = rij.splice(0, tegelijk);
    const uitkomsten = await Promise.allSettled(blok.map((relatieId) => o.haalNaam(relatieId)));
    const klaar: NaamUitkomst[] = [];
    const opnieuw: number[] = [];
    let wachtSeconden: number | null = null;
    uitkomsten.forEach((u, i) => {
      const relatieId = blok[i]!;
      if (u.status === "fulfilled") {
        if (u.value.gevonden) {
          klaar.push({ relatieId, naam: u.value.naam });
          r.opgehaald += 1;
        } else uitgesteld.push({ relatieId, soort: "onbekend", status: "niet gevonden" });
        return;
      }
      const fout: unknown = u.reason;
      if (!(fout instanceof RealworksFout)) r.gestopt ??= "onverwachte fout";
      else if (fout.status === 429) {
        opnieuw.push(relatieId);
        wachtSeconden = Math.max(wachtSeconden ?? 0, fout.wachtSeconden ?? 0);
      } else if (fout.status === 400 || fout.status === 403) uitgesteld.push({ relatieId, soort: "geweigerd", status: `status ${fout.status}` });
      else {
        opnieuw.push(relatieId);
        r.gestopt ??= `Realworks gaf status ${fout.status}`;
      }
    });

    if (r.opgehaald > 0) {
      for (const u of uitgesteld) {
        klaar.push({ relatieId: u.relatieId, naam: null });
        r[u.soort] += 1;
      }
      uitgesteld = [];
    } else if (uitgesteld.length >= MAX_ZONDER_SUCCES) r.gestopt ??= `geen enkele naam op te halen (${uitgesteld.at(-1)!.status})`;
    if (klaar.length > 0) await o.bewaar(klaar);

    if (opnieuw.length > 0 && !r.gestopt) {
      if (wachtbeurten >= MAX_WACHTBEURTEN) r.gestopt = "Realworks gaf status 429";
      else {
        wachtbeurten += 1;
        await slaap(wachtSeconden ? wachtSeconden * 1000 : 1000 * 2 ** wachtbeurten);
      }
    } else if (opnieuw.length === 0) wachtbeurten = 0;
    rij.unshift(...opnieuw);
  }

  if (!r.gestopt && r.opgehaald === 0 && uitgesteld.length > 0) r.gestopt = `geen enkele naam op te halen (${uitgesteld.at(-1)!.status})`;
  r.open = ids.length - r.opgehaald - r.onbekend - r.geweigerd;
  return r;
}
