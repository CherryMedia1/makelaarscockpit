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
| Secrets Realworks-tokens C&R | `tenant-cr-realworks-token-wonen`, `-relaties`, `-taken`, `-agenda` |
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
| Developer ID | `8d3ffc0d-825c-42e9-a65a-bebb3e4a142c` (geregistreerd 2026-09-16) |
| Afdelingscode(s) C&R | _invullen na antwoord Realworks (stap 4.2)_ |
| Test-API beschikbaar? | _invullen_ |

## Eerste calls (stap 4.5, 2026-09-22)

Tokens per API in Key Vault: `tenant-cr-realworks-token-wonen`, `-relaties`, `-taken`, `-agenda`. Test met `infra/scripts/realworks-test.sh cr <pad>`.

| API | Pad dat werkt | Resultaat | Opmerking |
|---|---|---|---|
| Wonen | `GET /wonen/v3/objecten` (ook `?actief=false`) | 200, `totaalAantal: 0` | vrijgave bij C&R nog niet ingesteld |
| Relaties | `GET /relaties/v1` (detail: `/relaties/v1/{relatieId}`) | 200, `totaalAantal: 0` | vrijgave bij C&R nog niet ingesteld |
| Taken | nog onbekend | 404 op alle geprobeerde paden | pad opzoeken in portal → APIs → Taken |
| Agenda | nog onbekend | 404 op alle geprobeerde paden | pad opzoeken in portal → APIs → Agenda |

Lessen: de header is `Authorization: rwauth <token>`; tokens zijn pas actief na acceptatie van de voorwaarden; een niet-actief token en een
verzonnen token geven dezelfde 401. Een 404 "Resource not found" betekent verkeerd pad, geen autorisatieprobleem.

## Vanaf het vaste IP via de toolbox (2026-09-29)

`infra/scripts/toolbox.sh` opent een shell in de container; daarin `rw <tenant> <pad>`. Uitgaand IP bevestigd: 134.149.33.214.

| Tenant | API | Pad | Resultaat |
|---|---|---|---|
| dev (development-token) | Wonen | `/wonen/v3/objecten?aantal=2` | 200 met echte C&R-objecten: vrijgave staat |
| cr | Relaties | `/relaties/v1?aantal=2` | 200, nog leeg |
| cr | Wonen | `/wonen/v3/objecten` | 401: het Wonen-token van 22-09 wordt niet meer geaccepteerd, waarschijnlijk opnieuw gegenereerd; vervangen met `realworks-token-opslaan.sh cr wonen` |
| dev | Taken, Agenda | `/taken/v1`, `/taken/v3/taken`, `/agenda/v1`, `/agenda/v3/afspraken` | 404: pad opzoeken in de portal |

Het development-token (tenant `dev`) werkt voor alle API's van de C&R-koppeling en is daarmee de eenvoudigste keuze voor fase 1.

Detail: `GET /wonen/v3/objecten/{id}` geeft 404 (2026-09-29); het detailpad staat in de portal. `?aantal=&pagina=` worden geaccepteerd op de lijst.
