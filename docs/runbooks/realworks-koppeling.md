# Runbook: Realworks-koppeling

Bijgewerkt: 2026-09-16. Omgeving: dev, North Europe (`neu`), resourcegroep `rg-cockpit-dev-neu`.

## Vast uitgaand IP (whitelisten bij Realworks, stap 4.3)

| Omgeving | IP-adres | Resource | Omschrijving bij Realworks |
|---|---|---|---|
| dev | 134.149.33.214 | `pip-nat-cockpit-dev-neu` | Azure dev |

Het adres zit op de Public IP-resource en blijft bestaan zolang die resource bestaat, ook als de NAT Gateway
(`natGatewayEnabled` in `infra/bicep/dev.bicepparam`) uit staat. Uitgaand verkeer vanuit Azure loopt pas via
dit adres als de NAT Gateway aan staat; zet hem aan zodra Functions of API in Azure Realworks aanroepen.

Tijdelijk laptop-IP voor testen vanuit de devcontainer: toevoegen in stap 4.3, verwijderen einde week 2.

## Namen die je in commando's nodig hebt

| Wat | Waarde |
|---|---|
| Key Vault | `kv-cockpit-dev-neu-01` |
| Secret Realworks-token C&R | `tenant-cr-realworks-token` |
| Secret afdelingscode C&R | `tenant-cr-realworks-afdeling` |
| Function App (webhooks) | `https://func-cockpit-dev-neu.azurewebsites.net` |
| Webhook-URL Wonen (stap 4.7) | `https://func-cockpit-dev-neu.azurewebsites.net/api/webhooks/cr/wonen` |
| PostgreSQL | `psql-cockpit-dev-neu.postgres.database.azure.com` (alleen Entra-login) |
| Service Bus | `sb-cockpit-dev-neu` |
| Storage | `stcockpitdevneu` |
| Managed identity | `id-cockpit-dev-neu`, client-id `f0654c16-c8e2-490e-bb80-bc2df96beb22` |

## Realworks developer-portal

| Wat | Waarde |
|---|---|
| Developer ID | _invullen na registratie (stap 4.1)_ |
| Afdelingscode(s) C&R | _invullen na antwoord Realworks (stap 4.2)_ |
| Test-API beschikbaar? | _invullen_ |
