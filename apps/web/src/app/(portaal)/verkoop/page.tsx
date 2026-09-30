import type { Metadata } from "next";
import { connection } from "next/server";
import { Kaart, KpiTegel, Label, Melding, PaginaKop } from "@/components/basis";
import { BalkenLijst, StaafGrafiek } from "@/components/grafieken";
import { MAANDEN_KORT, aantal, datum, euro, euroKort, maandJaar } from "@/lib/format";
import { haalVerkoopDashboard, kerncijfers, type VerkoopDashboard } from "@/lib/verkoop-dashboard";

export const metadata: Metadata = { title: "Verkoop en omzet" };

async function laad(): Promise<VerkoopDashboard | null> {
  try {
    return await haalVerkoopDashboard();
  } catch (fout) {
    // Alleen de melding loggen; geen gegevens.
    console.error(`verkoopdashboard laden mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    return null;
  }
}

export default async function VerkoopEnOmzet() {
  // Buiten de foutafhandeling van laad(): Next.js gebruikt hier tijdens het bouwen een signaal-fout die niet afgevangen mag worden.
  await connection();
  const d = await laad();
  if (!d) {
    return (
      <>
        <PaginaKop titel="Verkoop en omzet" />
        <Melding soort="fout" titel="We konden de cijfers niet ophalen">
          Probeer het over een paar minuten opnieuw. Blijft dit zo, neem dan contact op met de beheerder van MakelaarsCockpit.
        </Melding>
      </>
    );
  }
  const k = kerncijfers(d);
  const vorig = d.jaar - 1;
  const vandaag = d.tot;

  return (
    <>
      <PaginaKop titel="Verkoop en omzet" toelichting={`${d.jaar} tot en met ${datum(d.tot)}, vergeleken met dezelfde maanden in ${vorig}.`} />

      {d.isVoorbeeld && (
        <Melding titel="Dit zijn voorbeeldcijfers">
          Er is geen database gekoppeld, dus je ziet verzonnen cijfers. In de pilot-omgeving staan hier de cijfers van het kantoor.
        </Melding>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTegel label="Woningen verkocht" waarde={aantal(k.verkocht)} verschil={k.verkochtVerschil} vergelijking={`t.o.v. ${vorig}`} />
        <KpiTegel label="Omzet excl. btw" waarde={euroKort(k.omzet)} verschil={k.omzetVerschil} vergelijking={`t.o.v. ${vorig}`} toelichting="Geteld in de maand van passeren." />
        <KpiTegel
          label="Omzet tegenover doelstelling"
          waarde={k.doel ? `${k.omzet >= k.doel ? "+" : ""}${euroKort(k.omzet - k.doel)}` : "geen doel"}
          verschil={k.doel ? k.doelVerschil : undefined}
          vergelijking="t.o.v. doel"
        />
        <KpiTegel label="Gemiddelde omzet per woning" waarde={euro(k.perWoning)} verschil={k.perWoningVerschil} vergelijking={`t.o.v. ${vorig}`} />
      </div>

      {d.kern.nogZonderPasseermaand > 0 && (
        <Melding titel={`${d.kern.nogZonderPasseermaand} verkopen tellen nog niet mee in de omzet`}>
          Bij deze verkopen van dit jaar is de maand van passeren nog niet ingevuld. Ze tellen wel mee bij &ldquo;Woningen verkocht&rdquo;.
        </Melding>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Kaart titel="Verkocht per maand" toelichting="Aantal verkochte woningen in de maand van verkoop. Een gedeelde verkoop telt samen als één.">
          <StaafGrafiek
            categorieen={MAANDEN_KORT}
            reeksen={[
              { naam: String(vorig), waarden: d.verkochtPerMaand.vorigJaar, soort: "vergelijking" },
              { naam: String(d.jaar), waarden: d.verkochtPerMaand.ditJaar, soort: "hoofd" },
            ]}
            formatteer={aantal}
            beschrijving={`Verkochte woningen per maand in ${d.jaar} vergeleken met ${vorig}`}
          />
        </Kaart>
        <Kaart titel="Omzet per maand" toelichting="Omzet excl. btw in de maand van passeren, met de doelstelling als stippellijn.">
          <StaafGrafiek
            categorieen={MAANDEN_KORT}
            reeksen={[
              { naam: String(vorig), waarden: d.omzetPerMaand.vorigJaar, soort: "vergelijking" },
              { naam: String(d.jaar), waarden: d.omzetPerMaand.ditJaar, soort: "hoofd" },
            ]}
            doel={d.omzetPerMaand.doel.some((w) => w !== null) ? d.omzetPerMaand.doel : undefined}
            formatteer={euroKort}
            beschrijving={`Omzet per maand in ${d.jaar} vergeleken met ${vorig} en de doelstelling`}
          />
        </Kaart>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Kaart titel="Omzet per makelaar" toelichting={`Excl. btw, ${d.jaar}, naar aandeel.`}>
          <BalkenLijst rijen={d.perMakelaar.map((m) => ({ naam: m.naam, waarde: m.omzetExBtw, aanvulling: `${aantal(m.verkocht)} verkocht` }))} formatteer={euro} />
        </Kaart>

        <Kaart titel="Laatst verkocht" className="xl:col-span-2">
          <div className="-mx-6 -mb-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-overline text-text-muted">
                  <th scope="col" className="px-6 py-3 font-semibold">Woning</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Makelaar</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Verkocht</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Verkoopprijs</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">Omzet ex btw</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Passeren</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((w) => (
                  <tr key={w.id} className="h-12 border-t border-border transition-colors duration-150 hover:bg-primary-subtle/50">
                    <td className="whitespace-nowrap px-6 text-label">{w.adres}</td>
                    <td className="whitespace-nowrap px-3">
                      {w.makelaar}
                      {w.gedeeld && <span className="text-text-muted"> · gedeeld</span>}
                    </td>
                    <td className="whitespace-nowrap px-3">{maandJaar(w.verkoopmaand)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{w.verkoopprijs === null ? "" : euro(w.verkoopprijs)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{euro(w.omzetExBtw)}</td>
                    <td className="whitespace-nowrap px-6">
                      {w.passeerdatum === null ? (
                        <Label soort="neutraal">nog onbekend</Label>
                      ) : w.passeerdatum <= vandaag ? (
                        <Label soort="inkt">{datum(w.passeerdatum)}</Label>
                      ) : (
                        <Label soort="accent">{datum(w.passeerdatum)}</Label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kaart>
      </div>
    </>
  );
}
