import type { Metadata } from "next";
import { connection } from "next/server";
import { PaginaKop } from "@/components/basis";
import { haalMedewerkerKeuzes } from "@/lib/verkoop-invoer";
import { verkoopToevoegen } from "../acties";
import { VerkoopFormulier } from "../verkoop-formulier";

export const metadata: Metadata = { title: "Omzetregel toevoegen" };

export default async function NieuweVerkoop() {
  await connection();
  const medewerkers = await haalMedewerkerKeuzes();
  return (
    <>
      <PaginaKop titel="Omzetregel toevoegen" toelichting="Voor een taxatie, verhuur of een verkoop die niet in Realworks staat. Verkochte woningen uit Realworks komen vanzelf in de lijst." />
      <VerkoopFormulier
        actie={verkoopToevoegen}
        begin={{ soort: "koop", adres: "", verkoopdatum: "", passeerdatum: "", omzetMaand: "", verkoopprijs: "", courtageSoort: "percentage", courtagePercentage: "", courtageBedrag: "", opstartnota: "", notaVerstuurd: false, verdeling: [] }}
        medewerkers={medewerkers}
        realworksVelden={false}
        terugNaar="/verkoop/verkopen"
        knoptekst="Toevoegen"
      />
    </>
  );
}
