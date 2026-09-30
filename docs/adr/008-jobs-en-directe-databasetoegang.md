# ADR-008 Sync en import als Container Apps-jobs; het portaal leest rechtstreeks uit de database
Datum: 2026-09-30 · Status: geaccepteerd
## Context
De handleiding en CLAUDE.md noemen Azure Functions voor webhooks en sync, en een Fastify-API (apps/api) tussen portaal en database. Bij de bouw van dashboard 1 speelden drie feiten:
- De database is alleen bereikbaar vanaf het vaste NAT-IP, dus werk dat de database raakt moet in het VNet draaien.
- De migraties draaien sinds 30-09-2026 als Container Apps-job met de managed identity; dat patroon is bewezen en eenvoudig te volgen via de workflow.
- De Wonen-API levert alleen het actuele aanbod (78 objecten bij C&R). Een volledige synchronisatie is dus klein en kan als geheel herhaald worden; de historie komt uit de Excel-import (ADR-007).
## Beslissing
1. **Synchronisatie met Realworks en de Excel-import draaien als Container Apps-jobs** (`apps/jobs`, één image met commando's `sync-realworks` en `import-verkooplijst`), handmatig te starten; een schema volgt zodra dev niet meer dagelijks wordt uitgezet.
2. **De Function App blijft bestemd voor webhooks** (binnen 1 seconde 202, verwerking via Service Bus), zoals de harde regels voorschrijven. Dat volgt in fase 1b.
3. **Het portaal leest voorlopig rechtstreeks uit de database** via `packages/db` en rekent met `packages/domain`, in serveronderdelen van Next.js. De tenant-context en row-level security zitten in `metTenant`. Een aparte Fastify-API komt er zodra een tweede afnemer (Functions, mobiele app, externe koppeling) dezelfde gegevens nodig heeft of de inlog (issue #5) een eigen API-laag vraagt.
## Gevolgen
- Minder bewegende delen voor de pilot: één web-container en drie jobs in plaats van web, API en Functions.
- `apps/api` blijft leeg tot punt 3 verandert; CLAUDE.md is hierop aangepast.
- Domeinlogica en queries zitten in packages, dus verplaatsen naar een API is later geen herbouw.
- Een job die Realworks aanroept vereist dat de NAT Gateway aan staat; met `dev-uit.sh` is dat niet zo, dus eerst `dev-aan.sh`.
