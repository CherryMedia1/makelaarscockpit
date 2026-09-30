// Grafieken volgens BRAND.md §3: hoofdreeks petrol, vergelijking neutraal, doel als stippellijn, raster in klei, labels in steen.

function mooieStap(max: number, stappen = 4): number {
  if (max <= 0) return 1;
  const ruw = max / stappen;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const genormaliseerd = ruw / macht;
  const mooi = genormaliseerd <= 1 ? 1 : genormaliseerd <= 2 ? 2 : genormaliseerd <= 2.5 ? 2.5 : genormaliseerd <= 5 ? 5 : 10;
  return mooi * macht;
}

type Reeks = { naam: string; waarden: (number | null)[]; soort: "hoofd" | "vergelijking" };

export function StaafGrafiek({
  categorieen,
  reeksen,
  doel,
  doelNaam = "Doelstelling",
  formatteer,
  beschrijving,
}: {
  categorieen: readonly string[];
  reeksen: Reeks[];
  doel?: (number | null)[];
  doelNaam?: string;
  formatteer: (waarde: number) => string;
  beschrijving: string;
}) {
  const breedte = 720, hoogte = 320, links = 64, rechts = 8, boven = 12, onder = 32;
  const vlakB = breedte - links - rechts, vlakH = hoogte - boven - onder;
  const alle = [...reeksen.flatMap((r) => r.waarden), ...(doel ?? [])].filter((w): w is number => w !== null);
  const stap = mooieStap(Math.max(...alle, 0));
  const top = Math.max(stap, Math.ceil(Math.max(...alle, 0) / stap) * stap);
  const y = (w: number) => boven + vlakH - (w / top) * vlakH;
  const groepB = vlakB / categorieen.length;
  const staafB = Math.min(18, (groepB - 10) / reeksen.length);
  const ticks = Array.from({ length: Math.round(top / stap) + 1 }, (_, i) => i * stap);
  const doelPunten = (doel ?? []).map((w, i) => (w === null ? null : { x: links + groepB * i + groepB / 2, y: y(w) }));

  return (
    <figure>
      <svg viewBox={`0 0 ${breedte} ${hoogte}`} role="img" aria-label={beschrijving} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={links} x2={breedte - rechts} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={links - 10} y={y(t) + 5} textAnchor="end" className="fill-text-muted" fontSize={14} style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatteer(t)}
            </text>
          </g>
        ))}
        {categorieen.map((c, i) => {
          const start = links + groepB * i + (groepB - staafB * reeksen.length - 2 * (reeksen.length - 1)) / 2;
          return (
            <g key={c}>
              {reeksen.map((r, j) => {
                const w = r.waarden[i];
                if (w === null || w === undefined) return null;
                return (
                  <rect
                    key={r.naam}
                    x={start + j * (staafB + 2)}
                    y={y(w)}
                    width={staafB}
                    height={Math.max(0, boven + vlakH - y(w))}
                    rx={3}
                    className={r.soort === "hoofd" ? "fill-chart-1" : "fill-neutraal-300"}
                  >
                    <title>{`${c} · ${r.naam}: ${formatteer(w)}`}</title>
                  </rect>
                );
              })}
              <text x={links + groepB * i + groepB / 2} y={hoogte - 9} textAnchor="middle" className="fill-text-muted" fontSize={14}>
                {c}
              </text>
            </g>
          );
        })}
        {doel && (
          <g>
            <polyline
              points={doelPunten.filter((p) => p !== null).map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              className="stroke-chart-2"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
            {doelPunten.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-chart-2" />)}
          </g>
        )}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-text-muted">
        {reeksen.map((r) => (
          <span key={r.naam} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2.5 rounded-sm ${r.soort === "hoofd" ? "bg-chart-1" : "bg-neutraal-300"}`} />
            {r.naam}
          </span>
        ))}
        {doel && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-chart-2" />
            {doelNaam}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function BalkenLijst({ rijen, formatteer }: { rijen: { naam: string; waarde: number; aanvulling?: string }[]; formatteer: (waarde: number) => string }) {
  const max = Math.max(...rijen.map((r) => r.waarde), 1);
  return (
    <ul className="flex flex-col gap-4">
      {rijen.map((r) => (
        <li key={r.naam}>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <span className="text-label">{r.naam}</span>
            <span className="text-body-sm tabular-nums">
              {formatteer(r.waarde)}
              {r.aanvulling && <span className="text-text-muted"> · {r.aanvulling}</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-sunken">
            <div className="h-2.5 rounded-full bg-chart-1" style={{ width: `${(r.waarde / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
