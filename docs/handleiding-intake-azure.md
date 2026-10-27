# Handleiding: Azure-resources voor de intake-module in dev (stap A4)

Doel: in `rg-cockpit-dev-neu` de onderdelen aanmaken die de intake-module nodig heeft (ADR-013, ADR-014): een Foundry-resource met drie modellen in Sweden Central, een Blob-container en een Service Bus-queue. **Alleen dev, nooit prod.**

Kosten: geen vaste kosten. Je betaalt per verwerkt token en per PDF-pagina; zolang er niets verwerkt wordt, kost het vrijwel niets.

Tijd: ongeveer 30 minuten.

## Wat er komt

| Onderdeel | Naam | Instellingen |
|---|---|---|
| Blob-container | `intake` in `stcockpitdevneu` | Privé |
| Service Bus-queue | `intake-verwerking` in `sb-cockpit-dev-neu` | Lock 5 min, max 5 afleveringen, TTL 14 dagen, dead-letter bij verlopen |
| Foundry-resource | `aif-cockpit-dev-sdc` | Sweden Central, sleutels uit, publiek bereikbaar met alleen Entra-toegang |
| Foundry-project | `intake` | In `aif-cockpit-dev-sdc` |
| Modeldeployment | `extractie` | `gpt-5.4`, versie `2026-03-05`, Data Zone Standard, 50K TPM, geen automatische upgrade |
| Modeldeployment | `controle` | `gpt-5.4-mini`, versie `2026-03-17`, Data Zone Standard, 50K TPM, geen automatische upgrade |
| Modeldeployment | `embedding` | `text-embedding-3-large`, versie `1`, Data Zone Standard, 50K TPM |
| Rol | Cognitive Services User | Voor managed identity `id-cockpit-dev-neu` op `aif-cockpit-dev-sdc` |

Dit is precies wat `infra/bicep/modules/foundry.bicep` en de aanpassingen in `storage.bicep` en `servicebus.bicep` beschrijven. Houd namen en instellingen exact gelijk, dan ziet een latere Bicep-deploy niets te wijzigen.

Kies **route A** (Cloud Shell, aanbevolen: de Bicep doet het werk) of **route B** (alles klikken in de portal).

---

## Stap 0: controles vooraf (beide routes)

Waarom: what-if en de portal tonen niet of een model of quotum in een regio beschikbaar is (les uit ADR-002).

1. **Resource provider.** Portal → *Subscriptions* → de subscription → *Settings* → *Resource providers* → zoek `Microsoft.CognitiveServices`. Staat er niet *Registered*: selecteer en kies *Register*. Wacht tot de status *Registered* is.
2. **Modellen en quotum.** Open Cloud Shell (het `>_`-icoon bovenin de portal, kies *Bash*) en voer uit:
   ```bash
   az cognitiveservices model list -l swedencentral \
     --query "[?model.name=='gpt-5.4' || model.name=='gpt-5.4-mini' || model.name=='text-embedding-3-large'].{model:model.name, versie:model.version, skus:join(',', model.skus[].name)}" -o table
   az cognitiveservices usage list -l swedencentral \
     --query "[?contains(name.value, 'DataZone')].{quotum:name.value, gebruikt:currentValue, max:limit}" -o table
   ```
   Controleer:
   - `gpt-5.4` heeft versie `2026-03-05`, `gpt-5.4-mini` heeft `2026-03-17` en `text-embedding-3-large` heeft `1`, telkens met `DataZoneStandard` in de kolom skus.
   - Voor elk van de drie modellen is in de quotumregels met DataZone minstens 50 vrij (max min gebruikt).

**Stop hier** als een versie afwijkt, `DataZoneStandard` ontbreekt of het quotum te laag is. Stuur de uitvoer door; dan passen we de Bicep en deze handleiding aan. Kies nooit een ander deploymenttype zoals *Global Standard*: dan kan verwerking buiten de EU plaatsvinden (ADR-014).

---

## Route A: Cloud Shell met de Bicep (aanbevolen)

Voorwaarde: de branch met de Bicep staat op GitHub (`docs/plan-intake-module`, of al samengevoegd in `main`).

1. Open Cloud Shell (*Bash*) en controleer de subscription:
   ```bash
   az account show --query name -o tsv
   ```
2. Haal de repo op:
   ```bash
   git clone --branch docs/plan-intake-module https://github.com/CherryMedia1/makelaarscockpit.git
   cd makelaarscockpit
   ```
   (Is de branch al samengevoegd, laat dan `--branch docs/plan-intake-module` weg.)
3. What-if:
   ```bash
   az deployment group what-if -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
   ```
   Verwacht:
   - **Create:** `aif-cockpit-dev-sdc`, `aif-cockpit-dev-sdc/intake`, de deployments `extractie`, `controle` en `embedding`, één roltoewijzing op `aif-cockpit-dev-sdc`, de queue `intake-verwerking` en de container `intake`.
   - **Modify:** hooguit eigenschappen van bestaande resources zonder echte wijziging (*Ignore* of *NoChange*).
   - **Delete:** niets.

   Zie je een *Delete*, of een *Modify* op iets anders (Postgres, netwerk, Key Vault, Container Apps): **niet doorzetten**, uitvoer doorsturen.
4. Deploy:
   ```bash
   az deployment group create -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
   ```
   Duurt een paar minuten; de drie modeldeployments worden na elkaar aangemaakt.
5. Ga naar **Stap C: controle achteraf**.

---

## Route B: alles in de portal

Labels in de portal kunnen iets afwijken van wat hier staat; de instellingen in de tabel bovenaan zijn leidend.

### B1. Blob-container
1. Portal → storage-account `stcockpitdevneu` → *Data storage* → *Containers* → *+ Container*.
2. Name: `intake`. Anonymous access level: *Private (no anonymous access)*.
3. *Create*.

### B2. Service Bus-queue
1. Portal → Service Bus-namespace `sb-cockpit-dev-neu` → *Entities* → *Queues* → *+ Queue*.
2. Vul in:
   - Name: `intake-verwerking`
   - Max delivery count: `5`
   - Message time to live: `14` dagen
   - Lock duration: `5` minuten
   - *Enable dead lettering on message expiration*: aan
   - Overige opties (sessions, duplicate detection, partitioning) uit laten; max queue size standaard (1 GB).
3. *Create*.

### B3. Foundry-resource met project
1. Portal → zoek *Microsoft Foundry* (of *Azure AI Foundry*) → *Create* → *Foundry resource*.
2. Tabblad *Basics*:
   - Subscription: de dev-subscription
   - Resource group: `rg-cockpit-dev-neu`
   - Name: `aif-cockpit-dev-sdc`
   - Region: **Sweden Central**
   - Default project name: `intake`
3. Tabblad *Network*: *All networks* (publiek bereikbaar; toegang loopt alleen via Entra, zie ADR-014).
4. Tabblad *Identity*: system-assigned managed identity **aan**.
5. Tabblad *Encryption*: Microsoft-managed keys (standaard).
6. Tabblad *Tags*: `project` = `makelaarscockpit`, `env` = `dev`.
7. *Review + create* → *Create*. Wacht tot de deployment klaar is.
8. **Sleutels uitzetten.** De portal biedt hier geen knop voor. Open Cloud Shell (*Bash*) en voer uit:
   ```bash
   az resource update -g rg-cockpit-dev-neu -n aif-cockpit-dev-sdc \
     --resource-type Microsoft.CognitiveServices/accounts --set properties.disableLocalAuth=true
   az cognitiveservices account show -g rg-cockpit-dev-neu -n aif-cockpit-dev-sdc --query properties.disableLocalAuth
   ```
   De laatste regel moet `true` geven.

### B4. Drie modeldeployments
1. Portal → `aif-cockpit-dev-sdc` → *Go to Foundry portal* (of open ai.azure.com en kies project `intake`).
2. *Models + endpoints* (of *Deployments*) → *Deploy model* → *Deploy base model* → kies `gpt-5.4` → *Confirm* → *Customize*:
   - Deployment name: `extractie`
   - Deployment type: **Data Zone Standard**
   - Model version: `2026-03-05`
   - Version upgrade policy: geen automatische upgrade (*Opt out of automatic model version upgrades* of vergelijkbaar)
   - Tokens per minute: `50K`
   - Guardrails / content filter: standaard laten
   - *Deploy*
3. Herhaal voor `gpt-5.4-mini`: name `controle`, Data Zone Standard, versie `2026-03-17`, geen automatische upgrade, `50K`.
4. Herhaal voor `text-embedding-3-large`: name `embedding`, Data Zone Standard, versie `1`, `50K`.

Staat *Data Zone Standard* niet in de lijst: **stop** en meld het. Niet uitwijken naar *Global Standard*.

### B5. Rol voor de managed identity
1. Portal → `aif-cockpit-dev-sdc` → *Access control (IAM)* → *Add* → *Add role assignment*.
2. Role: **Cognitive Services User** → *Next*.
3. Assign access to: *Managed identity* → *Select members* → Managed identity: *User-assigned managed identity* → kies `id-cockpit-dev-neu`.
4. *Review + assign*.

---

## Stap C: controle achteraf (beide routes)

In Cloud Shell:
```bash
# Foundry: regio, sleutels uit, publiek bereikbaar
az cognitiveservices account show -g rg-cockpit-dev-neu -n aif-cockpit-dev-sdc \
  --query "{regio:location, sleutelsUit:properties.disableLocalAuth, publiek:properties.publicNetworkAccess, endpoint:properties.endpoint}" -o table

# Deployments: drie stuks, allemaal DataZoneStandard
az cognitiveservices account deployment list -g rg-cockpit-dev-neu -n aif-cockpit-dev-sdc \
  --query "[].{naam:name, model:properties.model.name, versie:properties.model.version, type:sku.name, tpm:sku.capacity}" -o table

# Rol voor de managed identity
az role assignment list --scope $(az cognitiveservices account show -g rg-cockpit-dev-neu -n aif-cockpit-dev-sdc --query id -o tsv) \
  --query "[].{rol:roleDefinitionName, wie:principalName}" -o table

# Queue en container
az servicebus queue show -g rg-cockpit-dev-neu --namespace-name sb-cockpit-dev-neu -n intake-verwerking --query "{lock:lockDuration, max:maxDeliveryCount, ttl:defaultMessageTimeToLive}" -o table
az storage container show --account-name stcockpitdevneu -n intake --auth-mode login --query name -o tsv
```

Verwacht:
- Regio `swedencentral`, `sleutelsUit` = `True`, `publiek` = `Enabled`.
- Drie deployments `extractie`, `controle`, `embedding`, alle drie `DataZoneStandard` en `50`.
- Roltoewijzing *Cognitive Services User* voor `id-cockpit-dev-neu`.
- Queue met lock `PT5M`, max `5`, ttl `P14D`; container `intake` bestaat.

Stuur de uitvoer van deze controle door. Daarna stelt de verwerkingsjob (stap A7) eenmalig de standaardmodellen van Content Understanding in (`extractie` en `embedding`). Dat kan alleen de managed identity, niet je eigen account.

## Na route B: Bicep gelijk houden

De roltoewijzing uit B5 heeft in Azure een andere naam dan Bicep zou kiezen; een tweede toewijzing van dezelfde rol faalt met `RoleAssignmentExists`. Daarom staat `foundryRolHandmatig = true` in `dev.bicepparam`: Bicep laat die rol dan met rust.


Route B maakt dezelfde resources als de Bicep. Draai bij de eerstvolgende Bicep-deploy naar dev eerst de what-if: die hoort voor deze resources *NoChange* te geven. Ziet de what-if verschillen, dan wijkt een instelling af van de tabel bovenaan; pas die in de portal aan, niet in de Bicep.

## Als iets vastloopt

- *InsufficientQuota* bij een deployment: quotum voor Data Zone Standard in Sweden Central is op. Aanvragen via Foundry portal → *Management center* → *Quota*, of tijdelijk een lagere TPM kiezen en `foundryCapaciteit` in `main.bicep` gelijk zetten.
- *Model version not found*: de versie uit de tabel is in Sweden Central niet (meer) beschikbaar. Stoppen en melden; de keuze ligt vast in ADR-014.
- *The subdomain name is already in use*: de naam `aif-cockpit-dev-sdc` is wereldwijd uniek en bij een ander in gebruik. Stoppen en melden; dan kiezen we een achtervoegsel, zoals bij de Key Vault (`-01`).
- Een verwijderde Foundry-resource blijft 48 uur *soft-deleted* en blokkeert de naam. Opruimen: portal → *Microsoft Foundry* → *Manage deleted resources* → *Purge*. Alleen in dev.
