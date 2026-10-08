import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Lock } from "lucide-react";
import { STAP_STATUSSEN, STAP_STATUS_LABEL, WONING_FASE_LABEL, stappenVoorSpoor, voortgang } from "@makelaarscockpit/domain";
import { Kaart, Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Invoer, Keuze } from "@/components/formulier";
import { StapTeken, stapOmschrijving } from "@/components/stap-status";
import { euro } from "@/lib/format";
import { haalWoning } from "@/lib/woningen";
import { backofficeBijwerken, stapBijwerken } from "../acties";

export const metadata: Metadata = { title: "Woning" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Woning({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ opgeslagen?: string; fout?: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ woning, spoor, eerder, medewerkers }, { opgeslagen, fout }] = await Promise.all([haalWoning(id), searchParams]);
  if (!woning) notFound();
  const definities = stappenVoorSpoor(spoor);
  const eerdereDefinities = stappenVoorSpoor("verkoop");
  const v = voortgang(woning.stappen);

  return (
    <>
      <Link href={spoor === "kovk" ? "/woningen?spoor=kovk" : "/woningen"} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        {spoor === "kovk" ? "Alle verkochte woningen" : "Alle woningen"}
      </Link>
      <PaginaKop titel={woning.adres ?? "Woning"} toelichting={[woning.plaats, `makelaar ${woning.makelaar}`, woning.vraagprijs === null ? null : `vraagprijs ${euro(woning.vraagprijs)}`].filter(Boolean).join(" · ")}>
        <div className="flex flex-wrap gap-2">
          <Label soort={woning.fase === "voorbereiding" ? "info" : woning.fase === "verkocht_ov" ? "accent" : "inkt"}>{WONING_FASE_LABEL[woning.fase]}</Label>
          <Label soort="neutraal">{v.afgerond} van {v.totaal} stappen klaar</Label>
        </div>
      </PaginaKop>

      {opgeslagen === "1" && <Melding titel="Opgeslagen">De wijziging staat op het bord.</Melding>}
      {fout && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {fout}
        </Melding>
      )}
      {woning.fase === "voorbereiding" && (
        <Melding titel="Deze woning staat nog niet online">
          Realworks levert de gegevens van de woning zodra die is gepubliceerd. Tot die tijd is ze bekend uit de afspraken in de agenda.
        </Melding>
      )}

      <Kaart titel="Backoffice" toelichting="Wie van de backoffice deze woning begeleidt.">
        <form action={backofficeBijwerken.bind(null, woning.id)} className="flex flex-wrap items-end gap-3">
          <Keuze name="backoffice" defaultValue={woning.backofficeMedewerkerId ?? ""} aria-label="Backoffice" className="sm:w-72">
            <option value="">{woning.backoffice && !woning.backofficeMedewerkerId ? `${woning.backoffice} (uit de Excel)` : "Nog niemand"}</option>
            {medewerkers.map((m) => (
              <option key={m.id} value={m.id}>{m.naam}</option>
            ))}
          </Keuze>
          <button type="submit" className={knopKlassen("secundair")}>Opslaan</button>
        </form>
      </Kaart>

      <Kaart
        titel={spoor === "kovk" ? "Koopovereenkomst" : "Stappen"}
        toelichting={spoor === "kovk" ? "Van verkocht tot en met de overdracht. Vul bij de bedenktijd de datum in waarop die verloopt; daarna is de stap vanzelf klaar." : "Een stap die Realworks als klaar ziet, staat vast. De andere stappen zet je zelf."}
      >
        <ul className="-mx-6 -mb-6 divide-y divide-border border-t border-border">
          {woning.stappen.map((s, i) => {
            const def = definities[i]!;
            const vast = s.status === "klaar" && s.bron === "realworks";
            return (
              <li key={s.sleutel} id={`stap-${s.sleutel}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                <StapTeken label={def.label} stap={s} />
                <div className="min-w-48 flex-1">
                  <p className="text-label">{def.label}</p>
                  <p className="text-body-sm text-text-muted">{stapOmschrijving(def.label, s).slice(def.label.length + 2)}</p>
                </div>
                {vast ? (
                  <span className="inline-flex items-center gap-1.5 text-body-sm text-text-muted">
                    <Lock aria-hidden size={14} strokeWidth={2} />
                    Vast uit Realworks
                  </span>
                ) : (
                  <form action={stapBijwerken.bind(null, woning.id)} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="stap" value={s.sleutel} />
                    <Keuze name="status" defaultValue={s.bron === "handmatig" ? s.status : "open"} aria-label={`Status van ${def.label}`} className="w-48">
                      {STAP_STATUSSEN.map((status) => (
                        <option key={status} value={status}>{STAP_STATUS_LABEL[status]}</option>
                      ))}
                    </Keuze>
                    <Invoer name="datum" type="date" defaultValue={s.bron === "handmatig" ? (s.datum ?? "") : ""} aria-label={`Datum van ${def.label}`} className="w-40" />
                    <button type="submit" className={knopKlassen("ghost")}>Opslaan</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Kaart>

      {eerder && (
        <Kaart titel="Stappen vóór de verkoop" toelichting="Ter informatie; deze woning is verkocht.">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {eerder.stappen.map((s, i) => (
              <li key={s.sleutel} className="inline-flex items-center gap-2 text-body-sm">
                <StapTeken label={eerdereDefinities[i]!.label} stap={s} />
                {eerdereDefinities[i]!.kort}
              </li>
            ))}
          </ul>
        </Kaart>
      )}
    </>
  );
}
