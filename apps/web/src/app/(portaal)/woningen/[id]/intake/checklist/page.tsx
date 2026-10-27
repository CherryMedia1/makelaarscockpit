import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { checklistFormulier } from "@makelaarscockpit/ai";
import { PaginaKop } from "@/components/basis";
import { haalIntake } from "@/lib/intake";
import { checklistOpslaan } from "../acties";
import { ChecklistFormulier } from "./checklist-formulier";

export const metadata: Metadata = { title: "Checklist" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Checklist({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const intake = await haalIntake(id);
  if (!intake) notFound();
  if (!intake.dossier || intake.dossier.status !== "open") redirect(`/woningen/${id}/intake`);

  // Het formulier toont wat eerder in de checklist is ingevuld, met de eigen rijnummers; andere bronnen staan in het profiel.
  const eerder = intake.velden.filter((v) => v.bronType === "checklist_form" && v.status !== "afgewezen");
  const groepen = checklistFormulier(eerder);

  return (
    <>
      <Link href={`/woningen/${id}/intake`} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Terug naar de intake
      </Link>
      <PaginaKop
        titel="Checklist"
        toelichting={`${[intake.woning.adres, intake.woning.plaats].filter(Boolean).join(", ")} · Vul in wat bekend is; lege velden kunnen later uit het gesprek of een meetrapport komen.`}
      />
      <ChecklistFormulier actie={checklistOpslaan.bind(null, id)} groepen={groepen} terugNaar={`/woningen/${id}/intake`} />
    </>
  );
}
