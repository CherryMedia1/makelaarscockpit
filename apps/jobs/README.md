# apps/jobs

Jobs die als Container Apps-job in het VNet draaien (ADR-008): uitgaand via het vaste IP, inloggen met de managed identity.

- `sync-realworks`: spiegelt medewerkers en het actuele Wonen-aanbod van een tenant; ruwe antwoorden naar blob `raw-realworks`.
- `import-verkooplijst`: leest de Excel-historie uit blob `import/<tenant>/verkooplijst.xlsx`, controleert de jaartotalen tegen de Excel en schrijft de verkoopregels en doelstellingen weg. Herhaalbaar: een nieuwe import vervangt de vorige.

Starten in Azure: `az containerapp job start -g rg-cockpit-dev-neu -n job-sync-cockpit-dev-neu` (of `job-import-cockpit-dev-neu`).
Lokaal alleen controleren, zonder database: `ALLEEN_CONTROLE=1 TENANT_SLEUTEL=cr IMPORT_BESTAND="input/excel/<bestand>.xlsx" node apps/jobs/dist/jobs.cjs import-verkooplijst`.
