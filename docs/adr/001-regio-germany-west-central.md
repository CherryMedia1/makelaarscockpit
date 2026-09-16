# ADR-001 Regio Germany West Central in plaats van West Europe
Datum: 2026-09-16 · Status: vervangen door ADR-002 (PostgreSQL bleek in Germany West Central geblokkeerd)
## Context
De handleiding koos West Europe (Amsterdam) met kortnaam `weu`. Bij de eerste what-if op 2026-09-16 weigerde Azure elke resource in West Europe voor subscription cockpit-dev: "The selected region is currently not accepting new customers" (aka.ms/locationineligible). Dit gold voor alle resourcetypes, dus het lag aan de subscription en niet aan de templates. Toegang aanvragen via Azure Support duurt dagen en wordt niet gegarandeerd toegekend aan nieuwe Pay-As-You-Go-subscriptions.

Proef-what-ifs met Log Analytics, Public IP en PostgreSQL Flexible Server B2s slaagden in North Europe, Germany West Central, Sweden Central en France Central. Alle vier ondersteunen ook Container Apps en Functions Flex Consumption.
## Beslissing
Alle omgevingen (dev, test, prod) draaien in Germany West Central (Frankfurt), kortnaam `gwc`. In Bicep is de kortnaam een parameter (`regionShort`) naast `location`, zodat een latere verhuizing alleen een parameterwijziging plus nieuwe resourcegroepen vraagt.
## Gevolgen
- EU-dataresidentie blijft gewaarborgd. Latentie naar Nederlandse gebruikers en naar Realworks is enkele milliseconden hoger dan vanuit Amsterdam; voor dashboards en webhooks is dat niet merkbaar.
- Resourcegroepen heten rg-cockpit-shared-gwc en rg-cockpit-dev-gwc. De lege weu-groepen uit stap 2.1 zijn verwijderd.
- De handleiding en CLAUDE.md gebruiken vanaf nu `gwc` en `germanywestcentral`; het vaste NAT-IP dat bij Realworks wordt gewhitelist is dus een Frankfurt-adres.
- Mocht West Europe later opengaan, dan is verhuizen een bewuste migratie (nieuwe resources, data overzetten, nieuw IP bij Realworks), geen parameterwijziging alleen.
