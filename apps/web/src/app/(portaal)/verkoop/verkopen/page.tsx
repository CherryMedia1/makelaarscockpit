import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ClipboardList, Plus } from "lucide-react";
import { Kaart, Label, LegeStaat, Melding, PaginaKop, knopKlassen } from "@/components/basis";
import { datum, euro } from "@/lib/format";
import { haalVerkopenOverzicht, type VerkoopOverzichtRegel } from "@/lib/verkoop-invoer";

export const metadata: Metadata = { title: "Verkopen" };

const SOORT_LABEL: Record<VerkoopOverzichtRegel["soort"], string> = { koop: "Koop", split: "Split", nieuwbouw: "Nieuwbouw", taxatie: "Taxatie", huur: "Verhuur", overig: "Overig" };
const HERKOMST_LABEL: Record<VerkoopOverzichtRegel["herkomst"], string> = { koppeling: "Realworks", import: "Excel", handmatig: "Handmatig" };

const d = (iso: string | null) => (iso ? datum(new Date(`${iso}T00:00:00`)) : "");

export default async function Verkopen({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await connection();
  const filter = (await searchParams).filter === "open" ? "open" : "alle";
  const { regels, vanafJaar, isVoorbeeld } = await haalVerkopenOverzicht();
  const open = regels.filter((r) => !r.courtageIngevuld && r.herkomst === "koppeling");
  const getoond = filter === "open" ? open : regels;

  return (
    <>
      <PaginaKop titel="Verkopen" toelichting={`Alle omzetregels vanaf ${vanafJaar}. Vul per verkoop de courtage, de opstartnota en de verdeling in.`}>
        <Link href="/verkoop/verkopen/nieuw" className={knopKlassen("primair")}>
          <Plus aria-hidden size={18} strokeWidth={2} />
          Omzetregel toevoegen
        </Link>
      </PaginaKop>

      {isVoorbeeld && (
        <Melding titel="Geen database gekoppeld">
          Lokaal zonder database is er geen lijst. In de pilot-omgeving staan hier de verkopen van het kantoor.
        </Melding>
      )}

      <div className="flex gap-2" role="tablist" aria-label="Filter">
        <Link href="/verkoop/verkopen" role="tab" aria-selected={filter === "alle"} className={knopKlassen(filter === "alle" ? "secundair" : "ghost")}>
          Alle ({regels.length})
        </Link>
        <Link href="/verkoop/verkopen?filter=open" role="tab" aria-selected={filter === "open"} className={knopKlassen(filter === "open" ? "secundair" : "ghost")}>
          Courtage nog invullen ({open.length})
        </Link>
      </div>

      {getoond.length === 0 ? (
        <LegeStaat icoon={ClipboardList} titel={filter === "open" ? "Alles is ingevuld" : "Nog geen verkopen"}>
          {filter === "open" ? "Elke verkoop uit Realworks heeft een courtage." : "Verkopen uit Realworks verschijnen hier na de dagelijkse synchronisatie."}
        </LegeStaat>
      ) : (
        <Kaart>
          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Woning</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Soort</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Makelaar</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Verkocht</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Passeren</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Verkoopprijs</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">Omzet ex btw</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Bron</th>
                </tr>
              </thead>
              <tbody>
                {getoond.map((r) => (
                  <tr key={r.id} className="h-12 border-t border-border transition-colors duration-150 hover:bg-primary-subtle/50">
                    <td className="whitespace-nowrap px-6">
                      <Link href={`/verkoop/verkopen/${r.id}`} className="text-label text-primary hover:underline">
                        {r.adres ?? "Adres onbekend"}
                      </Link>
                      {r.onderVoorbehoud && <span className="text-text-muted"> · onder voorbehoud</span>}
                    </td>
                    <td className="whitespace-nowrap px-3">{SOORT_LABEL[r.soort]}</td>
                    <td className="whitespace-nowrap px-3">{r.makelaars || <span className="text-text-muted">nog geen</span>}</td>
                    <td className="whitespace-nowrap px-3">{d(r.verkoopdatum)}</td>
                    <td className="whitespace-nowrap px-3">{d(r.passeerdatum) || <span className="text-text-muted">nog onbekend</span>}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{r.verkoopprijs === null ? "" : euro(r.verkoopprijs)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">
                      {r.omzetExBtw === null ? <Label soort={r.herkomst === "koppeling" ? "waarschuwing" : "neutraal"}>courtage invullen</Label> : euro(r.omzetExBtw)}
                    </td>
                    <td className="whitespace-nowrap px-6 text-text-muted">{HERKOMST_LABEL[r.herkomst]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kaart>
      )}
    </>
  );
}
