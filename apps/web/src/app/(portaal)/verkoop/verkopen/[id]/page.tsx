import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import type { RuweVerkoopInvoer } from "@makelaarscockpit/domain";
import { Label, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { haalVerkoop, type VerkoopDetail } from "@/lib/verkoop-invoer";
import { verkoopOpslaan } from "../acties";
import { VerkoopFormulier } from "../verkoop-formulier";

export const metadata: Metadata = { title: "Verkoop" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const procentTekst = (fractie: number) => String(Math.round(fractie * 10000) / 100).replace(".", ",");
const bedragTekst = (bedrag: number | null) => (bedrag === null ? "" : String(bedrag).replace(".", ","));

/** De opgeslagen verkoop in de vorm van het formulier (tekstvelden). */
function naarFormulier(v: VerkoopDetail): RuweVerkoopInvoer {
  return {
    soort: v.soort,
    adres: v.adres ?? "",
    verkoopdatum: v.verkoopdatum ?? "",
    passeerdatum: v.passeerdatum ?? "",
    omzetMaand: v.omzetMaand ? v.omzetMaand.slice(0, 7) : "",
    verkoopprijs: bedragTekst(v.verkoopprijs),
    courtageSoort: v.courtage?.soort ?? (v.soort === "taxatie" ? "geen" : "percentage"),
    courtagePercentage: v.courtage?.soort === "percentage" ? procentTekst(v.courtage.fractie) : "",
    courtageBedrag: v.courtage?.soort === "vast" ? bedragTekst(v.courtage.bedrag) : "",
    opstartnota: v.opstartnota === 0 ? "" : bedragTekst(v.opstartnota),
    notaVerstuurd: v.notaVerstuurd,
    verdeling: v.verdeling.map((d) => ({ medewerkerId: d.medewerkerId ?? "", makelaar: d.makelaar, aandeel: procentTekst(d.aandeel) })),
  };
}

const HERKOMST: Record<VerkoopDetail["herkomst"], string> = { koppeling: "uit Realworks", import: "uit de Excel-historie", handmatig: "handmatig toegevoegd" };

export default async function Verkoop({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ opgeslagen?: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ verkoop, medewerkers }, { opgeslagen }] = await Promise.all([haalVerkoop(id), searchParams]);
  if (!verkoop) notFound();
  const opslaan = verkoopOpslaan.bind(null, verkoop.id);

  return (
    <>
      <Link href="/verkoop/verkopen" className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Alle verkopen
      </Link>
      <PaginaKop titel={verkoop.adres ?? "Verkoop"} toelichting={`Regel ${HERKOMST[verkoop.herkomst]}; laatst gewijzigd ${verkoop.gewijzigdOp}.`}>
        <div className="flex flex-wrap gap-2">
          {verkoop.onderVoorbehoud && <Label soort="info">verkocht onder voorbehoud</Label>}
          {verkoop.object?.status && <Label soort="neutraal">Realworks: {verkoop.object.status.toLowerCase().replaceAll("_", " ")}</Label>}
          {verkoop.courtage === null && verkoop.herkomst === "koppeling" && <Label soort="waarschuwing">courtage invullen</Label>}
        </div>
      </PaginaKop>

      {opgeslagen === "1" && (
        <Melding titel="Opgeslagen">
          De omzet van deze verkoop telt nu mee op het dashboard.{" "}
          <Link href="/verkoop" className={`${knopKlassen("ghost")} h-auto px-1 py-0`}>
            Naar Verkoop en omzet
          </Link>
        </Melding>
      )}

      <VerkoopFormulier
        actie={opslaan}
        begin={naarFormulier(verkoop)}
        medewerkers={medewerkers}
        realworksVelden={verkoop.herkomst === "koppeling"}
        terugNaar="/verkoop/verkopen"
        knoptekst="Opslaan"
      />
    </>
  );
}
