import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Check, ExternalLink, Pencil, X } from "lucide-react";
import { profielOverzicht, toonWaarde, type VeldOverzicht } from "@makelaarscockpit/ai";
import { Kaart, Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Foutregel, Invoer } from "@/components/formulier";
import { haalIntake, tijdAnker, type IntakeVeld } from "@/lib/intake";
import { BRON_LABEL } from "@/lib/intake-bestanden";
import { veldBeoordelen } from "../acties";

export const metadata: Metadata = { title: "Woningprofiel" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Onder deze zekerheid krijgt een voorstel het label "onzeker", zodat het extra aandacht krijgt. */
const ONZEKER = 0.7;

const STATUS = {
  bevestigd: { label: "Bevestigd", soort: "succes" },
  voorstel: { label: "Te beoordelen", soort: "info" },
  conflict: { label: "Conflict", soort: "accent" },
} as const;

const veldAnker = (pad: string) => `veld-${pad.replace(/[^a-z0-9]+/gi, "-")}`;

type Context = { woningId: string; bronnaam: Map<string, string>; fout: { veld?: string | undefined; melding?: string | undefined } };

function Bewijs({ rij, ctx }: { rij: IntakeVeld; ctx: Context }) {
  const b = rij.bewijs;
  if (!b?.citaat) return null;
  const link =
    rij.bronId && b.tijdstempel ? `/woningen/${ctx.woningId}/intake/bron/${rij.bronId}#${tijdAnker(b.tijdstempel)}`
    : rij.bronId && b.pagina ? `/woningen/${ctx.woningId}/intake/bron/${rij.bronId}/bestand#page=${b.pagina}`
    : null;
  return (
    <figure className="mt-2 border-l-2 border-border-strong pl-3">
      <blockquote className="text-body-sm italic text-text-muted">“{b.citaat}”</blockquote>
      {link && (
        <figcaption className="mt-1">
          <a href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
            <ExternalLink aria-hidden size={14} strokeWidth={2} />
            {b.tijdstempel ? `In het transcript op ${b.tijdstempel}` : `In het document, pagina ${b.pagina}`}
          </a>
        </figcaption>
      )}
    </figure>
  );
}

function Rij({ rij, ctx }: { rij: IntakeVeld; ctx: Context }) {
  const bron = rij.bronId ? (ctx.bronnaam.get(rij.bronId) ?? (rij.bronType ? BRON_LABEL[rij.bronType] : "Bron")) : "Ingevoerd door een medewerker";
  const knop = (soort: "bevestigen" | "afwijzen") => veldBeoordelen.bind(null, ctx.woningId, rij.id, soort);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-56 flex-1">
        <p className="text-body font-semibold">{toonWaarde(rij.waarde)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-text-muted">
          <span>{bron}</span>
          {rij.status === "bevestigd" && <Label soort="succes">Bevestigd</Label>}
          {rij.status !== "bevestigd" && rij.zekerheid !== null && rij.zekerheid < ONZEKER && <Label soort="waarschuwing">Onzeker</Label>}
        </p>
        <Bewijs rij={rij} ctx={ctx} />
      </div>
      {rij.status !== "bevestigd" && (
        <div className="flex gap-2">
          <form action={knop("bevestigen")}>
            <button type="submit" className={knopKlassen("secundair")}>
              <Check aria-hidden size={16} strokeWidth={2} />
              Bevestigen
            </button>
          </form>
          <form action={knop("afwijzen")}>
            <button type="submit" className={knopKlassen("ghost")}>
              <X aria-hidden size={16} strokeWidth={2} />
              Afwijzen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Veldblok({ veld, ctx }: { veld: VeldOverzicht<IntakeVeld>; ctx: Context }) {
  const anker = veldAnker(veld.pad);
  const basis = veld.rijen.find((r) => r.status === "bevestigd") ?? veld.rijen[0]!;
  const fout = veld.rijen.some((r) => r.id === ctx.fout.veld) ? ctx.fout.melding : undefined;
  return (
    <li id={anker} className="scroll-mt-24 px-6 py-4 target:bg-primary-subtle/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-label">{veld.label}</h3>
        <Label soort={STATUS[veld.status].soort}>{STATUS[veld.status].label}</Label>
      </div>
      <div className="divide-y divide-border">
        {veld.rijen.map((rij) => (
          <Rij key={rij.id} rij={rij} ctx={ctx} />
        ))}
      </div>
      <details className="group mt-1" open={Boolean(fout)}>
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-body-sm text-primary hover:underline">
          <Pencil aria-hidden size={14} strokeWidth={2} />
          Corrigeren
        </summary>
        <form action={veldBeoordelen.bind(null, ctx.woningId, basis.id, "corrigeren")} className="mt-2 flex flex-wrap items-start gap-2">
          <div className="flex w-full max-w-sm flex-col gap-1.5">
            <Invoer id={`${anker}-waarde`} name="waarde" defaultValue={toonWaarde(basis.waarde)} aria-label={`Juiste waarde voor ${veld.label}`} fout={fout} autoComplete="off" />
            {fout && <Foutregel id={`${anker}-waarde-fout`}>{fout}</Foutregel>}
          </div>
          <button type="submit" className={knopKlassen("secundair")}>Opslaan als bevestigd</button>
        </form>
      </details>
    </li>
  );
}

export default async function Profiel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fout?: string; veld?: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [intake, zoek] = await Promise.all([haalIntake(id), searchParams]);
  if (!intake) notFound();
  if (!intake.dossier) redirect(`/woningen/${id}/intake`);

  const overzicht = profielOverzicht(intake.velden);
  const ctx: Context = {
    woningId: id,
    bronnaam: new Map(intake.bronnen.map((b) => [b.id, b.bestandsnaam ? `${BRON_LABEL[b.type]} · ${b.bestandsnaam}` : BRON_LABEL[b.type]])),
    fout: { veld: zoek.veld, melding: zoek.fout },
  };
  const algemeneFout = zoek.fout && !zoek.veld;
  const opgeschoond = intake.dossier.status === "opgeschoond";

  return (
    <>
      <Link href={`/woningen/${id}/intake`} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Terug naar de intake
      </Link>
      <PaginaKop titel="Woningprofiel" toelichting={[intake.woning.adres, intake.woning.plaats].filter(Boolean).join(", ")}>
        <Label soort={overzicht.teBeoordelen === 0 ? "succes" : "info"}>
          {overzicht.teBeoordelen === 0 ? "Alles beoordeeld" : `${overzicht.teBeoordelen} te beoordelen`}
        </Label>
      </PaginaKop>

      {algemeneFout && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {zoek.fout}
        </Melding>
      )}
      <Melding titel="Alleen bevestigde velden tellen">
        De woningtekst wordt straks alleen uit bevestigde velden geschreven. Controleer elk voorstel tegen het citaat; bij twijfel open je de bron.
      </Melding>

      {overzicht.groepen.length === 0 && overzicht.conflicten.length === 0 && (
        <Kaart titel="Nog geen gegevens">
          <p className="text-body-sm text-text-muted">Vul de checklist in of upload een gespreksverslag of transcript; de gevonden gegevens verschijnen hier.</p>
        </Kaart>
      )}

      {overzicht.conflicten.length > 0 && !opgeschoond && (
        <Kaart titel="Conflicten" toelichting="Bronnen spreken elkaar tegen. Bevestig de juiste waarde, of corrigeer.">
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {overzicht.conflicten.map((v) => (
              <Veldblok key={v.pad} veld={v} ctx={ctx} />
            ))}
          </ul>
        </Kaart>
      )}

      {overzicht.groepen.map((g) => (
        <Kaart key={g.sleutel} titel={g.titel}>
          <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
            {g.velden.map((v) => (
              <Veldblok key={v.pad} veld={v} ctx={ctx} />
            ))}
          </ul>
        </Kaart>
      ))}
    </>
  );
}
