# apps/web

Het portaal (Next.js 16, App Router) in de MakelaarsCockpit-huisstijl.

- Huisstijl: bron is `docs/huisstijl/`; `npm run brand:sync` (root) kopieert tokens, lettertypen en logo's hierheen. Gebruik alleen de semantische klassen (`bg-bg`, `bg-surface`, `text-text-muted`, `bg-primary`, ...), geen losse hexwaarden.
- Lokaal: `npm run dev -w @makelaarscockpit/web`.
- Afscherming pilot: `src/proxy.ts` vraagt een wachtwoord als `PILOT_WACHTWOORD` is gezet (tijdelijk, tot de inlog uit issue #5).
- Let op: deze Next.js-versie wijkt af van oudere; lees `AGENTS.md`.
