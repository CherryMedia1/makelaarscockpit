# db

Databasemigraties (PostgreSQL) en de runner die ze uitvoert.

- `migrations/NNNN_naam.sql`: één bestand per wijziging, op volgorde; eenmaal toegepast nooit meer wijzigen.
- `migrate.mjs`: voert nieuwe migraties uit en controleert met `--controle-rls` de tenant-isolatie.
- In Azure draait dit als Container Apps-job `job-migratie-cockpit-dev-neu` (vanuit het VNet, met de managed identity); de workflow `deploy-apps-dev` start hem.
- Lokaal proberen: `docker run -d --name pg -e POSTGRES_PASSWORD=lokaal -p 5433:5432 postgres:16` en dan
  `PGHOST=localhost PGPORT=5433 PGUSER=postgres PGPASSWORD=lokaal PGDATABASE=postgres PGSSLMODE=disable node db/migrate.mjs --controle-rls`.
