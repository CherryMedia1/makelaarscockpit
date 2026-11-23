import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Save } from "lucide-react";
import { FASE_SOORT_LABEL, MAX_LEAD_NOTITIE, PLATFORMS, PLATFORM_LABEL, type FaseSoort } from "@makelaarscockpit/domain";
import { Kaart, Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Invoer, Keuze, Tekstvak } from "@/components/formulier";
import { datum } from "@/lib/format";
import { haalLeadKaart } from "@/lib/leads";
import { leadLinksOpslaan, leadOpslaan, leadUitPijplijn } from "./acties";

export const metadata: Metadata = { title: "Lead" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FASE_STIJL: Record<FaseSoort, "info" | "succes" | "neutraal"> = { open: "info", gewonnen: "succes", verloren: "neutraal" };
const FOUTEN: Record<string, string> = {
  fase: "Kies een fase uit de pijplijn van het kantoor.",
  eigenaar: "Kies een medewerker van het kantoor als eigenaar.",
  notitie: `De notitie is hooguit ${MAX_LEAD_NOTITIE} tekens.`,
  onbekend: "Deze lead bestaat niet meer.",
  "link-linkedin": "De LinkedIn-link moet beginnen met https:// en naar linkedin.com wijzen.",
  "link-facebook": "De Facebook-link moet beginnen met https:// en naar facebook.com wijzen.",
  "link-instagram": "De Instagram-link moet beginnen met https:// en naar instagram.com wijzen.",
};

const moment = (d: Date) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const dagEnTijd = (tijdstip: string) => `${datum(new Date(`${tijdstip.slice(0, 10)}T00:00:00`))}, ${tijdstip.slice(11, 16)}`;

/** De lead-kaart van één bezichtiger (ADR-020): fase, eigenaar, notitie, bezichtigingen en de historie van de fase. */
export default async function LeadKaartPagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ opgeslagen?: string; verwijderd?: string; fout?: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [gegevens, zoek] = await Promise.all([haalLeadKaart(id), searchParams]);
  if (!gegevens) notFound();
  const { kaart, bezichtigingen, fases, medewerkers } = gegevens;
  const { lead } = kaart;
  const huidige = fases.find((f) => f.id === lead?.faseId);
  // Een uitgezette fase is alleen te kiezen als de lead er al in zit.
  const kiesbaar = fases.filter((f) => f.actief || f.id === lead?.faseId);
  const naam = kaart.naam ?? (kaart.naamGezocht ? "Naam onbekend in Realworks" : "Naam nog niet opgehaald");

  return (
    <>
      <Link href="/leads" className="inline-flex w-fit items-center gap-2 text-label text-primary hover:underline">
        <ArrowLeft aria-hidden size={18} strokeWidth={1.75} />
        Terug naar de leads
      </Link>
      <PaginaKop titel={naam} toelichting={`${bezichtigingen.length} ${bezichtigingen.length === 1 ? "bezichtiging" : "bezichtigingen"} in de laatste zes maanden of gepland.`}>
        {huidige ? <Label soort={FASE_STIJL[huidige.soort]}>{huidige.naam}</Label> : <Label soort="neutraal">Nog niet in de pijplijn</Label>}
      </PaginaKop>

      {zoek.opgeslagen && <Melding titel="Opgeslagen">De lead is bijgewerkt.</Melding>}
      {zoek.verwijderd && <Melding titel="Uit de pijplijn gehaald">De bezichtiger staat niet meer in de pijplijn. De bezichtigingen blijven zichtbaar.</Melding>}
      {zoek.fout && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {FOUTEN[zoek.fout] ?? "Probeer het opnieuw."}
        </Melding>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Kaart titel="Pijplijn" toelichting={lead ? `In de pijplijn sinds ${moment(lead.aangemaaktOp)}.` : "Kies een fase om deze bezichtiger in de pijplijn te zetten."}>
          {kiesbaar.length === 0 ? (
            <p className="text-body-sm text-text-muted">Het kantoor heeft nog geen fases. De kantoorbeheerder legt ze vast onder Instellingen, Pijplijn.</p>
          ) : (
            <form action={leadOpslaan.bind(null, kaart.bezichtigerId)} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-label">
                Fase
                <Keuze name="fase" defaultValue={lead?.faseId ?? ""} required>
                  {!lead && <option value="" disabled>Kies een fase…</option>}
                  {kiesbaar.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.naam}{f.soort !== "open" ? ` (${FASE_SOORT_LABEL[f.soort].toLowerCase()})` : ""}{f.actief ? "" : " – uitgezet"}
                    </option>
                  ))}
                </Keuze>
              </label>
              <label className="flex flex-col gap-1.5 text-label">
                Eigenaar
                <Keuze name="eigenaar" defaultValue={lead?.eigenaarId ?? ""}>
                  <option value="">Niemand</option>
                  {medewerkers.map((m) => (
                    <option key={m.id} value={m.id}>{m.naam}</option>
                  ))}
                </Keuze>
              </label>
              <label className="flex flex-col gap-1.5 text-label">
                Notitie
                <Tekstvak name="notitie" defaultValue={lead?.notitie ?? ""} maxLength={MAX_LEAD_NOTITIE} rows={4} placeholder="Wat is er afgesproken of besproken?" />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={knopKlassen("primair")}>
                  <Save aria-hidden size={18} strokeWidth={1.75} />
                  {lead ? "Opslaan" : "In de pijplijn zetten"}
                </button>
              </div>
            </form>
          )}
          {lead && (
            <form action={leadUitPijplijn.bind(null, kaart.bezichtigerId)} className="mt-4 border-t border-border pt-4">
              <button type="submit" className={knopKlassen("ghost")}>Uit de pijplijn halen</button>
              <p className="mt-1 text-caption text-text-muted">De fase, eigenaar, notitie en historie verdwijnen. De bezichtigingen blijven staan.</p>
            </form>
          )}
        </Kaart>

        <Kaart titel="Contactgegevens" toelichting="E-mail, telefoon en website komen uit Realworks. Links naar social media ook, als ze daar staan; anders vul je ze zelf in.">
          {!lead ? (
            <p className="text-body-sm text-text-muted">De contactgegevens worden opgehaald zodra deze bezichtiger in de pijplijn staat.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {lead.contactOpgehaaldOp ? (
                <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-body-sm">
                  <dt className="text-text-muted">E-mail</dt>
                  <dd>{lead.email ? <a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a> : <span className="text-text-muted">Niet in Realworks</span>}</dd>
                  <dt className="text-text-muted">Telefoon</dt>
                  <dd>{lead.telefoon ? <a href={`tel:${lead.telefoon.replace(/[^0-9+]/g, "")}`} className="text-primary hover:underline">{lead.telefoon}</a> : <span className="text-text-muted">Niet in Realworks</span>}</dd>
                  {lead.website && /^https?:\/\//i.test(lead.website) && (
                    <>
                      <dt className="text-text-muted">Website</dt>
                      <dd><a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lead.website}</a></dd>
                    </>
                  )}
                  <dt className="text-text-muted">Bijgewerkt</dt>
                  <dd className="text-text-muted">{moment(lead.contactOpgehaaldOp)}</dd>
                </dl>
              ) : (
                <p className="text-body-sm text-text-muted">De contactgegevens worden opgehaald uit Realworks. Ververs de pagina over een minuut; anders volgen ze bij de eerstvolgende synchronisatie.</p>
              )}
              <form action={leadLinksOpslaan.bind(null, kaart.bezichtigerId)} className="flex flex-col gap-3 border-t border-border pt-4">
                {PLATFORMS.map((p) => (
                  <label key={p} className="flex flex-col gap-1.5 text-label">
                    <span className="flex items-center justify-between gap-2">
                      {PLATFORM_LABEL[p]}
                      {lead.links[p] && <a href={lead.links[p]} target="_blank" rel="noopener noreferrer" className="text-caption font-normal text-primary hover:underline">Openen</a>}
                    </span>
                    <Invoer name={p} type="url" defaultValue={lead.links[p] ?? ""} maxLength={300} placeholder={`https://www.${p}.com/…`} />
                  </label>
                ))}
                <button type="submit" className={`${knopKlassen("secundair")} w-fit`}>Links opslaan</button>
              </form>
            </div>
          )}
        </Kaart>
      </div>

      <Kaart titel="Bezichtigingen">
        {bezichtigingen.length === 0 ? (
          <p className="text-body-sm text-text-muted">Geen bezichtigingen in de laatste zes maanden.</p>
        ) : (
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {bezichtigingen.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3 text-body-sm">
                <span className="w-44 tabular-nums">{dagEnTijd(b.tijdstip)}</span>
                <span className="text-label">{b.woning ?? "Woning onbekend"}</span>
                <span className="text-text-muted">{b.agendatype} · {b.makelaar}{b.status === "Wacht op bevestiging" ? " · nog niet bevestigd" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      {kaart.historie.length > 0 && (
        <Kaart titel="Historie van de fase">
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {kaart.historie.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3 text-body-sm">
                <span className="w-44 tabular-nums">{moment(h.op)}</span>
                <span>{h.van ? `${h.van} → ${h.naar}` : `In de pijplijn gezet: ${h.naar}`}</span>
                <span className="text-text-muted">{h.door ?? "Onbekende gebruiker"}</span>
              </li>
            ))}
          </ul>
        </Kaart>
      )}
    </>
  );
}
