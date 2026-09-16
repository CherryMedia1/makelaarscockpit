# MakelaarsCockPit – Handleiding Week 1: het fundament bouwen

Deze handleiding neemt je stap voor stap mee door de vier onderdelen van week 1. Elke stap heeft een doel, wat je precies doet, en hoe je controleert dat het gelukt is. Waar het handig is, staat er een opdracht die je aan Claude Code kunt geven in plaats van het zelf uit te typen.

Reken op vier tot vijf werkdagen. Onderdeel 4 (Realworks) hangt af van C&R en Realworks; start die aanvraag daarom op dag 1.

---

## Deel 0 – Wat je nodig hebt voordat je begint

**Accounts**
- Een Microsoft-account voor Azure (bij voorkeur een zakelijk account van je eigen bedrijf, niet privé).
- Een GitHub-account.
- Een Claude-abonnement met toegang tot Claude Code (Pro/Max of API-key).

**Software op je laptop**
- Visual Studio Code, met de extensies: Claude Code, Bicep, GitHub Pull Requests, Dev Containers.
- Docker Desktop (nodig voor de devcontainer).
- Azure CLI (`az`), Git, Node.js 22.

Controle: open een terminal en voer uit:
```
az version
git --version
node --version
docker --version
```
Alle vier moeten een versienummer geven.

**Twee besluiten die je nu neemt**
1. Regio: West Europe (Nederland is er het dichtst bij, EU-dataresidentie). Kortnaam in alle namen: `weu`.
2. Backendtaal: TypeScript (deze handleiding gaat daarvan uit).

---

## Deel 1 – Azure en GitHub inrichten

### Stap 1.1 Azure-subscription aanmaken

**Doel:** één plek waar alle MakelaarsCockPit-resources en -kosten samenkomen.

1. Ga naar portal.azure.com en log in.
2. Heb je nog geen subscription: kies "Subscriptions" → "Add" → Pay-As-You-Go. Noem hem `cockpit-dev`. (Later maak je een tweede voor productie; dat scheidt kosten en rechten netjes.)
3. Vraag op de dag dat je dit doet ook Microsoft for Startups Founders Hub aan (foundershub.startups.microsoft.com). Goedkeuring duurt een paar dagen en levert Azure-tegoed op.

Een management group is bedoeld om meerdere subscriptions te beheren. Met één subscription is dat overbodig; sla dit over tot je een prod-subscription toevoegt.

**Controle:** in de terminal:
```
az login
az account list --output table
```
Je ziet `cockpit-dev`. Zet hem als standaard:
```
az account set --subscription "cockpit-dev"
```

### Stap 1.2 Budgetalert instellen

**Doel:** nooit verrast worden door een rekening.

1. Portal → "Cost Management + Billing" → "Budgets" → "Add".
2. Naam `budget-cockpit-dev`, bedrag € 300 per maand, reset maandelijks.
3. Alerts bij 50%, 80% en 100% van het budget naar je e-mailadres.

**Controle:** het budget staat in de lijst met status "Active".

### Stap 1.3 Resource providers aanzetten

**Doel:** Azure moet weten dat je bepaalde dienstsoorten gaat gebruiken; anders faalt de eerste Bicep-deploy met een vage foutmelding.

```
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.KeyVault Microsoft.ServiceBus Microsoft.Storage Microsoft.Web Microsoft.Insights Microsoft.OperationalInsights Microsoft.Network Microsoft.CognitiveServices Microsoft.ManagedIdentity; do
  az provider register --namespace $ns
done
```

**Controle:** `az provider show --namespace Microsoft.App --query registrationState` geeft `Registered` (kan een paar minuten duren).

### Stap 1.4 GitHub-organisatie en repository

**Doel:** de code hoort bij het bedrijf (straks de BV), niet bij jouw persoonlijke account.

1. GitHub → je profielfoto → "Your organizations" → "New organization" → Free plan. Naam bijvoorbeeld `makelaarscockpit`.
2. In de organisatie: "New repository" → naam `platform`, Private, vink "Add a README" aan.
3. Kloon de repo naar je laptop:
```
git clone https://github.com/makelaarscockpit/platform.git
cd platform
```

### Stap 1.5 Monorepo-structuur aanmaken

**Doel:** één repository met een vaste indeling, zodat jij en Claude Code altijd weten waar iets hoort.

Maak deze mappen (leeg mag; zet in elke map een kort `README.md` met één regel wat erin komt):
```
apps/web            frontend (Next.js)
apps/api            API (Container App)
apps/functions      webhooks en sync (Azure Functions)
packages/domain     datamodel, procesmodel, metricdefinities
packages/realworks  Realworks API-client
packages/ai         prompts, schema's, evaluatiesets
infra/bicep         infrastructuur als code
db/migrations       databasemigraties
docs/adr            architectuurbeslissingen
.github/workflows   CI/CD
```

Zet in de root een `package.json` met npm workspaces:
```json
{
  "name": "makelaarscockpit",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "lint": "echo 'lint volgt'",
    "typecheck": "echo 'typecheck volgt'",
    "test": "echo 'tests volgen'"
  }
}
```
Die drie scripts zijn placeholders zodat de CI vanaf dag 1 slaagt; je vult ze in week 2.

Voeg een `.gitignore` toe (Node-sjabloon van GitHub volstaat) en een `.editorconfig`.

### Stap 1.6 CLAUDE.md schrijven

**Doel:** Claude Code leest dit bestand bij elke sessie. Het is je "briefing voor een nieuwe collega": kort, concreet, met regels die niet ter discussie staan.

Maak `CLAUDE.md` in de root:

```markdown
# MakelaarsCockPit – werkafspraken

## Wat dit is
Multi-tenant platform bovenop Realworks (CRM voor makelaars). Fase 1: dashboards.
Fase 2: documenten/gesprekken naar Realworks. Fase 3: workflow-automatisering.
Realworks is het bronsysteem; wij spiegelen en verrijken.

## Stack
TypeScript overal. Next.js (apps/web), Fastify API (apps/api), Azure Functions (apps/functions).
PostgreSQL met row-level security. Azure: Container Apps, Functions, Service Bus, Key Vault, Blob.
Infra in Bicep (infra/bicep). CI/CD via GitHub Actions.

## Harde regels
- Elke databasetabel heeft tenant_id. Elke query filtert op tenant_id. RLS is het vangnet, niet de eerste verdediging.
- Nooit persoonsgegevens in logs: log id's, geen namen, e-mails, telefoonnummers of adressen.
- Secrets alleen uit Key Vault via Managed Identity. Nooit secrets in code, .env in git, of GitHub Secrets voor runtime.
- Realworks-calls alleen via packages/realworks. Header: `Authorization: rwauth {token}`.
- Webhook-endpoints antwoorden binnen 1 seconde met 202 en doen verder niets; verwerking gaat via Service Bus.
- Voer nooit `az deployment` of `az ... delete` uit richting prod. Dev mag.
- Schrijf tests voor domeinlogica (packages/domain) vóór de implementatie.

## Werkwijze
- Werk vanuit een GitHub-issue. Maak eerst een plan, wacht op akkoord, implementeer dan.
- Commit-berichten: conventional commits (feat:, fix:, chore:, docs:).
- Beslissingen die het ontwerp raken → nieuwe ADR in docs/adr (sjabloon: docs/adr/000-template.md).

## Commando's
npm install · npm run lint · npm run typecheck · npm run test
Infra dev: az deployment group create -g rg-cockpit-dev-weu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
```

Maak ook `docs/adr/000-template.md`:
```markdown
# ADR-XXX Titel
Datum: · Status: voorgesteld / geaccepteerd / vervangen
## Context
## Beslissing
## Gevolgen
```

### Stap 1.7 Devcontainer

**Doel:** jij en Claude Code werken in exact dezelfde omgeving (zelfde Node, Azure CLI, Bicep, Postgres-client), ook op een nieuwe laptop.

Maak `.devcontainer/devcontainer.json`:
```json
{
  "name": "makelaarscockpit",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/devcontainers/features/azure-cli:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "postCreateCommand": "az bicep install && sudo apt-get update && sudo apt-get install -y postgresql-client && npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-bicep",
        "anthropic.claude-code",
        "dbaeumer.vscode-eslint",
        "github.vscode-pull-request-github"
      ]
    }
  }
}
```

Open de map in VS Code → "Reopen in Container". De eerste keer duurt dit enkele minuten.

**Controle:** in de terminal ín de container: `az bicep version` en `psql --version` geven een versie. Open Claude Code (icoon in de zijbalk) en vraag: "Vat CLAUDE.md samen in drie zinnen." Als dat klopt, leest Claude Code je afspraken.

### Stap 1.8 Eerste commit

```
git add .
git commit -m "chore: monorepo-structuur, CLAUDE.md en devcontainer"
git push
```

---

## Deel 2 – Infrastructuur als code met Bicep

Bicep is een taal waarin je beschrijft welke Azure-resources er moeten zijn. Azure maakt ze dan aan (of past ze aan). Het grote voordeel: je kunt de hele omgeving opnieuw opbouwen, en test/prod zijn kopieën van dev met andere parameters.

### Stap 2.1 Resourcegroepen aanmaken

**Doel:** twee "mappen" in Azure: één gedeeld, één voor dev.

```
az group create --name rg-cockpit-shared-weu --location westeurope
az group create --name rg-cockpit-dev-weu --location westeurope
```

### Stap 2.2 Wat er in de gedeelde groep komt

Gedeeld betekent: gebruikt door alle omgevingen. In week 1 zijn dat:
- Container Registry (`crcockpitweu`, alleen letters en cijfers toegestaan): hier komen de Docker-images.
- Log Analytics-werkruimte (`log-cockpit-weu`): centrale logs.

### Stap 2.3 Wat er in de dev-groep komt en waarom

| Resource | Naam | Waarvoor |
|---|---|---|
| Virtual Network + subnets | `vnet-cockpit-dev-weu` | Privénetwerk waarin compute en database praten |
| Public IP + NAT Gateway | `pip-nat-cockpit-dev-weu`, `nat-cockpit-dev-weu` | Één vast uitgaand IP-adres; dit adres whitelist je bij Realworks |
| PostgreSQL Flexible Server | `psql-cockpit-dev-weu` | Database. In dev: publiek bereikbaar met firewall; in prod: privé |
| Storage-account | `stcockpitdevweu` | Blob-containers: raw-realworks, documents, audio |
| Key Vault | `kv-cockpit-dev-weu` | Secrets, o.a. Realworks-tokens per tenant |
| Service Bus (Standard) | `sb-cockpit-dev-weu` | Berichtenbus met topics: realworks-events, workflow-commands, document-jobs |
| Container Apps Environment | `cae-cockpit-dev-weu` | Omgeving waarin de API-container draait (aan het VNet gekoppeld) |
| Function App (Flex Consumption) | `func-cockpit-dev-weu` | Webhooks en sync-jobs (aan het VNet gekoppeld) |
| Application Insights | `appi-cockpit-dev-weu` | Monitoring, gekoppeld aan de gedeelde Log Analytics |
| User-assigned Managed Identity | `id-cockpit-dev-weu` | De "identiteit" van je apps; krijgt rechten op Key Vault, Storage en Service Bus |

### Stap 2.4 Bestandsstructuur

```
infra/bicep/
  main.bicep              koppelt de modules aan elkaar (dev/test/prod)
  shared.bicep            registry + log analytics
  dev.bicepparam          parameters voor dev
  modules/
    network.bicep         vnet, subnets, public ip, nat gateway
    postgres.bicep
    storage.bicep
    keyvault.bicep
    servicebus.bicep
    containerapps-env.bicep
    functions.bicep
    monitoring.bicep
    identity.bicep
```

### Stap 2.5 Laat Claude Code de modules genereren

Dit is precies het soort werk waar Claude Code goed in is. Geef in Claude Code deze opdracht (kopieer letterlijk):

> Maak in infra/bicep de bestanden zoals beschreven in stap 2.4 van docs/handleiding-week1.md. Eisen: (1) alle namen volgen {type}-cockpit-{env}-{weu} met env als parameter; (2) network.bicep maakt een VNet 10.10.0.0/16 met subnets snet-apps (10.10.1.0/24, gedelegeerd aan Microsoft.App/environments), snet-functions (10.10.2.0/24, gedelegeerd aan Microsoft.App/environments) en snet-data (10.10.3.0/24), een Standard static Public IP en een NAT Gateway die aan snet-apps en snet-functions hangt, en geeft het publieke IP als output; (3) postgres.bicep maakt een Flexible Server versie 16, Burstable B2s, met Entra-authenticatie aan en wachtwoordauthenticatie uit, publieke toegang aan met een firewallregel voor het NAT-IP; (4) keyvault.bicep gebruikt RBAC-autorisatie en geeft de managed identity de rol Key Vault Secrets User; (5) storage.bicep maakt drie blob-containers en een lifecycle-regel die de container audio na 30 dagen leegt; (6) servicebus.bicep maakt drie topics; (7) containerapps-env.bicep en functions.bicep koppelen aan het VNet en aan App Insights; (8) main.bicep neemt env, location en het shared Log Analytics-id als parameter en roept alle modules aan; (9) dev.bicepparam vult env='dev'. Gebruik de nieuwste stabiele API-versies. Voeg bovenaan elk bestand een comment van één regel toe wat het doet.

Lees daarna wat Claude Code heeft gemaakt. Je hoeft niet elke regel te begrijpen; controleer wel: staan alle namen goed, staat de regio op westeurope, zit er nergens een wachtwoord in.

Ter oriëntatie, zo ziet het netwerkdeel er ongeveer uit (Claude Code maakt de volledige versie):

```bicep
// Publiek IP + NAT Gateway: één vast uitgaand adres voor Realworks-whitelisting
param env string
param location string = resourceGroup().location

resource pip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: 'pip-nat-cockpit-${env}-weu'
  location: location
  sku: { name: 'Standard' }
  properties: { publicIPAllocationMethod: 'Static' }
}

resource nat 'Microsoft.Network/natGateways@2023-11-01' = {
  name: 'nat-cockpit-${env}-weu'
  location: location
  sku: { name: 'Standard' }
  properties: { publicIpAddresses: [ { id: pip.id } ] }
}

output natPublicIp string = pip.properties.ipAddress
```

### Stap 2.6 Controleren zonder iets aan te maken

Bicep heeft een "what-if": het laat zien wat er zou gebeuren.

```
az bicep build --file infra/bicep/main.bicep
az deployment group what-if -g rg-cockpit-dev-weu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
```

Foutmeldingen in deze stap plak je terug in Claude Code: "Los deze what-if-fout op: ...". Herhaal tot what-if een nette lijst met "+ Create"-regels geeft.

### Stap 2.7 Deployen

Eerst shared, dan dev:
```
az deployment group create -g rg-cockpit-shared-weu -f infra/bicep/shared.bicep
az deployment group create -g rg-cockpit-dev-weu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
```
Dit duurt 10–20 minuten (Postgres en de Container Apps Environment zijn traag).

### Stap 2.8 Controle en het vaste IP noteren

```
az resource list -g rg-cockpit-dev-weu --output table
az network public-ip show -g rg-cockpit-dev-weu -n pip-nat-cockpit-dev-weu --query ipAddress -o tsv
```
Het IP-adres dat de tweede opdracht teruggeeft, is het adres dat je in deel 4 bij Realworks whitelist. Schrijf het op in `docs/runbooks/realworks-koppeling.md`.

Extra controle: portal → Key Vault → "Access control (IAM)": de managed identity heeft de rol Key Vault Secrets User.

### Stap 2.9 Commit

```
git add infra docs
git commit -m "feat(infra): bicep voor shared en dev omgeving"
git push
```

---

## Deel 3 – GitHub Actions met OIDC

### Wat is OIDC en waarom

Normaal geef je GitHub een wachtwoord (client secret) om bij Azure in te loggen. Met OIDC vertrouwt Azure GitHub op basis van een identiteitsbewijs dat GitHub per run aanmaakt. Er is dan geen wachtwoord dat kan lekken of verlopen.

### Stap 3.1 App-registratie in Entra maken

**Doel:** een "gebruiker" voor GitHub in Azure, met rechten op alleen de dev-groep.

```
az ad app create --display-name "github-cockpit-dev"
```
Noteer de `appId` uit de uitvoer. Maak er een service principal van en geef rechten:
```
APP_ID=<plak appId hier>
az ad sp create --id $APP_ID
SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)
SUB_ID=$(az account show --query id -o tsv)
az role assignment create --role Contributor --assignee-object-id $SP_OBJECT_ID --assignee-principal-type ServicePrincipal --scope /subscriptions/$SUB_ID/resourceGroups/rg-cockpit-dev-weu
az role assignment create --role Contributor --assignee-object-id $SP_OBJECT_ID --assignee-principal-type ServicePrincipal --scope /subscriptions/$SUB_ID/resourceGroups/rg-cockpit-shared-weu
```

Omdat Bicep ook rolopdrachten maakt (managed identity → Key Vault) heeft de service principal ook "User Access Administrator" nodig op de dev-groep:
```
az role assignment create --role "User Access Administrator" --assignee-object-id $SP_OBJECT_ID --assignee-principal-type ServicePrincipal --scope /subscriptions/$SUB_ID/resourceGroups/rg-cockpit-dev-weu
```

### Stap 3.2 Federated credential toevoegen

**Doel:** vertellen welke GitHub-repo en branch deze identiteit mag gebruiken.

Maak een bestand `cred-dev.json`:
```json
{
  "name": "github-cockpit-dev-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:makelaarscockpit/platform:environment:dev",
  "audiences": ["api://AzureADTokenExchange"]
}
```
```
az ad app federated-credential create --id $APP_ID --parameters cred-dev.json
```
Verwijder `cred-dev.json` daarna (niet committen, al bevat het geen secret).

### Stap 3.3 GitHub Environment en variabelen

1. GitHub-repo → Settings → Environments → "New environment" → naam `dev`.
2. Settings → Secrets and variables → Actions → tab "Variables" → voeg toe:
   - `AZURE_CLIENT_ID` = de appId
   - `AZURE_TENANT_ID` = `az account show --query tenantId -o tsv`
   - `AZURE_SUBSCRIPTION_ID` = `az account show --query id -o tsv`

Dit zijn geen geheimen (het zijn identificatienummers), daarom staan ze bij Variables.

### Stap 3.4 De CI-workflow

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
  bicep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: az bicep build --file infra/bicep/main.bicep
```

### Stap 3.5 De deploy-dev-workflow

`.github/workflows/deploy-dev.yml`:
```yaml
name: deploy-dev
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['infra/**']
permissions:
  id-token: write
  contents: read
jobs:
  infra:
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      - name: What-if
        run: az deployment group what-if -g rg-cockpit-dev-weu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
      - name: Deploy
        run: az deployment group create -g rg-cockpit-dev-weu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
```

`permissions: id-token: write` is de regel die OIDC mogelijk maakt; `environment: dev` moet overeenkomen met de `subject` in de federated credential.

Het deployen van de applicaties zelf (containers bouwen, pushen naar de registry, Container App bijwerken) voeg je in week 2 toe zodra er een app is. Vraag dan aan Claude Code: "Breid deploy-dev.yml uit met een job die apps/api bouwt naar crcockpitweu en de Container App bijwerkt."

### Stap 3.6 Testen

1. Commit en push beide workflows naar main.
2. GitHub → Actions → "deploy-dev" → "Run workflow". De run moet groen worden. Bij een fout op de login-stap: controleer of `subject` in de federated credential exact `repo:makelaarscockpit/platform:environment:dev` is (hoofdlettergevoelig).
3. Maak een testbranch, wijzig iets in een README, open een pull request. De "ci"-workflow draait automatisch.

### Stap 3.7 Branch-bescherming

Settings → Branches → "Add rule" voor `main`: require pull request, require status checks (`build`, `bicep`). Zo kan er niets naar main zonder groene CI.

---

## Deel 4 – Realworks koppelen en verifiëren

### Stap 4.1 Registreren als developer (dag 1 starten)

1. Ga naar developers.realworks.nl en registreer met je bedrijfsgegevens.
2. Na registratie zie je op het Dashboard je Developer ID. Bewaar dit in `docs/runbooks/realworks-koppeling.md` (dit is geen geheim; het token straks wel).

### Stap 4.2 Wat C&R moet doen (stuur ze dit als checklist)

1. In Realworks CRM naar de Marketplace en de API's afnemen: Wonen, Relaties, Taken, Agenda (Facturen en Nieuwbouw kunnen later).
2. Bij het koppelen jouw Developer ID invullen.
3. De vrijgave (inzageniveaus) instellen:
   - Wonen: basisgegevens + objectgegevens + transactiegegevens + relatiegegevens
   - Relaties: niveau Plus
   - Taken en Agenda: 365 dagen terug, 90 dagen vooruit; inzageniveau "Iedereen"
4. Vragen aan Realworks welke afdelingscode(s) van toepassing zijn en of de test-API (devapi-test.realworks.nl) beschikbaar is voor deze koppeling.

Tip: plan hiervoor een half uur samen met de Realworks-beheerder van C&R, met het scherm gedeeld. Dan is het in één keer goed.

### Stap 4.3 Connectie accepteren en IP whitelisten

Zodra C&R heeft gekoppeld:
1. Jouw Dashboard → de connectie verschijnt onder Makelaarskantoren → accepteer de voorwaarden.
2. Klik op het token → IP's → voeg toe: het NAT Gateway-IP uit stap 2.8, omgeving "Productie" (of "Test" als Realworks een aparte testomgeving geeft), omschrijving "Azure dev".
3. Voeg tijdelijk ook het IP van je eigen laptop toe (google "what is my ip") met omschrijving "laptop Tim – tijdelijk", zodat je vanuit de devcontainer kunt testen. Verwijder dit aan het einde van week 2.

### Stap 4.4 Token veilig opslaan

Het token op het Dashboard is het wachtwoord van deze koppeling. Zet het direct in Key Vault en nergens anders:
```
az keyvault secret set --vault-name kv-cockpit-dev-weu --name tenant-cr-realworks-token --value "<token>"
az keyvault secret set --vault-name kv-cockpit-dev-weu --name tenant-cr-realworks-afdeling --value "<afdelingscode>"
```
Geef jezelf tijdelijk de rol Key Vault Secrets Officer op de vault als dit commando "Forbidden" geeft.

### Stap 4.5 Eerste handmatige call

Vanuit de devcontainer (laptop-IP is gewhitelist):
```
TOKEN=$(az keyvault secret show --vault-name kv-cockpit-dev-weu --name tenant-cr-realworks-token --query value -o tsv)
curl -s -H "Authorization: rwauth $TOKEN" "https://api.realworks.nl/wonen/v3/objecten" | head -c 800
```
De exacte basis-URL en het pad staan in de developer-portal onder APIs; pas aan als het afwijkt. Krijg je 401, controleer dan het `rwauth`-voorvoegsel en de spatie. Krijg je een lege lijst, dan is de vrijgave bij C&R nog niet ingesteld.

### Stap 4.6 Try it out-sessie: verifieer wat je kunt schrijven

Dit is de belangrijkste uitkomst van week 1, want het bepaalt het ontwerp van fase 2 en 3. Ga in de portal naar APIs → per API naar "Try it out" en vul onderstaande tabel in. Bewaar hem als `docs/adr/005-realworks-schrijfstrategie.md`.

| API | Endpoint (methode + pad) | GET werkt? | POST/PUT aanwezig? | Getest resultaat | Welke velden | Opmerking |
|---|---|---|---|---|---|---|
| Wonen | objecten (lijst) | | | | | |
| Wonen | objecten/{id} | | | | | |
| Wonen | leads (import) | | | | | behandelend medewerker meegeven mogelijk? |
| Wonen | zoekopdrachten (import) | | | | | |
| Wonen | statistieken (import) | | | | | |
| Relaties | relaties (lijst / detail) | | | | | |
| Relaties | relatie aanmaken | | | | | |
| Relaties | kenmerken (schrijven) | | | | | |
| Relaties | nieuwsbriefvoorkeur | | | | | |
| Taken | taken (lijst) | | | | | |
| Taken | taak aanmaken/wijzigen | | | | | |
| Agenda | afspraken (lijst) | | | | | |
| Agenda | afspraak aanmaken | | | | | |
| Objecten | object aanmaken / velden wijzigen | | | | | cruciaal voor fase 2 |

Aanpak per rij:
1. Bekijk in de portal of er naast GET ook POST/PUT/PATCH-operaties staan.
2. Test GET met Try it out; noteer of de data overeenkomt met de vrijgave.
3. Test schrijven alleen tegen de testomgeving, of met een duidelijk herkenbare testwaarde (bijv. kenmerk "INSIGHTLY-TEST") die C&R daarna verwijdert. Spreek dit vooraf met C&R af.
4. Kopieer de curl uit Try it out naar `packages/realworks/examples/` als naslag voor Claude Code.

Wat ontbreekt, vraag je dezelfde dag schriftelijk aan Realworks: "Zijn er (partner)endpoints voor het aanmaken van taken, afspraken en objecten, of staan die op de roadmap?" Noteer het antwoord in dezelfde ADR.

### Stap 4.7 Webhook voorbereiden (mag naar begin week 2)

Je hebt nog geen endpoint dat draait, dus registreer de webhook nog niet (na 25 mislukte pogingen zet Realworks hem automatisch uit). Bereid wel vast de gegevens voor:
- Doel-URL: `https://<function-app>.azurewebsites.net/api/webhooks/cr/wonen` (definitieve hostnaam komt uit stap 2.8 via `az functionapp show`)
- Object type: Wonen · Update type: Object update · Naam: `cockpit-dev-wonen` · E-mail: een gedeelde mailbox, niet je persoonlijke.

---

## Checklist einde week 1

- [ ] Subscription `cockpit-dev` met budgetalert; Founders Hub aangevraagd
- [ ] GitHub-organisatie en private repo `cockpit` met monorepo-structuur
- [ ] CLAUDE.md, ADR-sjabloon en devcontainer; Claude Code leest CLAUDE.md
- [ ] Bicep voor shared en dev gedeployed; alle resources zichtbaar in de portal
- [ ] NAT Gateway-IP genoteerd in het runbook
- [ ] OIDC-app met federated credential; `deploy-dev` groen; `ci` draait op pull requests; main beschermd
- [ ] Developer ID Realworks; C&R heeft gekoppeld en vrijgegeven; IP gewhitelist
- [ ] Token en afdelingscode in Key Vault; eerste GET geeft data
- [ ] Tabel schrijfmogelijkheden ingevuld in ADR-005; vraag aan Realworks verstuurd

## Als iets vastloopt

- Bicep-fouten: plak de volledige foutmelding in Claude Code met "Los op, verander alleen wat nodig is."
- Azure "not registered" of "quota exceeded": resource provider (stap 1.3) of regio-capaciteit; probeer voor Postgres een ander SKU of vraag quota aan.
- OIDC-login faalt: subject in de federated credential en `environment:` in de workflow moeten letterlijk gelijk zijn.
- Realworks 401: `rwauth` + spatie + token; token opnieuw kopiëren uit het Dashboard; controleer of het IP van waaruit je test is gewhitelist.
- Realworks geeft data maar niet wat je verwacht: inzageniveau bij C&R.
