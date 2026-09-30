# apps/web

Het portaal (Next.js 16, App Router) in de MakelaarsCockpit-huisstijl.

- Huisstijl: bron is `docs/huisstijl/`; `npm run brand:sync` (root) kopieert tokens, lettertypen en logo's hierheen. Gebruik alleen de semantische klassen (`bg-bg`, `bg-surface`, `text-text-muted`, `bg-primary`, ...), geen losse hexwaarden.
- Lokaal: `npm run dev -w @makelaarscockpit/web`.
- Inlog (ADR-009): `src/lib/inlog` met sessies, Microsoft-inlog en de inloglink per e-mail; `src/proxy.ts` stuurt zonder sessie naar `/inloggen`, de echte controle zit in `vereisSessie`.
- Lokaal met database: zet `SESSIE_SLEUTEL`, `PORTAAL_URL` en `INLOGLINK_NAAR_LOG=1` (de inloglink komt dan in de serverlog). Zonder `PGHOST` draait het portaal zonder inlog op voorbeeldcijfers.
- Let op: deze Next.js-versie wijkt af van oudere; lees `AGENTS.md`.
