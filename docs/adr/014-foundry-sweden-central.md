# ADR-014 Modellen via Microsoft Foundry in Sweden Central, met EU-dataverwerking
Datum: 2026-10-26 · Status: geaccepteerd
## Context
De intake-module (ADR-013) heeft taalmodellen nodig voor drie stappen: velden uit een gesprekstranscript halen, velden uit een checklist- of gespreksverslag-PDF halen, en (fase B) een woningtekst schrijven en controleren. Uitgangspunten uit het plan: alles via Microsoft Foundry, geen losse Azure OpenAI-resource, en alle data in de EU.

De rest van het platform draait in North Europe (ADR-002). Beschikbaarheid gecontroleerd in de Microsoft-documentatie op 2026-10-26:
- **Content Understanding** is beschikbaar in onder meer Sweden Central en West Europe, niet in North Europe. West Europe is dicht voor deze subscription (ADR-001).
- **Modellen als Data Zone Standard (EU)** in Sweden Central, met gestructureerde output (JSON Schema): onder meer `gpt-5.4` (2026-03-05), `gpt-5.4-mini` (2026-03-17), `gpt-5.5` (2026-04-24) en `gpt-4.1`. In North Europe ontbreekt onder meer `gpt-5.4-mini`.
- **Claude-modellen in Foundry** hebben geen EU-datazone; Anthropic is daar verwerker ongeacht de hostingoptie. Ze vallen daarom af.

Bij *Data Zone Standard (EU)* blijft de verwerking binnen de EU-datazone, ook als Azure een ander EU-datacenter gebruikt. *Global Standard* kan prompts buiten de EU verwerken.
## Beslissing
1. **Eén Foundry-resource (AIServices) met een project in Sweden Central** per omgeving, `aif-cockpit-{env}-sdc`. Content Understanding en de modeldeployments zitten in dezelfde resource.
2. **Alleen deployments van het type Data Zone Standard (EU).** Geen Global Standard, geen modellen zonder EU-datazone.
3. **Voorlopige modelkeuze** (definitief na de evaluatieset in fase B, op kwaliteit en het kostendoel van €3 per dossier):
   - extractie uit transcripten: `gpt-5.4`, gestructureerde output in strikte modus;
   - controle en goedkope stappen (bronnencontrole, adres-matching): `gpt-5.4-mini`;
   - PDF's: Content Understanding met een eigen analyzer op het woningprofiel-schema, met de modeldeployments die Content Understanding zelf voorschrijft, ook als Data Zone Standard (EU);
   - `gpt-5.5` is de eerste alternatieve kandidaat in de evaluatie.
4. **Toegang alleen met de managed identity** (rol Cognitive Services User; die dekt ook de modelaanroepen), lokale sleutels uit (`disableLocalAuth`). Geen API-sleutels in Key Vault of in code.
5. **Netwerk (aangepast 2026-10-26, besluit Tim):** publiek bereikbaar met alleen Entra-toegang, hetzelfde patroon als Storage, Key Vault en Service Bus. Private endpoints komen voor alle diensten samen, vóór prod, met een eigen ADR.
6. **Vooraf controleren:** vóór elke deploy de beschikbaarheid van de modelversies en het deploymenttype in Sweden Central opvragen (`az cognitiveservices model list -l swedencentral`), naar de les uit ADR-002 dat what-if regiobeperkingen niet toont.
## Gevolgen
- Een tweede regio in het ontwerp: Sweden Central, kortnaam `sdc`, alleen voor Foundry. Latentie North Europe–Sweden Central is ongeveer 30 ms; voor achtergrondwerk niet relevant.
- Kosten zijn per token en per pagina, zonder vaste kosten. Capaciteit per deployment: 50K tokens per minuut (`foundryCapaciteit` in main.bicep). Tokenverbruik wordt per stap gelogd in `intake_verbruik`.
- Content Understanding gebruikt dezelfde deployments (`extractie` en `embedding`); de koppeling wordt eenmalig gezet met `PATCH /contentunderstanding/defaults`. De GPT-4.1-familie, die Content Understanding vroeger vroeg, wordt in oktober 2026 uitgefaseerd.
- Azure bewaart prompts en antwoorden standaard tot 30 dagen voor misbruikdetectie, binnen de datazone. Aangepaste misbruikdetectie wordt aangevraagd en toegekend vóórdat echte transcripten van een kantoor erdoorheen gaan (besluit Tim, 2026-10-26); in dev staan alleen verzonnen fixtures.
- Wisselen van model is een wijziging van een deploymentnaam in Bicep plus een run van de evaluatieset; de code kent alleen de logische namen `extractie` en `controle`.
- Als Content Understanding later in North Europe beschikbaar komt, kan de resource verhuizen; dat vraagt een vervolg-ADR.
