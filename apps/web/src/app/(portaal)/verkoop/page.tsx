import type { Metadata } from "next";
import { Kaart, KpiTegel, Label, Melding, PaginaKop } from "@/components/basis";
import { BalkenLijst, StaafGrafiek } from "@/components/grafieken";
import { MAANDEN_KORT, datum, euro, euroKort, getal } from "@/lib/format";
import { haalVerkoopDashboard, kerncijfers } from "@/lib/verkoop-dashboard";

export const metadata: Metadata = { title: "Verkoop en omzet" };

export default async function VerkoopEnOmzet() {
  const d = await haalVerkoopDashboard();
  const k = kerncijfers(d);
  const vorig = d.jaar - 1;

  return (
    <>
      <PaginaKop titel="Verkoop en omzet" toelichting={`${d.jaar} tot en met ${datum(d.tot)}, vergeleken met dezelfde periode in ${vorig}.`} />

      {d.isVoorbeeld && (
        <Melding titel="Dit zijn voorbeeldcijfers">
          De opmaak is definitief, de cijfers nog niet. Zodra de koppeling met Realworks en de historie uit Excel zijn aangesloten, zie je hier de cijfers van je eigen kantoor.
        </Melding>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTegel label="Woningen verkocht" waarde={getal(k.verkocht)} verschil={k.verkochtVerschil} vergelijking={`t.o.v. ${vorig}`} />
        <KpiTegel label="Omzet excl. btw" waarde={euroKort(k.omzet)} verschil={k.omzetVerschil} vergelijking={`t.o.v. ${vorig}`} />
        <KpiTegel label="Omzet tegenover doelstelling" waarde={`${k.omzet >= k.doel ? "+" : ""}${euroKort(k.omzet - k.doel)}`} verschil={k.doelVerschil} vergelijking="t.o.v. doel" />
        <KpiTegel
          label="Gemiddelde omzet per woning"
          waarde={euro(k.gemiddeldeOmzetPerWoning)}
          verschil={k.gemiddeldeOmzetPerWoningVorig ? (k.gemiddeldeOmzetPerWoning - k.gemiddeldeOmzetPerWoningVorig) / k.gemiddeldeOmzetPerWoningVorig : undefined}
          vergelijking={`t.o.v. ${vorig}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Kaart titel="Verkocht per maand" toelichting="Aantal verkochte woningen per maand.">
          <StaafGrafiek
            categorieen={MAANDEN_KORT}
            reeksen={[
              { naam: String(vorig), waarden: d.verkochtPerMaand.vorigJaar, soort: "vergelijking" },
              { naam: String(d.jaar), waarden: d.verkochtPerMaand.ditJaar, soort: "hoofd" },
            ]}
            formatteer={getal}
            beschrijving={`Verkochte woningen per maand in ${d.jaar} vergeleken met ${vorig}`}
          />
        </Kaart>
        <Kaart titel="Omzet per maand" toelichting="Omzet excl. btw, met de doelstelling als stippellijn.">
          <StaafGrafiek
            categorieen={MAANDEN_KORT}
            reeksen={[
              { naam: String(vorig), waarden: d.omzetPerMaand.vorigJaar, soort: "vergelijking" },
              { naam: String(d.jaar), waarden: d.omzetPerMaand.ditJaar, soort: "hoofd" },
            ]}
            doel={d.omzetPerMaand.doel}
            formatteer={euroKort}
            beschrijving={`Omzet per maand in ${d.jaar} vergeleken met ${vorig} en de doelstelling`}
          />
        </Kaart>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Kaart titel="Omzet per makelaar" toelichting={`Excl. btw, ${d.jaar}.`}>
          <BalkenLijst rijen={d.perMakelaar.map((m) => ({ naam: m.naam, waarde: m.omzetExBtw, aanvulling: `${getal(m.verkocht)} verkocht` }))} formatteer={euro} />
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
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Omzet excl. btw</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((w) => (
                  <tr key={w.id} className="h-14 border-t border-border transition-colors duration-150 hover:bg-primary-subtle/50">
                    <td className="px-6 py-2">
                      <span className="block whitespace-nowrap text-label">{w.adres}</span>
                      <span className="block text-caption font-normal text-text-muted">{w.plaats}</span>
                    </td>
                    <td className="px-3">{w.makelaar}</td>
                    <td className="whitespace-nowrap px-3">{datum(w.verkoopdatum)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{euro(w.verkoopprijs)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{w.omzetExBtw === null ? <span className="text-text-muted">nog invullen</span> : euro(w.omzetExBtw)}</td>
                    <td className="px-6">
                      <Label soort={w.status === "Verkocht" ? "inkt" : "accent"}>{w.status}</Label>
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
