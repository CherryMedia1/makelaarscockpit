# packages/db

Databasetoegang voor apps en jobs.

- `verbinding.ts`: pool met Entra-token, `zoekTenant` en `metTenant` (transactie als rol `cockpit_app` met `app.tenant_id`, zodat row-level security geldt).
- `verkoop.ts`, `realworks.ts`: queries; elke query filtert zelf op `tenant_id`, RLS is het vangnet.
- `intake.ts`: intake-module (ADR-013): dossiers, bronnen, samenvoegen van veldvoorstellen via `packages/domain`, beoordelen en verbruik.
- Het schema staat in `db/migrations`.
- `*.integratie.test.ts` draaien alleen tegen een echte database met `DB_INTEGRATIE=1`; de opzet staat bovenin het testbestand.
