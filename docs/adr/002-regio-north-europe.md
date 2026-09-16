# ADR-002 Regio North Europe: PostgreSQL geblokkeerd in Germany West Central
Datum: 2026-09-16 · Status: geaccepteerd
## Context
ADR-001 koos Germany West Central nadat West Europe voor deze subscription dicht bleek. Bij de eerste echte deploy weigerde Azure in Frankfurt het aanmaken van PostgreSQL Flexible Server: "Provisioning is restricted in this region" (capabilities-API van Microsoft.DBforPostgreSQL). Zulke beperkingen gelden per dienst per regio en zijn niet zichtbaar in een what-if; de andere zeven modules slaagden wel.

Regio's zonder beperking voor alle diensten in dit ontwerp: France Central, North Europe en Sweden Central (Postgres B2s en versie 16 beschikbaar, Flex Consumption en Container Apps beschikbaar). Postgres B2s kost in Sweden Central ongeveer de helft (€ 0,034 per uur tegenover € 0,062 tot € 0,068 elders); de overige vaste posten kosten overal hetzelfde.
## Beslissing
Alle omgevingen (dev, test, prod) draaien in North Europe (Dublin), kortnaam `neu`. Eén regio voor alle diensten houdt dev en prod gelijk. Apps in Frankfurt met een database elders is afgewezen: ~25 ms extra per query en een afwijkende opzet tussen omgevingen.
## Gevolgen
- Resourcegroepen heten rg-cockpit-shared-neu en rg-cockpit-dev-neu. De Frankfurt-groepen zijn verwijderd; er stond nog niets van waarde in.
- Key Vault heet kv-cockpit-dev-neu-01: Key Vault-namen zijn wereldwijd uniek en de variant zonder achtervoegsel bleek elders in gebruik.
- Postgres B2s kost in North Europe € 0,0618 per uur, ongeveer € 45 per maand als hij continu draait; NAT Gateway, IP, Service Bus en registry kosten hetzelfde als in andere regio's.
- North Europe is gekoppeld aan West Europe; mocht die regio later opengaan, dan is een geo-redundante opzet tussen beide mogelijk.
- Latentie vanuit Nederland ongeveer 18 ms; voor dashboards en webhooks niet merkbaar. Het vaste NAT-IP dat bij Realworks wordt gewhitelist is een Iers adres.
- Regio-beschikbaarheid per dienst controleer je voortaan vóór een deploy met de capabilities-API van de betreffende provider, niet alleen met what-if.
