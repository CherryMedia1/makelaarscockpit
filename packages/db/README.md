# packages/db

Databasetoegang voor apps en jobs.

- `verbinding.ts`: pool met Entra-token, `zoekTenant` en `metTenant` (transactie als rol `cockpit_app` met `app.tenant_id`, zodat row-level security geldt).
- `verkoop.ts`, `realworks.ts`: queries; elke query filtert zelf op `tenant_id`, RLS is het vangnet.
- Het schema staat in `db/migrations`.
