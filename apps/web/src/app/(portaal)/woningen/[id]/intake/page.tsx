import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ClipboardList, FileUp } from "lucide-react";
import { Kaart, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { Keuze, Veld } from "@/components/formulier";
import { datum } from "@/lib/format";
import { haalIntake, type IntakeBron } from "@/lib/intake";
import { BRON_LABEL, MAX_BESTAND_MB, UPLOAD_SOORTEN } from "@/lib/intake-bestanden";
import { bestandUploaden, bronOpnieuwVerwerken, intakeStarten } from "./acties";

export const metadata: Metadata = { title: "Intake" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<IntakeBron["verwerkstatus"], { label: string; soort: "neutraal" | "info" | "succes" | "fout" }> = {
  nieuw: { label: "Wacht op verwerking", soort: "neutraal" },
  bezig: { label: "Wordt verwerkt", soort: "info" },
  verwerkt: { label: "Verwerkt", soort: "succes" },
  mislukt: { label: "Mislukt", soort: "fout" },
  verwijderd: { label: "Verwijderd na verkoop", soort: "neutraal" },
};

type Zoek = { geupload?: string; wachtrij?: string; checklist?: string; opnieuw?: string; fout?: string };


export default async function Intake({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Zoek> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [intake, zoek] = await Promise.all([haalIntake(id), searchParams]);
  if (!intake) notFound();
  const { woning, dossier, bronnen, velden } = intake;
  const telling = (status: string) => velden.filter((v) => v.status === status).length;
  const checklistVelden = velden.filter((v) => v.bronType === "checklist_form" && v.status !== "afgewezen").length;

  return (
    <>
      <Link href={`/woningen/${woning.id}`} className="flex w-fit items-center gap-1.5 text-body-sm text-primary hover:underline">
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
        Terug naar de woning
      </Link>
      <PaginaKop titel="Intake" toelichting={[woning.adres, woning.plaats].filter(Boolean).join(", ")} />

      {zoek.geupload === "1" && <Melding titel="Bestand toegevoegd">Het bestand wordt verwerkt; de gevonden gegevens verschijnen als voorstel in het profiel.</Melding>}
      {zoek.wachtrij === "0" && (
        <Melding soort="fout" titel="Bestand bewaard, verwerking niet gestart">
          Het bestand staat in het dossier, maar kon niet in de wachtrij worden gezet. Het wordt opnieuw aangeboden zodra de verwerking draait.
        </Melding>
      )}
      {zoek.opnieuw === "1" && <Melding titel="Opnieuw aangeboden">De bron staat weer in de wachtrij voor verwerking.</Melding>}
      {zoek.checklist === "1" && <Melding titel="Checklist opgeslagen">De ingevulde gegevens staan als voorstel in het profiel.</Melding>}
      {zoek.fout && (
        <Melding soort="fout" titel="Uploaden is niet gelukt">
          {zoek.fout}
        </Melding>
      )}

      {!dossier ? (
        <>
          <LegeStaat icoon={ClipboardList} titel="Nog geen intake voor deze woning">
            Start de intake om het gespreksverslag, het transcript en de checklist te verzamelen. Daaruit ontstaat het woningprofiel.
          </LegeStaat>
          <form action={intakeStarten.bind(null, woning.id)}>
            <button type="submit" className={knopKlassen("primair")}>Intake starten</button>
          </form>
        </>
      ) : dossier.status === "opgeschoond" ? (
        <Melding titel="Dossier opgeschoond na verkoop">De bronbestanden zijn verwijderd; het bevestigde woningprofiel is bewaard.</Melding>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Kaart titel="Bestand toevoegen" toelichting={`PDF of tekstbestand, hoogstens ${MAX_BESTAND_MB} MB.`}>
              <form action={bestandUploaden.bind(null, woning.id)} className="flex flex-col gap-4">
                <Veld id="soort" label="Soort bestand">
                  <Keuze id="soort" name="soort" required defaultValue="">
                    <option value="" disabled>Kies…</option>
                    {Object.entries(UPLOAD_SOORTEN).map(([waarde, s]) => (
                      <option key={waarde} value={waarde}>{s.label}</option>
                    ))}
                  </Keuze>
                </Veld>
                <Veld id="bestand" label="Bestand">
                  <input
                    id="bestand"
                    name="bestand"
                    type="file"
                    required
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="text-body-sm file:mr-3 file:h-10 file:rounded-md file:border-[1.5px] file:border-primary file:bg-surface file:px-4 file:font-semibold file:text-primary hover:file:bg-primary-subtle"
                  />
                </Veld>
                <button type="submit" className={`${knopKlassen("primair")} w-fit`}>
                  <FileUp aria-hidden size={18} strokeWidth={2} />
                  Uploaden
                </button>
              </form>
            </Kaart>

            <Kaart titel="Checklist" toelichting="De woningchecklist invullen in het portaal, in plaats van op papier.">
              <p className="mb-4 text-body-sm text-text-muted">
                {checklistVelden === 0 ? "Nog niets ingevuld." : `${checklistVelden} ${checklistVelden === 1 ? "veld" : "velden"} ingevuld.`}
              </p>
              <Link href={`/woningen/${woning.id}/intake/checklist`} className={knopKlassen("secundair")}>
                {checklistVelden === 0 ? "Checklist invullen" : "Checklist bijwerken"}
              </Link>
            </Kaart>
          </div>

          <Kaart titel="Woningprofiel" toelichting="Wat uit de bronnen is gehaald. Beoordelen per veld volgt in de volgende versie.">
            <div className="flex flex-wrap gap-2">
              <Label soort="succes">{telling("bevestigd")} bevestigd</Label>
              <Label soort="info">{telling("voorstel")} voorstel</Label>
              <Label soort={telling("conflict") > 0 ? "accent" : "neutraal"}>{telling("conflict")} conflict</Label>
            </div>
          </Kaart>

          <Kaart titel="Bronnen">
            {bronnen.length === 0 ? (
              <p className="text-body-sm text-text-muted">Nog geen bestanden.</p>
            ) : (
              <div className="-mx-6 -mb-6 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-body-sm">
                  <thead>
                    <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                      <th scope="col" className="px-6 py-3 font-semibold">Ontvangen</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Soort</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Bestand</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-6 py-3"><span className="sr-only">Actie</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bronnen.map((b) => (
                      <tr key={b.id} className="h-12 border-t border-border">
                        <td className="whitespace-nowrap px-6">{datum(new Date(b.ontvangenOp))}</td>
                        <td className="whitespace-nowrap px-3">{BRON_LABEL[b.type]}</td>
                        <td className="max-w-64 truncate px-3 text-text-muted">{b.bestandsnaam ?? ""}</td>
                        <td className="px-3"><Label soort={STATUS[b.verwerkstatus].soort}>{STATUS[b.verwerkstatus].label}</Label></td>
                        <td className="px-6 text-right">
                          {b.opnieuwMogelijk && (
                            <form action={bronOpnieuwVerwerken.bind(null, woning.id, b.id)}>
                              <button type="submit" className={knopKlassen("ghost")}>Opnieuw verwerken</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Kaart>
        </>
      )}
    </>
  );
}
