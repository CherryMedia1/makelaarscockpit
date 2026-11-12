# MakelaarsCockPit – werkafspraken

## Wat dit is
Multi-tenant platform bovenop Realworks (CRM voor makelaars). Fase 1: dashboards.
Fase 2: documenten/gesprekken naar Realworks. Fase 3: workflow-automatisering.
Realworks is het bronsysteem; wij spiegelen en verrijken.

## Stack
TypeScript overal. Next.js (apps/web), jobs voor sync en import (apps/jobs), Azure Functions voor webhooks (apps/functions).
Het portaal leest via packages/db; een Fastify API (apps/api) volgt later (ADR-008).
PostgreSQL met row-level security. Azure: Container Apps, Functions, Service Bus, Key Vault, Blob.
Infra in Bicep (infra/bicep). CI/CD via GitHub Actions.

## Harde regels

Toets elk voorstel hieraan. Raakt een wijziging een van deze regels, zeg dat dan expliciet in het plan.

1. Elke tabel heeft `tenant_id`; elke query filtert zelf op `tenant_id`. RLS is het vangnet, niet de eerste verdediging. De tenant komt uit de sessie of het bericht, nooit uit URL of invoer.
2. Nooit persoonsgegevens in logs: alleen id's en aantallen, geen namen, e-mail, telefoon, adressen of transcripttekst.
3. Secrets alleen uit Key Vault via Managed Identity. Niet in code, niet in `.env` in git, niet als GitHub Secret voor runtime.
4. Realworks alleen via `packages/realworks`, header `Authorization: rwauth {token}`. Geen scraping of browserautomatisering. Schrijven alleen wat ADR-005 toestaat.
5. Webhooks antwoorden binnen 1 seconde met 202 en doen verder niets; verwerking via Service Bus.
6. Nooit `az deployment` of `az ... delete` richting prod. Dev mag.
7. Domeinlogica in `packages/domain`, tests vóór de implementatie.
8. Intake: mens in de lus (niets gaat naar buiten zonder goedkeuring in de UI), tekst alleen uit bevestigde velden, elk geëxtraheerd veld heeft bewijs, de module staat per tenant aan of uit (`tenant_module`), opschonen volgens ADR-015, nooit echte klantdata in de repo.
9. UI volgt `docs/huisstijl/BRAND.md`, alleen semantische tokens (`--mc-color-*` of de Tailwind-klassen daarop), geen losse hexwaarden.
10. Werkwijze: vanuit een GitHub-issue, eerst een plan en akkoord, dan bouwen. Conventional commits. Ontwerpbeslissingen worden een ADR (`docs/adr`, sjabloon 000).

## Werkwijze
- Werk vanuit een GitHub-issue. Maak eerst een plan, wacht op akkoord, implementeer dan.
- Commit-berichten: conventional commits (feat:, fix:, chore:, docs:).
- Beslissingen die het ontwerp raken → nieuwe ADR in docs/adr (sjabloon: docs/adr/000-template.md).

## Commando's
npm install · npm run lint · npm run typecheck · npm run test
Infra dev: az deployment group create -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
Dev zuinig / aan: infra/scripts/dev-uit.sh · infra/scripts/dev-aan.sh (NAT Gateway via natGatewayEnabled in dev.bicepparam)

## Huisstijl
Volg altijd docs/huisstijl/BRAND.md voor kleuren, typografie, componenten en tone of voice.
Gebruik uitsluitend de semantische tokens (--mc-color-*, of de Tailwind-klassen daarop), nooit losse hexwaarden.
Na een wijziging in docs/huisstijl: npm run brand:sync.
