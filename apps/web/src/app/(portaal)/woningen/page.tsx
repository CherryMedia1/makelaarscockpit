import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { WONING_FASE_LABEL, stappenVoorSpoor, voortgang, type Spoor } from "@makelaarscockpit/domain";
import { Kaart, KpiTegel, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Keuze } from "@/components/formulier";
import { HorizontaalScroller } from "@/components/horizontaal-scroller";
import { RijenKiezer } from "@/components/rijen-kiezer";
import { StapTeken } from "@/components/stap-status";
import { aantal, euro } from "@/lib/format";
import { haalWoningenBord, type WoningOpBord } from "@/lib/woningen";

export const metadata: Metadata = { title: "Woningen in verkoop" };

const RIJEN_OPTIES = [10, 25, 50] as const;
const STANDAARD_RIJEN = 25;

const FOUTEN: Record<string, string> = { rechten: "Je hebt geen rechten om dit in te vullen.", onbekend: "Deze woning staat niet meer op het bord." };

async function laad(spoor: Spoor) {
  try {
    return await haalWoningenBord(spoor);
  } catch (fout) {
    console.error(`woningen laden mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    return null;
  }
}

export default async function Woningen({ searchParams }: { searchParams: Promise<{ spoor?: string; makelaar?: string; backoffice?: string; open?: string; fout?: string; rijen?: string; pagina?: string }> }) {
  await connection();
  const { spoor: spoorParam, makelaar = "", backoffice = "", open = "", fout, rijen: rijenParam, pagina: paginaParam } = await searchParams;
  const spoor: Spoor = spoorParam === "kovk" ? "kovk" : "verkoop";
  const basis = spoor === "kovk" ? "/woningen?spoor=kovk" : "/woningen";
  const d = await laad(spoor);
  if (!d) {
    return (
      <>
        <PaginaKop titel="Woningen in verkoop" />
        <Melding soort="fout" titel="We konden de woningen niet ophalen">
          Probeer het over een paar minuten opnieuw. Blijft dit zo, neem dan contact op met de beheerder van MakelaarsCockpit.
        </Melding>
      </>
    );
  }
  const stappen = stappenVoorSpoor(spoor);
  const uniek = (waarden: (string | null)[]) => [...new Set(waarden.filter((w): w is string => !!w))].sort((a, b) => a.localeCompare(b));
  const makelaars = uniek(d.woningen.map((w) => w.makelaar));
  const backoffices = uniek(d.woningen.map((w) => w.backoffice));
  const lijst = d.woningen.filter(
    (w) => (!makelaar || w.makelaar === makelaar) && (!backoffice || w.backoffice === backoffice) && (!open || w.stappen.some((s) => s.sleutel === open && (s.status === "open" || s.status === "gepland"))),
  );
  const tel = (w: WoningOpBord) => voortgang(w.stappen);
  const inVoorbereiding = d.woningen.filter((w) => w.fase === "voorbereiding").length;
  const onderVoorbehoud = d.woningen.filter((w) => w.fase === "verkocht_ov").length;
  const compleet = d.woningen.filter((w) => tel(w).open === 0).length;
  const openStappen = d.woningen.reduce((t, w) => t + tel(w).open, 0);
  const gefilterd = makelaar || backoffice || open;

  const rijen = RIJEN_OPTIES.find((n) => String(n) === rijenParam) ?? STANDAARD_RIJEN;
  const paginas = Math.max(1, Math.ceil(lijst.length / rijen));
  const pagina = Math.min(paginas, Math.max(1, Number.parseInt(paginaParam ?? "", 10) || 1));
  const zichtbaar = lijst.slice((pagina - 1) * rijen, pagina * rijen);
  // Filters en aantal rijen blijven in de URL; lege waarden en de standaard laten we weg.
  const behoud: Record<string, string> = Object.fromEntries(
    Object.entries({ spoor: spoor === "kovk" ? "kovk" : "", makelaar, backoffice, open, rijen: rijen === STANDAARD_RIJEN ? "" : String(rijen) }).filter(([, w]) => w),
  );
  const naarPagina = (p: number) => {
    const q = new URLSearchParams({ ...behoud, ...(p > 1 ? { pagina: String(p) } : {}) }).toString();
    return q ? `/woningen?${q}` : "/woningen";
  };

  return (
    <>
      <PaginaKop
        titel="Woningen in verkoop"
        toelichting={spoor === "kovk" ? "Verkochte woningen: van koopovereenkomst tot en met de overdracht." : "Per woning de stappen tot en met de verkoop. Wat Realworks weet, is automatisch afgevinkt; de rest vul je zelf in."}
      >
        <div className="flex gap-2" role="tablist" aria-label="Spoor">
          <Link href="/woningen" role="tab" aria-selected={spoor === "verkoop"} className={knopKlassen(spoor === "verkoop" ? "secundair" : "ghost")}>
            In verkoop
          </Link>
          <Link href="/woningen?spoor=kovk" role="tab" aria-selected={spoor === "kovk"} className={knopKlassen(spoor === "kovk" ? "secundair" : "ghost")}>
            Verkocht
          </Link>
        </div>
      </PaginaKop>

      {d.isVoorbeeld && (
        <Melding titel="Dit zijn voorbeeldwoningen">
          Er is geen database gekoppeld, dus je ziet verzonnen woningen. In de pilot-omgeving staan hier de woningen van het kantoor.
        </Melding>
      )}
      {fout && (
        <Melding soort="fout" titel="Dat is niet gelukt">
          {FOUTEN[fout] ?? "Probeer het opnieuw."}
        </Melding>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {spoor === "kovk" ? (
          <>
            <KpiTegel label="Verkochte woningen" waarde={aantal(d.woningen.length)} toelichting="Tot ze in Realworks naar het archief gaan." />
            <KpiTegel label="Onder voorbehoud" waarde={aantal(onderVoorbehoud)} toelichting="Verkocht, voorbehouden lopen nog." />
          </>
        ) : (
          <>
            <KpiTegel label="Woningen op het bord" waarde={aantal(d.woningen.length)} toelichting="In voorbereiding, beschikbaar of onder bod." />
            <KpiTegel label="In voorbereiding" waarde={aantal(inVoorbereiding)} toelichting="Nog niet online; bekend uit de agenda in Realworks." />
          </>
        )}
        <KpiTegel label="Alles afgerond" waarde={aantal(compleet)} toelichting="Elke stap is klaar of niet van toepassing." />
        <KpiTegel label="Stappen nog te doen" waarde={aantal(openStappen)} toelichting="Open of gepland, over alle woningen." />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        {spoor === "kovk" && <input type="hidden" name="spoor" value="kovk" />}
        {behoud.rijen && <input type="hidden" name="rijen" value={behoud.rijen} />}
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
          Backoffice
          <Keuze name="backoffice" defaultValue={backoffice} className="min-w-44">
            <option value="">Iedereen</option>
            {backoffices.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Keuze>
        </label>
        <label className="flex flex-col gap-1.5 text-label">
          Nog te doen
          <Keuze name="open" defaultValue={open} className="min-w-44">
            <option value="">Alle stappen</option>
            {stappen.map((s) => (
              <option key={s.sleutel} value={s.sleutel}>{s.label}</option>
            ))}
          </Keuze>
        </label>
        <button type="submit" className={knopKlassen("secundair")}>Filter</button>
        {gefilterd && (
          <Link href={basis} className={knopKlassen("ghost")}>Wis filter</Link>
        )}
      </form>

      {lijst.length === 0 ? (
        <LegeStaat icoon={Home} titel={gefilterd ? "Geen woningen met dit filter" : "Nog geen woningen op het bord"}>
          {gefilterd ? "Pas het filter aan om meer woningen te zien." : spoor === "kovk" ? "Zodra een woning in Realworks verkocht is, staat ze hier." : "Woningen verschijnen hier na de dagelijkse synchronisatie met Realworks."}
        </LegeStaat>
      ) : (
        <Kaart>
          <HorizontaalScroller className="-m-6">
            <table className={`w-full border-collapse text-body-sm ${spoor === "kovk" ? "min-w-[920px]" : "min-w-[1080px]"}`}>
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Woning</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Makelaar</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Backoffice</th>
                  {spoor === "verkoop" && <th scope="col" className="px-3 py-3 text-right font-semibold">Vraagprijs</th>}
                  {stappen.map((s) => (
                    <th key={s.sleutel} scope="col" title={s.label} className="px-1.5 py-3 text-center font-semibold">{s.kort}</th>
                  ))}
                  <th scope="col" className="px-6 py-3 text-right font-semibold">Klaar</th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((w) => {
                  const v = tel(w);
                  return (
                    <tr key={w.id} className="h-12 border-t border-border transition-colors duration-150 hover:bg-primary-subtle/50">
                      <td className="whitespace-nowrap px-6">
                        <Link href={`/woningen/${w.id}`} className="text-label text-primary hover:underline">{w.adres ?? "Adres onbekend"}</Link>
                        {w.plaats && <span className="text-text-muted">, {w.plaats}</span>}
                        {w.fase === "voorbereiding" && <span className="ml-2"><Label soort="info">{WONING_FASE_LABEL[w.fase]}</Label></span>}
                        {w.realworksStatus === "ONDER_BOD" && <span className="ml-2"><Label soort="accent">onder bod</Label></span>}
                        {w.fase === "verkocht_ov" && <span className="ml-2"><Label soort="accent">onder voorbehoud</Label></span>}
                      </td>
                      <td className="whitespace-nowrap px-3">{w.makelaar}</td>
                      <td className="whitespace-nowrap px-3">{w.backoffice ?? <span className="text-text-muted">nog niemand</span>}</td>
                      {spoor === "verkoop" && <td className="whitespace-nowrap px-3 text-right tabular-nums">{w.vraagprijs === null ? "" : euro(w.vraagprijs)}</td>}
                      {w.stappen.map((s, i) => (
                        <td key={s.sleutel} className="px-1.5 text-center">
                          <StapTeken label={stappen[i]!.label} stap={s} />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-6 text-right tabular-nums">{v.afgerond} van {v.totaal}</td>
                    </tr>
                  );
                })}
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

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-text-muted">
        <span className="inline-flex items-center gap-2"><StapTeken label="Voorbeeld" stap={{ sleutel: "x", status: "klaar", datum: null, bron: null, teLaat: false }} /> klaar</span>
        <span className="inline-flex items-center gap-2"><StapTeken label="Voorbeeld" stap={{ sleutel: "x", status: "gepland", datum: null, bron: null, teLaat: false }} /> gepland</span>
        <span className="inline-flex items-center gap-2"><StapTeken label="Voorbeeld" stap={{ sleutel: "x", status: "gepland", datum: null, bron: null, teLaat: true }} /> gepland, datum voorbij</span>
        <span className="inline-flex items-center gap-2"><StapTeken label="Voorbeeld" stap={{ sleutel: "x", status: "nvt", datum: null, bron: null, teLaat: false }} /> niet van toepassing</span>
        <span className="inline-flex items-center gap-2"><StapTeken label="Voorbeeld" stap={{ sleutel: "x", status: "open", datum: null, bron: null, teLaat: false }} /> open</span>
      </p>
    </>
  );
}
