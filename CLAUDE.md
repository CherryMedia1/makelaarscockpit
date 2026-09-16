# MakelaarsCockPit – werkafspraken

## Wat dit is
Multi-tenant platform bovenop Realworks (CRM voor makelaars). Fase 1: dashboards.
Fase 2: documenten/gesprekken naar Realworks. Fase 3: workflow-automatisering.
Realworks is het bronsysteem; wij spiegelen en verrijken.

## Stack
TypeScript overal. Next.js (apps/web), Fastify API (apps/api), Azure Functions (apps/functions).
PostgreSQL met row-level security. Azure: Container Apps, Functions, Service Bus, Key Vault, Blob.
Infra in Bicep (infra/bicep). CI/CD via GitHub Actions.

## Harde regels
- Elke databasetabel heeft tenant_id. Elke query filtert op tenant_id. RLS is het vangnet, niet de eerste verdediging.
- Nooit persoonsgegevens in logs: log id's, geen namen, e-mails, telefoonnummers of adressen.
- Secrets alleen uit Key Vault via Managed Identity. Nooit secrets in code, .env in git, of GitHub Secrets voor runtime.
- Realworks-calls alleen via packages/realworks. Header: `Authorization: rwauth {token}`.
- Webhook-endpoints antwoorden binnen 1 seconde met 202 en doen verder niets; verwerking gaat via Service Bus.
- Voer nooit `az deployment` of `az ... delete` uit richting prod. Dev mag.
- Schrijf tests voor domeinlogica (packages/domain) vóór de implementatie.

## Werkwijze
- Werk vanuit een GitHub-issue. Maak eerst een plan, wacht op akkoord, implementeer dan.
- Commit-berichten: conventional commits (feat:, fix:, chore:, docs:).
- Beslissingen die het ontwerp raken → nieuwe ADR in docs/adr (sjabloon: docs/adr/000-template.md).

## Commando's
npm install · npm run lint · npm run typecheck · npm run test
Infra dev: az deployment group create -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
Dev zuinig / aan: infra/scripts/dev-uit.sh · infra/scripts/dev-aan.sh (NAT Gateway via natGatewayEnabled in dev.bicepparam)
