import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { filterLeads, leadCijfers, type Lead } from "@makelaarscockpit/domain";
import { Kaart, KpiTegel, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Keuze } from "@/components/formulier";
import { HorizontaalScroller } from "@/components/horizontaal-scroller";
import { RijenKiezer } from "@/components/rijen-kiezer";
import { aantal, datum } from "@/lib/format";
import { haalLeadOverzicht } from "@/lib/leads";

export const metadata: Metadata = { title: "Leads uit bezichtigingen" };

const RIJEN_OPTIES = [10, 25, 50] as const;
const STANDAARD_RIJEN = 25;
const PERIODES = [
  { waarde: "30", label: "Laatste 30 dagen" },
  { waarde: "90", label: "Laatste 90 dagen" },
] as const;

async function laad() {
  try {
    return await haalLeadOverzicht();
  } catch (fout) {
    console.error(`leads laden mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    return null;
  }
}

const dagEnTijd = (tijdstip: string) => `${datum(new Date(`${tijdstip.slice(0, 10)}T00:00:00`))}, ${tijdstip.slice(11, 16)}`;
const alleenDag = (tijdstip: string) => datum(new Date(`${tijdstip.slice(0, 10)}T00:00:00`));

function dagenTerug(vandaag: string, dagen: number): string {
  const d = new Date(`${vandaag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dagen);
  return d.toISOString().slice(0, 10);
}

export default async function Leads({ searchParams }: { searchParams: Promise<{ periode?: string; woning?: string; makelaar?: string; aantal?: string; rijen?: string; pagina?: string }> }) {
  await connection();
  const { periode: periodeParam, woning = "", makelaar = "", aantal: aantalParam, rijen: rijenParam, pagina: paginaParam } = await searchParams;
  const d = await laad();
  if (!d) {
    return (
      <>
        <PaginaKop titel="Leads uit bezichtigingen" />
        <Melding soort="fout" titel="We konden de leads niet ophalen">
          Probeer het over een paar minuten opnieuw. Blijft dit zo, neem dan contact op met de beheerder van MakelaarsCockpit.
        </Melding>
      </>
    );
  }
  if (!d.moduleAan) {
    return (
      <>
        <PaginaKop titel="Leads uit bezichtigingen" />
        <Melding titel="Deze module staat niet aan">De module Bezichtigersleads staat niet aan voor dit kantoor.</Melding>
      </>
    );
  }

  const periode = PERIODES.find((p) => p.waarde === periodeParam)?.waarde ?? "";
  const meerdere = aantalParam === "meerdere";
  const lijst = filterLeads(d.leads, {
    ...(periode ? { vanaf: dagenTerug(d.vandaag, Number(periode)) } : {}),
    ...(woning ? { projectcode: woning } : {}),
    ...(makelaar ? { makelaar } : {}),
    alleenMeerdere: meerdere,
  });
  const cijfers = leadCijfers(d.leads, d.vandaag);
  const alleBezichtigingen = d.leads.flatMap((l) => l.bezichtigingen);
  const woningen = [...new Map(alleBezichtigingen.flatMap((b) => (b.projectcode ? [[b.projectcode, b.woning ?? b.projectcode] as const] : []))).entries()].sort((a, b) => a[1].localeCompare(b[1], "nl"));
  const makelaars = [...new Set(alleBezichtigingen.map((b) => b.makelaar))].sort((a, b) => a.localeCompare(b, "nl"));
  const gefilterd = periode || woning || makelaar || meerdere;

  const rijen = RIJEN_OPTIES.find((n) => String(n) === rijenParam) ?? STANDAARD_RIJEN;
  const paginas = Math.max(1, Math.ceil(lijst.length / rijen));
  const pagina = Math.min(paginas, Math.max(1, Number.parseInt(paginaParam ?? "", 10) || 1));
  const zichtbaar = lijst.slice((pagina - 1) * rijen, pagina * rijen);
  // Filters en aantal rijen blijven in de URL; lege waarden en de standaard laten we weg.
  const behoud: Record<string, string> = Object.fromEntries(
    Object.entries({ periode, woning, makelaar, aantal: meerdere ? "meerdere" : "", rijen: rijen === STANDAARD_RIJEN ? "" : String(rijen) }).filter(([, w]) => w),
  );
  const naarPagina = (p: number) => {
    const q = new URLSearchParams({ ...behoud, ...(p > 1 ? { pagina: String(p) } : {}) }).toString();
    return q ? `/leads?${q}` : "/leads";
  };

  return (
    <>
      <PaginaKop
        titel="Leads uit bezichtigingen"
        toelichting="Iedereen met een bezichtiging in de laatste zes maanden of een geplande bezichtiging, één regel per relatie. Dit overzicht is voor gebruik binnen het kantoor."
      />

      {d.isVoorbeeld && (
        <Melding titel="Dit zijn voorbeeldgegevens">
          Er is geen database gekoppeld, dus je ziet verzonnen bezichtigers. In de pilot-omgeving staan hier de bezichtigers van het kantoor.
        </Melding>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTegel label="Leads" waarde={aantal(cijfers.leads)} toelichting="Relaties met een bezichtiging in de laatste zes maanden." />
        <KpiTegel label="Meerdere bezichtigingen" waarde={aantal(cijfers.meerdere)} toelichting="Relaties die vaker zijn komen kijken." />
        <KpiTegel label="Bezichtigingen, 30 dagen" waarde={aantal(cijfers.bezichtigingenLaatste30Dagen)} toelichting="Geweest in de laatste 30 dagen." />
        <KpiTegel label="Gepland" waarde={aantal(cijfers.komend)} toelichting="Bezichtigingen die nog komen." />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        {behoud.rijen && <input type="hidden" name="rijen" value={behoud.rijen} />}
        <label className="flex flex-col gap-1.5 text-label">
          Periode
          <Keuze name="periode" defaultValue={periode} className="min-w-44">
            <option value="">Laatste 6 maanden</option>
            {PERIODES.map((p) => (
              <option key={p.waarde} value={p.waarde}>{p.label}</option>
            ))}
          </Keuze>
        </label>
        <label className="flex flex-col gap-1.5 text-label">
          Woning
          <Keuze name="woning" defaultValue={woning} className="min-w-56">
            <option value="">Alle woningen</option>
            {woningen.map(([code, naam]) => (
              <option key={code} value={code}>{naam}</option>
            ))}
          </Keuze>
        </label>
        <label className="flex flex-col gap-1.5 text-label">
          Makelaar
          <Keuze name="makelaar" defaultValue={makelaar} className="min-w-44">
            <option value="">Alle makelaars</option>
            {makelaars.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Keuze>
        </label>
        <label className="flex flex-col gap-1.5 text-label">
          Aantal bezichtigingen
          <Keuze name="aantal" defaultValue={meerdere ? "meerdere" : ""} className="min-w-44">
            <option value="">Alle leads</option>
            <option value="meerdere">Meerdere bezichtigingen</option>
          </Keuze>
        </label>
        <button type="submit" className={knopKlassen("secundair")}>Filter toepassen</button>
        {gefilterd && <Link href={behoud.rijen ? `/leads?rijen=${behoud.rijen}` : "/leads"} className={knopKlassen("ghost")}>Filters wissen</Link>}
      </form>

      {lijst.length === 0 ? (
        <LegeStaat icoon={Users} titel={gefilterd ? "Geen leads met deze filters" : "Nog geen leads"}>
          {gefilterd ? "Pas de filters aan of wis ze om alle leads te zien." : "Leads verschijnen hier na de dagelijkse synchronisatie met de agenda in Realworks."}
        </LegeStaat>
      ) : (
        <Kaart>
          <HorizontaalScroller className="-m-6">
            <table className="w-full min-w-[960px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Bezichtiger</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Bezichtigingen</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Laatste bezichtiging</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Gepland</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Woning</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Makelaar</th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((l) => (
                  <LeadRij key={l.bezichtigerId} lead={l} />
                ))}
              </tbody>
            </table>
          </HorizontaalScroller>
        </Kaart>
      )}

      {lijst.length > 0 && (
        <nav aria-label="Paginering" className="flex flex-wrap items-center justify-between gap-3">
          <RijenKiezer rijen={rijen} opties={RIJEN_OPTIES} behoud={Object.fromEntries(Object.entries(behoud).filter(([n]) => n !== "rijen"))} />
          <p className="text-body-sm tabular-nums text-text-muted">
            {aantal((pagina - 1) * rijen + 1)}–{aantal((pagina - 1) * rijen + zichtbaar.length)} van {aantal(lijst.length)}
          </p>
          <div className="flex gap-2">
            {pagina > 1 ? (
              <Link href={naarPagina(pagina - 1)} className={knopKlassen("ghost")}><ChevronLeft aria-hidden size={18} />Vorige</Link>
            ) : (
              <span aria-disabled className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-[15px] font-semibold text-text-muted"><ChevronLeft aria-hidden size={18} />Vorige</span>
            )}
            {pagina < paginas ? (
              <Link href={naarPagina(pagina + 1)} className={knopKlassen("ghost")}>Volgende<ChevronRight aria-hidden size={18} /></Link>
            ) : (
              <span aria-disabled className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-[15px] font-semibold text-text-muted">Volgende<ChevronRight aria-hidden size={18} /></span>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

function LeadRij({ lead }: { lead: Lead }) {
  const nieuwste = lead.bezichtigingen[0]!;
  return (
    <tr className="border-t border-border align-top transition-colors duration-150 hover:bg-primary-subtle/50">
      <td className="px-6 py-3 text-label">{lead.naam ?? <span className="font-normal text-text-muted">Naam nog niet opgehaald</span>}</td>
      <td className="px-3 py-3">
        {lead.aantal === 1 ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Label soort="neutraal">1 bezichtiging</Label>
            {lead.terugNaarZelfdeWoning && <Label soort="info">2e bezichtiging</Label>}
          </span>
        ) : (
          <details>
            <summary className="inline-flex cursor-pointer flex-wrap items-center gap-2 rounded-md">
              <Label soort="accent">{aantal(lead.aantal)} bezichtigingen</Label>
              {lead.terugNaarZelfdeWoning && <Label soort="info">Terug naar dezelfde woning</Label>}
              <span className="text-caption text-primary">Toon alle</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {lead.bezichtigingen.map((b) => (
                <li key={b.id} className="text-body-sm">
                  <span className="tabular-nums">{dagEnTijd(b.tijdstip)}</span>
                  <span className="text-text-muted"> · {b.agendatype} · {b.woning ?? "Woning onbekend"} · {b.makelaar}</span>
                  {b.status === "Wacht op bevestiging" && <span className="text-text-muted"> · nog niet bevestigd</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{lead.laatste ? alleenDag(lead.laatste) : <span className="text-text-muted">–</span>}</td>
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{lead.komende ? dagEnTijd(lead.komende) : <span className="text-text-muted">–</span>}</td>
      <td className="px-3 py-3">
        {nieuwste.woning ?? <span className="text-text-muted">Woning onbekend</span>}
        {lead.aantalWoningen > 1 && <span className="text-text-muted"> en {aantal(lead.aantalWoningen - 1)} andere</span>}
      </td>
      <td className="px-6 py-3">{lead.makelaars.join(", ")}</td>
    </tr>
  );
}
