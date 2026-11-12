# Runbook: GitHub Actions naar Azure via OIDC

Bijgewerkt: 2026-11-12. Geen van deze waarden is geheim; het zijn identificatienummers.

## App-registratie github-cockpit-dev (stap 3.1)

| Wat | Waarde |
|---|---|
| Display name | `github-cockpit-dev` |
| Application (client) ID = `AZURE_CLIENT_ID` | `6e637a59-2fec-4d37-a63e-23496497ac92` |
| Service principal object-id | `3901ac34-a0f2-4e58-ba7e-6a924f45abdc` |
| `AZURE_TENANT_ID` | `d7d84db3-a6b9-492e-b12c-a4e3e7bf3d27` |
| `AZURE_SUBSCRIPTION_ID` (cockpit-dev) | `3cd2db41-5e0d-4d87-b029-df0fdefabc3d` |

Rollen: Contributor op `rg-cockpit-dev-neu` en `rg-cockpit-shared-neu`, User Access Administrator op `rg-cockpit-dev-neu`
(nodig omdat Bicep rolopdrachten maakt). User Access Administrator wordt vervangen door Role Based Access Control Administrator
met een conditie (ADR-018, issue #41); de stappen staan onderaan dit runbook. Werk deze regel bij als dat is gedaan.

## Federated credential (stap 3.2)

GitHub presenteert het subject inclusief account- en repo-id, en dat moet exact overeenkomen:

| Naam | Subject |
|---|---|
| `github-cockpit-dev-main` | `repo:CherryMedia1@283943421/makelaarscockpit@1372678128:environment:dev` |

De klassieke vorm uit de handleiding (`repo:CherryMedia1/makelaarscockpit:environment:dev`) werkte niet (AADSTS700213).

Faalt de login met AADSTS700213, kijk dan in de log van azure/login naar "subject claim" en maak een credential met precies die waarde.
Verhuist de repo naar een organisatie, dan veranderen owner en id en moet de credential opnieuw.

## GitHub (stap 3.3)

Settings → Environments → `dev`. Settings → Secrets and variables → Actions → Variables:
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` met de waarden hierboven.

De environment `dev` laat sinds 2026-11-12 alleen deploys vanaf de branch `main` toe en heeft een verplichte reviewer.
Het subject van het federated credential bindt aan de environment, niet aan een branch; deze instelling bepaalt dus wie het
OIDC-token kan krijgen. Gevolg: elke run van `deploy-dev` en `deploy-apps-dev` wacht op goedkeuring in GitHub
(Actions → de run → Review deployments), ook een handmatige run via `workflow_dispatch`.

## Rolopdrachten door de workflow: RBAC Administrator met conditie (ADR-018, issue #41)

De service principal mag alleen de rollen toewijzen die Bicep in dev werkelijk toewijst, en alleen aan de managed identity
en de beheerder. De conditie staat in `infra/rbac/github-cockpit-dev-rbac-conditie.txt`.

| Rol in de conditie | Id | Aan |
|---|---|---|
| Storage Blob Data Owner | `b7e6dc6d-f1e8-4753-8033-0f276bb0955b` | managed identity |
| Storage Queue Data Contributor | `974c5e8b-45b9-4653-ba55-5f855dd0fb88` | managed identity |
| Storage Table Data Contributor | `0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3` | managed identity |
| Key Vault Secrets User | `4633458b-17de-408a-b874-0445c86b69e6` | managed identity |
| Key Vault Secrets Officer | `b86a8fe4-44ce-4948-aee5-eccb2c155cd7` | beheerder |
| Azure Service Bus Data Owner | `090c5cfd-751d-490a-894a-3ce6f1109419` | managed identity |
| Communication and Email Service Owner | `09976791-48a7-449e-bb21-39d1a415f350` | managed identity |
| Cognitive Services User | `a97b65f3-24c7-4388-baec-2e87135dc908` | managed identity (in dev uit) |

| Principal in de conditie | Object-id |
|---|---|
| Managed identity `id-cockpit-dev-neu` | `33f280f7-e015-46a2-904d-cb1f20f34b61` |
| Beheerder (`adminObjectId` in `dev.bicepparam`) | `5ea0a0fb-3469-4a13-b138-fff365379ce7` |

De conditie beperkt op rol én op principal. Daardoor kan de service principal zichzelf geen rol geven.

### Eenmalig: rol vervangen

Volgorde: **eerst** de nieuwe rol toewijzen, **dan** de conditie teruglezen, **dan** User Access Administrator intrekken,
**daarna** `deploy-dev` draaien. Alles in Cloud Shell, ingelogd als jezelf met Owner-rechten op het abonnement.

**1. Federated credential controleren**

```bash
az account set -s cockpit-dev
APP=6e637a59-2fec-4d37-a63e-23496497ac92
az ad app federated-credential list --id $APP --query "[].{naam:name, subject:subject}" -o table
```

Verwacht: één credential, `github-cockpit-dev-main`, met een subject dat eindigt op `:environment:dev`. Staat er een
subject met `pull_request` of `ref:refs/heads/`, verwijder dat credential dan eerst en noteer het hier.

**2. RBAC Administrator met conditie toewijzen**

```bash
SP=3901ac34-a0f2-4e58-ba7e-6a924f45abdc
RG_SCOPE=/subscriptions/3cd2db41-5e0d-4d87-b029-df0fdefabc3d/resourceGroups/rg-cockpit-dev-neu
curl -fsSL https://raw.githubusercontent.com/CherryMedia1/makelaarscockpit/main/infra/rbac/github-cockpit-dev-rbac-conditie.txt -o conditie.txt
az role assignment create --assignee-object-id $SP --assignee-principal-type ServicePrincipal \
  --role "Role Based Access Control Administrator" --scope $RG_SCOPE \
  --condition "$(cat conditie.txt)" --condition-version "2.0" \
  --description "Alleen de rollen uit infra/bicep, alleen aan de managed identity en de beheerder (ADR-018)" \
  --query roleDefinitionName -o tsv
```

Zolang het bestand nog niet op `main` staat, vervang je `main` in de URL door de branchnaam.

**3. Conditie teruglezen.** Dit is de controle dat de beperking er staat; er is geen aparte negatieve test via een workflow.

```bash
az role assignment list --assignee $SP --all --query "[].{rol:roleDefinitionName, scope:scope, versie:conditionVersion}" -o table
az role assignment list --assignee $SP --query "[].condition" -o tsv
```

De eerste opdracht toont Contributor, User Access Administrator en Role Based Access Control Administrator. De tweede
toont de conditie: vergelijk hem met `conditie.txt`. Hij moet de acht rol-id's en de twee object-id's uit de tabellen
hierboven bevatten, voor zowel `roleAssignments/write` als `roleAssignments/delete`. Is de uitvoer leeg, dan is de rol
zonder conditie toegewezen: verwijder hem en herhaal stap 2.

**4. User Access Administrator intrekken**

```bash
az role assignment delete --assignee $SP --role "User Access Administrator" --scope $RG_SCOPE
az role assignment list --assignee $SP --all --query "[].roleDefinitionName" -o tsv    # Contributor en Role Based Access Control Administrator
```

**5. Positieve test: `deploy-dev` draaien.** GitHub → Actions → `deploy-dev` → Run workflow (branch `main`). De run
wacht op jouw goedkeuring (Review deployments). Wacht na stap 4 een paar minuten; Azure past rolwijzigingen niet direct toe.
De run is geslaagd als de stap Deploy zonder `AuthorizationFailed` eindigt: Bicep schrijft dan alle bestaande
rolopdrachten opnieuw, binnen de conditie.

**Terugdraaien** als de deploy faalt op `Microsoft.Authorization/roleAssignments/write`:

```bash
az role assignment create --assignee-object-id $SP --assignee-principal-type ServicePrincipal --role "User Access Administrator" --scope $RG_SCOPE
```

Zoek daarna in de foutmelding welke rol of principal buiten de conditie viel, pas `conditie.txt` aan (zie hieronder) en
trek User Access Administrator opnieuw in.

### Een rol toevoegen aan Bicep

Een nieuwe `roleAssignments`-resource in `infra/bicep` faalt in `deploy-dev` tot de conditie hem toelaat. Volgorde:

1. In dezelfde PR: het rol-id (en zo nodig het object-id) toevoegen aan `infra/rbac/github-cockpit-dev-rbac-conditie.txt`, op beide plekken (`@Request` en `@Resource`), en aan de tabel hierboven.
2. Vóór het mergen, in Cloud Shell: de conditie bijwerken.

```bash
SP=3901ac34-a0f2-4e58-ba7e-6a924f45abdc
RG_SCOPE=/subscriptions/3cd2db41-5e0d-4d87-b029-df0fdefabc3d/resourceGroups/rg-cockpit-dev-neu
# conditie.txt = het aangepaste bestand uit de PR-branch (curl zoals in stap 2, met de branchnaam in de URL)
az role assignment list --assignee $SP --scope $RG_SCOPE --query "[?roleDefinitionName=='Role Based Access Control Administrator'] | [0]" -o json \
  | jq --rawfile c conditie.txt '.condition = $c | .conditionVersion = "2.0"' > toewijzing.json
az role assignment update --role-assignment toewijzing.json
az role assignment list --assignee $SP --query "[].condition" -o tsv
```

3. Mergen en de run van `deploy-dev` goedkeuren.

Wordt de managed identity opnieuw aangemaakt of wisselt de beheerder, dan verandert het object-id en moet de conditie op dezelfde manier mee.

De conditie en deze stappen zijn geschreven volgens de documentatie van Microsoft en nog niet in Azure uitgevoerd (stand 2026-11-12). Noteer hier de datum en eventuele afwijkingen na de eerste uitvoering.
