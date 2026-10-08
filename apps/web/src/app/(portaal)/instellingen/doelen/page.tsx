import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { vereisSessie } from "@/lib/inlog/sessie";
import { haalOmzetdoelen, jaarInNederland } from "@/lib/verkoop-invoer";
import { doelenOpslaan } from "./acties";
import { DoelenFormulier } from "./doelen-formulier";

export const metadata: Metadata = { title: "Doelstellingen" };

const bedragTekst = (w: number) => (w === 0 ? "" : String(w).replace(".", ","));

export default async function Doelen({ searchParams }: { searchParams: Promise<{ jaar?: string; opgeslagen?: string }> }) {
  await connection();
  const sessie = await vereisSessie();
  const { jaar: jaarTekst, opgeslagen } = await searchParams;
  const ditJaar = jaarInNederland();
  const jaar = /^\d{4}$/.test(jaarTekst ?? "") ? Number(jaarTekst) : ditJaar;

  if (!magKantoorBeheren(sessie.rol)) {
    return (
      <>
        <PaginaKop titel="Doelstellingen" />
        <Melding titel="Alleen voor de kantoorbeheerder">De omzetdoelstellingen per maand worden door de kantoorbeheerder vastgelegd.</Melding>
      </>
    );
  }

  const doelen = await haalOmzetdoelen(jaar);
  const begin = Array.from({ length: 12 }, (_, i) => bedragTekst(doelen.find((d) => d.maand === i + 1)?.waarde ?? 0));

  return (
    <>
      <PaginaKop titel="Doelstellingen" toelichting="Omzetdoel per maand, excl. btw. Het dashboard toont dit als stippellijn naast de omzet.">
        <div className="flex gap-2">
          {[ditJaar - 1, ditJaar, ditJaar + 1].map((j) => (
            <Link key={j} href={`/instellingen/doelen?jaar=${j}`} className={knopKlassen(j === jaar ? "secundair" : "ghost")} aria-current={j === jaar ? "page" : undefined}>
              {j}
            </Link>
          ))}
        </div>
      </PaginaKop>
      {opgeslagen === "1" && <Melding titel="Opgeslagen">De doelstellingen voor {jaar} staan op het dashboard.</Melding>}
      <DoelenFormulier key={jaar} actie={doelenOpslaan.bind(null, jaar)} begin={begin} jaar={jaar} />
    </>
  );
}
