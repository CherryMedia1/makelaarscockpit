import type { Metadata } from "next";
import { Home } from "lucide-react";
import { LegeStaat, PaginaKop } from "@/components/basis";

export const metadata: Metadata = { title: "Woningen in verkoop" };

export default function Woningen() {
  return (
    <>
      <PaginaKop titel="Woningen in verkoop" toelichting="Per woning de stappen tot en met de koopovereenkomst." />
      <LegeStaat icoon={Home} titel="Dit dashboard volgt binnenkort">
        Hier zie je straks per woning wat er klaar is en wat nog moet gebeuren: foto&apos;s, tekst, Funda, bord en koopovereenkomst.
      </LegeStaat>
    </>
  );
}
