"use client";

// Het checklistformulier, gegenereerd uit het woningprofiel-schema (packages/ai). Clientcomponent vanwege useActionState:
// de controle gebeurt op de server, de fouten komen per veld terug en de ingevulde waarden blijven staan.
import { useActionState } from "react";
import Link from "next/link";
import type { Formuliergroep, Formulierveld } from "@makelaarscockpit/ai";
import { Kaart, Melding, knopKlassen } from "@/components/basis";
import { Foutregel, Invoer, Keuze, Selectievakje, Tekstvak, Veld } from "@/components/formulier";
import type { ChecklistStand } from "../acties";

type Props = {
  actie: (vorige: ChecklistStand, formData: FormData) => Promise<ChecklistStand>;
  groepen: Formuliergroep[];
  terugNaar: string;
};

const id = (pad: string) => `veld-${pad.replace(/[^a-z0-9]+/gi, "-")}`;
// Opties staan in kleine letters in het schema; alleen de weergave krijgt een hoofdletter.
const toon = (optie: string) => optie.charAt(0).toUpperCase() + optie.slice(1);

function Meerkeuze({ veld, gekozen, fout }: { veld: Formulierveld; gekozen: string[]; fout: string | undefined }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-label">{veld.label}</legend>
      <div className="flex flex-wrap gap-x-5">
        {(veld.opties ?? []).map((o) => (
          <Selectievakje key={o} id={`${id(veld.pad)}-${id(o)}`} name={veld.pad} value={o} label={toon(o)} defaultChecked={gekozen.includes(o)} />
        ))}
      </div>
      {fout && <Foutregel>{fout}</Foutregel>}
    </fieldset>
  );
}

function Invoerveld({ veld, waarde, fout }: { veld: Formulierveld; waarde: string; fout: string | undefined }) {
  const gemeen = { id: id(veld.pad), name: veld.pad, defaultValue: waarde, fout };
  const hint = veld.soort === "regels" ? `${veld.hint ? `${veld.hint} ` : ""}Eén per regel.` : veld.hint;
  return (
    <Veld id={gemeen.id} label={veld.label} fout={fout} {...(hint ? { hint } : {})}>
      {veld.soort === "keuze" || veld.soort === "janee" ? (
        <Keuze {...gemeen}>
          <option value="">Onbekend</option>
          {(veld.soort === "janee" ? ["ja", "nee"] : (veld.opties ?? [])).map((o) => (
            <option key={o} value={o}>{toon(o)}</option>
          ))}
        </Keuze>
      ) : veld.soort === "regels" ? (
        <Tekstvak {...gemeen} rows={3} />
      ) : (
        <Invoer {...gemeen} inputMode={veld.soort === "getal" ? "decimal" : veld.soort === "geheel" ? "numeric" : undefined} autoComplete="off" />
      )}
    </Veld>
  );
}

export function ChecklistFormulier({ actie, groepen, terugNaar }: Props) {
  const [stand, verstuur, bezig] = useActionState(actie, { fouten: {}, waarden: null });
  const aantalFouten = Object.keys(stand.fouten).filter((k) => k !== "algemeen").length;

  return (
    <form action={verstuur} className="flex flex-col gap-6">
      {stand.fouten.algemeen && (
        <Melding soort="fout" titel="Opslaan is niet gelukt">
          {stand.fouten.algemeen}
        </Melding>
      )}
      {aantalFouten > 0 && (
        <Melding soort="fout" titel="Controleer de invoer">
          {aantalFouten === 1 ? "Eén veld is" : `${aantalFouten} velden zijn`} niet goed ingevuld; de melding staat bij het veld.
        </Melding>
      )}

      {groepen.map((groep) => {
        const secties = Map.groupBy(groep.velden, (v) => v.sectie ?? "");
        return (
          <Kaart key={groep.sleutel} titel={groep.titel}>
            <div className="flex flex-col gap-6">
              {[...secties].map(([sectie, velden]) => (
                <fieldset key={sectie || "algemeen"} className="flex flex-col gap-3">
                  {sectie && <legend className="mb-1 text-overline text-text-muted">{sectie}</legend>}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {velden.map((veld) => (
                      <div key={veld.pad} className={veld.soort === "regels" || veld.soort === "meerkeuze" ? "sm:col-span-2 lg:col-span-3" : undefined}>
                        {veld.soort === "meerkeuze" ? (
                          <Meerkeuze veld={veld} gekozen={stand.waarden ? (stand.waarden[veld.pad] ?? []) : (veld.gekozen ?? [])} fout={stand.fouten[veld.pad]} />
                        ) : (
                          <Invoerveld veld={veld} waarde={stand.waarden ? (stand.waarden[veld.pad]?.[0] ?? "") : veld.waarde} fout={stand.fouten[veld.pad]} />
                        )}
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </Kaart>
        );
      })}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={bezig} className={knopKlassen("primair")}>
          {bezig ? "Bezig met opslaan…" : "Checklist opslaan"}
        </button>
        <Link href={terugNaar} className={knopKlassen("ghost")}>Annuleren</Link>
      </div>
    </form>
  );
}
