import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ClipboardCheck, Save } from "lucide-react";
import { OPEN_STATUSSEN, WAARDEBEPALING_STATUSSEN, WAARDEBEPALING_STATUS_LABEL, type WaardebepalingStatus } from "@makelaarscockpit/domain";
import { Kaart, KpiTegel, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Invoer, Keuze } from "@/components/formulier";
import { StaafGrafiek } from "@/components/grafieken";
import { MAANDEN_KORT, aantal, datum, procent } from "@/lib/format";
import { haalWaardebepalingDashboard, type WaardebepalingDashboard } from "@/lib/waardebepalingen";
import { waardebepalingBijwerken } from "./acties";

export const metadata: Metadata = { title: "Waardebepalingen" };

const STATUS_STIJL: Record<WaardebepalingStatus, "succes" | "fout" | "info" | "neutraal" | "waarschuwing"> = {
  gewonnen: "succes", verloren: "fout", in_afwachting: "info", orienterend: "waarschuwing", blijft_wonen: "neutraal", uit_verkoop: "neutraal", zelf_verkocht: "neutraal", andere_makelaar: "neutraal",
};

async function laad(): Promise<WaardebepalingDashboard | null> {
  try {
    return await haalWaardebepalingDashboard();
  } catch (fout) {
    console.error(`waardebepalingen laden mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    return null;
  }
}

export default async function Waardebepalingen({ searchParams }: { searchParams: Promise<{ filter?: string; opgeslagen?: string; fout?: string }> }) {
  await connection();
  const { filter: filterParam, opgeslagen, fout } = await searchParams;
  const filter = filterParam === "open" ? "open" : "alle";
  const d = await laad();
  if (!d) {
    return (
      <>
        <PaginaKop titel="Waardebepalingen" />
        <Melding soort="fout" titel="We konden de waardebepalingen niet ophalen">
          Probeer het over een paar minuten opnieuw. Blijft dit zo, neem dan contact op met de beheerder van MakelaarsCockpit.
        </Melding>
      </>
    );
  }
  const c = d.cijfers;
  const vorig = c.jaar - 1;
  const verschil = (nu: number, toen: number) => (toen ? (nu - toen) / toen : undefined);
  const ditJaar = d.regels.filter((r) => r.datum.startsWith(String(c.jaar)));
  const open = ditJaar.filter((r) => OPEN_STATUSSEN.has(r.status));
  const lijst = filter === "open" ? open : ditJaar;
  const terug = `/waardebepalingen${filter === "open" ? "?filter=open" : ""}`;

  return (
    <>
      <PaginaKop titel="Waardebepalingen" toelichting={`${c.jaar} tot en met ${datum(d.tot)}, vergeleken met dezelfde maanden in ${vorig}. Waardebepalingen komen uit de agenda in Realworks.`} />

      {d.isVoorbeeld && (
        <Melding titel="Dit zijn voorbeeldcijfers">
          Er is geen database gekoppeld, dus je ziet verzonnen cijfers. In de pilot-omgeving staan hier de waardebepalingen van het kantoor.
        </Melding>
      )}
      {opgeslagen === "1" && <Melding titel="Opgeslagen">De uitkomst is vastgelegd en telt direct mee in de score.</Melding>}
      {fout === "status" && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          Kies een status en probeer het opnieuw.
        </Melding>
      )}
      {fout === "rechten" && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          Je hebt geen rechten om dit in te vullen.
        </Melding>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTegel label="Waardebepalingen" waarde={aantal(c.kern.aantal)} verschil={verschil(c.kern.aantal, c.kern.aantalVorigJaar)} vergelijking={`t.o.v. ${vorig}`} />
        <KpiTegel label="Gewonnen" waarde={aantal(c.kern.gewonnen)} toelichting={`${aantal(c.kern.verloren)} verloren`} />
        <KpiTegel
          label="Score"
          waarde={c.kern.score === null ? "–" : procent(c.kern.score)}
          verschil={c.kern.score !== null && c.kern.scoreVorigJaar !== null ? c.kern.score - c.kern.scoreVorigJaar : undefined}
          vergelijking={`punt t.o.v. ${vorig}`}
          toelichting="Gewonnen gedeeld door gewonnen plus verloren."
        />
        <KpiTegel label="Nog open" waarde={aantal(c.kern.open)} toelichting="In afwachting of oriënterend." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Kaart titel="Waardebepalingen per maand" toelichting={`Aantal per maand in ${c.jaar} vergeleken met ${vorig}.`}>
          <StaafGrafiek
            categorieen={MAANDEN_KORT}
            reeksen={[
              { naam: String(vorig), waarden: c.perMaand.vorigJaar, soort: "vergelijking" },
              { naam: String(c.jaar), waarden: c.perMaand.ditJaar, soort: "hoofd" },
            ]}
            formatteer={aantal}
            beschrijving={`Waardebepalingen per maand in ${c.jaar} vergeleken met ${vorig}`}
          />
        </Kaart>
        <Kaart titel="Score per makelaar" toelichting={`${c.jaar}, zoals het Excel-tabblad "Score per makelaar".`}>
          <div className="-mx-6 -mb-6 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Makelaar</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Aantal</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Gewonnen</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Verloren</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Open</th>
                  <th scope="col" className="px-6 py-3 text-right font-semibold">Score</th>
                </tr>
              </thead>
              <tbody>
                {c.perMakelaar.map((m) => (
                  <tr key={m.naam} className="h-12 border-t border-border">
                    <td className="whitespace-nowrap px-6 text-label">{m.naam}</td>
                    <td className="px-3 text-right tabular-nums">{aantal(m.aantal)}</td>
                    <td className="px-3 text-right tabular-nums">{aantal(m.gewonnen)}</td>
                    <td className="px-3 text-right tabular-nums">{aantal(m.verloren)}</td>
                    <td className="px-3 text-right tabular-nums">{aantal(m.open)}</td>
                    <td className="px-6 text-right text-label tabular-nums">{m.score === null ? "–" : procent(m.score)}</td>
                  </tr>
                ))}
                {c.perMakelaar.length === 0 && (
                  <tr className="h-12 border-t border-border">
                    <td colSpan={6} className="px-6 text-text-muted">Nog geen waardebepalingen dit jaar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Kaart>
      </div>

      <Kaart titel="Binnengehaald via" toelichting={`Hoe de waardebepalingen van ${c.jaar} zijn binnengekomen.`}>
        <ul className="flex flex-wrap gap-2">
          {c.via.map((v) => (
            <li key={v.naam} className="rounded-full bg-surface-sunken px-3 py-1 text-body-sm">
              {v.naam} <span className="text-text-muted">· {aantal(v.aantal)}</span>
            </li>
          ))}
          {c.via.length === 0 && <li className="text-body-sm text-text-muted">Nog niets vastgelegd.</li>}
        </ul>
      </Kaart>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3">Uitkomst per waardebepaling</h2>
        <div className="flex gap-2" role="tablist" aria-label="Filter">
          <Link href="/waardebepalingen" role="tab" aria-selected={filter === "alle"} className={knopKlassen(filter === "alle" ? "secundair" : "ghost")}>
            Dit jaar ({ditJaar.length})
          </Link>
          <Link href="/waardebepalingen?filter=open" role="tab" aria-selected={filter === "open"} className={knopKlassen(filter === "open" ? "secundair" : "ghost")}>
            Nog open ({open.length})
          </Link>
        </div>
      </div>

      {lijst.length === 0 ? (
        <LegeStaat icoon={ClipboardCheck} titel={filter === "open" ? "Alles heeft een uitkomst" : "Nog geen waardebepalingen"}>
          {filter === "open" ? "Elke waardebepaling van dit jaar is gewonnen, verloren of anders afgerond." : "Waardebepalingen verschijnen hier na de dagelijkse synchronisatie met de agenda in Realworks."}
        </LegeStaat>
      ) : (
        <Kaart>
          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Datum</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Woning</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Makelaar</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Verloren aan</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Binnengehaald via</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Opslaan</span></th>
                </tr>
              </thead>
              <tbody>
                {lijst.map((w) => (
                  <tr key={w.id} id={`wb-${w.id}`} className="border-t border-border align-middle transition-colors duration-150 hover:bg-primary-subtle/50">
                    <td className="whitespace-nowrap px-6 py-2">{datum(new Date(`${w.datum}T00:00:00`))}</td>
                    <td className="px-3 py-2">
                      <span className="text-label">{w.adres ?? "Adres onbekend"}</span>
                      {w.plaats && <span className="text-text-muted">, {w.plaats}</span>}
                      {w.agendaStatus === "Wacht op bevestiging" && <span className="text-text-muted"> · afspraak nog niet bevestigd</span>}
                      <div className="mt-0.5">
                        <Label soort={STATUS_STIJL[w.status]}>{WAARDEBEPALING_STATUS_LABEL[w.status]}</Label>
                        {w.statusBron === "automatisch" && w.status === "gewonnen" && <span className="ml-2 text-caption text-text-muted">automatisch: woning in verkoop</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{w.makelaar}</td>
                    <td className="px-3 py-2">
                      <Keuze form={`f-${w.id}`} name="status" defaultValue={w.status} aria-label="Status" className="min-w-40">
                        {WAARDEBEPALING_STATUSSEN.map((s) => (
                          <option key={s} value={s}>
                            {WAARDEBEPALING_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Keuze>
                    </td>
                    <td className="px-3 py-2">
                      <Invoer form={`f-${w.id}`} name="verlorenAan" defaultValue={w.verlorenAan ?? ""} aria-label="Verloren aan" placeholder="Welke makelaar" className="min-w-36" />
                    </td>
                    <td className="px-3 py-2">
                      <Invoer form={`f-${w.id}`} name="binnengehaaldVia" defaultValue={w.binnengehaaldVia ?? ""} aria-label="Binnengehaald via" placeholder="Telefonisch, netwerk, …" className="min-w-40" list="via-keuzes" />
                    </td>
                    <td className="px-6 py-2 text-right">
                      <form id={`f-${w.id}`} action={waardebepalingBijwerken.bind(null, w.id)}>
                        <input type="hidden" name="terug" value={terug} />
                        <button type="submit" className={`${knopKlassen("ghost")} px-2`} aria-label="Uitkomst opslaan">
                          <Save aria-hidden size={18} strokeWidth={1.75} />
                          Opslaan
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="via-keuzes">
              {c.via.filter((v) => v.naam !== "Onbekend").map((v) => (
                <option key={v.naam} value={v.naam} />
              ))}
            </datalist>
          </div>
        </Kaart>
      )}
    </>
  );
}
