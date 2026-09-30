import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { LegeStaat, PaginaKop } from "@/components/basis";

export const metadata: Metadata = { title: "Waardebepalingen" };

export default function Waardebepalingen() {
  return (
    <>
      <PaginaKop titel="Waardebepalingen" toelichting="Van waardebepaling naar opdracht." />
      <LegeStaat icoon={ClipboardCheck} titel="Dit dashboard volgt binnenkort">
        Hier zie je straks hoeveel waardebepalingen er zijn gedaan, welke een opdracht werden en de score per makelaar.
      </LegeStaat>
    </>
  );
}
