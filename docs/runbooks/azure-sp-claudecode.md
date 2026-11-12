# Runbook: dev-service principal voor Claude Code in de Codespace

Bijgewerkt: 2026-11-12. Achtergrond: ADR-017, issue #36. Geen van de ids hieronder is geheim; het certificaat wel.

| Wat | Waarde |
|---|---|
| Service principal | `sp-cockpit-dev-claudecode` |
| Application (client) ID | `e05a8c62-4ab0-4541-8c41-5ed1a39d5641` |
| Tenant | `d7d84db3-a6b9-492e-b12c-a4e3e7bf3d27` |
| Abonnement | `cockpit-dev` (`3cd2db41-5e0d-4d87-b029-df0fdefabc3d`) |
| Rol | `cockpit-dev-operator` op `rg-cockpit-dev-neu` (definitie: `infra/rbac/cockpit-dev-operator.json`) |
| Codespaces-secret | `AZURE_SP_CERT_B64` (gebruikerssecret, alleen voor deze repo): base64 van het PEM-bestand met sleutel en certificaat |
| In de Codespace | `.devcontainer/azure-login.sh` draait bij elke start; certificaat in `~/.azure-sp/cockpit-dev.pem` (700/600) |

Ook je eigen `az` in de Codespace draait als deze service principal, met alleen leesrechten. Wat meer rechten vraagt, doe je in **Azure Cloud Shell** (portal.azure.com, `>_`, Bash), ingelogd als jezelf.

## Vangrail en grens

- **De echte grens is RBAC.** De service principal heeft alleen de rol `cockpit-dev-operator`, alleen op `rg-cockpit-dev-neu`. Daarmee kan hij lezen, revisies van container apps (de)activeren en herstarten, en Postgres starten en stoppen. Hij kan niet schrijven of deployen, geen sleutels of secrets opvragen, niet `exec`'en in een container, geen jobs starten, geen logs lezen en niets buiten dev.
- **De deny-regels in `.claude/settings.json` zijn een vangrail.** Ze matchen de tekst van het commando dat Claude schrijft: `az deployment …`, `az … delete …` en elke aanroep van `dev-aan.sh` of `dev-uit.sh` (ook via `bash`, `sh` of `./`). Een andere schrijfwijze, zoals `/usr/bin/az` of `sh -c '…'`, valt erbuiten. Ze voorkomen vergissingen, geen opzet.
- Bijwerking: ook `cat` of `grep` op `dev-aan.sh` en `dev-uit.sh` via Bash wordt geweigerd. Lezen met de Read-tool werkt wel.

## dev-aan, dev-uit en de toolbox: voorlopig vanuit Cloud Shell

Na het intrekken van Contributor kan de Codespace `infra/scripts/dev-aan.sh`, `dev-uit.sh` en `toolbox.sh` niet meer draaien: die deployen, verwijderen of doen `exec`. Draai ze vanuit Cloud Shell:

```bash
az account set -s cockpit-dev
git clone https://github.com/CherryMedia1/makelaarscockpit.git 2>/dev/null || git -C makelaarscockpit pull
cd makelaarscockpit
bash infra/scripts/dev-aan.sh      # of dev-uit.sh, toolbox.sh
```

Een workflow in GitHub Actions moet dit vervangen (#38).

## Eenmalig: rol aanmaken, testen en daarna Contributor intrekken

Volgorde: **eerst** de rol aanmaken en toewijzen, **dan** testen, **pas daarna** Contributor intrekken. Alles in Cloud Shell, ingelogd als jezelf met Owner-rechten op het abonnement.

**1. Rol aanmaken en toewijzen**

```bash
az account set -s cockpit-dev
APP=e05a8c62-4ab0-4541-8c41-5ed1a39d5641
RG_SCOPE=/subscriptions/3cd2db41-5e0d-4d87-b029-df0fdefabc3d/resourceGroups/rg-cockpit-dev-neu
curl -fsSL https://raw.githubusercontent.com/CherryMedia1/makelaarscockpit/main/infra/rbac/cockpit-dev-operator.json -o cockpit-dev-operator.json
az role definition create --role-definition @cockpit-dev-operator.json --query roleName -o tsv
SP=$(az ad sp show --id $APP --query id -o tsv)
az role assignment create --assignee-object-id $SP --assignee-principal-type ServicePrincipal --role cockpit-dev-operator --scope $RG_SCOPE --query roleDefinitionName -o tsv
az role assignment list --assignee $APP --all --query "[].{rol:roleDefinitionName, scope:scope}" -o table
```

De lijst moet nu `Contributor` en `cockpit-dev-operator` tonen, beide op `rg-cockpit-dev-neu`. Een nieuwe roldefinitie kan een paar minuten nodig hebben voordat de toewijzing lukt.

**2. Testen vóór het intrekken.** Zolang Contributor er nog staat, slagen alle acties ook via Contributor. Test in deze stap daarom of de rol klopt en de toewijzing bestaat:

```bash
az role definition list --name cockpit-dev-operator --query "[0].{acties:permissions[0].actions, niet:permissions[0].notActions, scope:assignableScopes}" -o jsonc
```

De functionele test volgt na stap 3.

**3. Contributor intrekken**

```bash
az role assignment delete --assignee $APP --role Contributor --scope $RG_SCOPE
az role assignment list --assignee $APP --all --query "[].roleDefinitionName" -o tsv    # alleen cockpit-dev-operator
```

**4. Functioneel testen in de Codespace.** Een nieuwe terminal is genoeg; Azure past rolwijzigingen binnen enkele minuten toe.

| Commando | Verwacht |
|---|---|
| `az group show -n rg-cockpit-dev-neu --query name -o tsv` | `rg-cockpit-dev-neu` |
| `az containerapp job execution list -n job-migratie-cockpit-dev-neu -g rg-cockpit-dev-neu --query "[0].properties.status" -o tsv` | een status, bijvoorbeeld `Succeeded` |
| `az containerapp revision restart -n ca-web-cockpit-dev-neu -g rg-cockpit-dev-neu --revision $(az containerapp show -n ca-web-cockpit-dev-neu -g rg-cockpit-dev-neu --query properties.latestRevisionName -o tsv)` | lukt (herstart de dev-webapp) |
| `az storage account keys list -n stcockpitdevneu -g rg-cockpit-dev-neu` | `AuthorizationFailed` |
| `az containerapp job start -n job-migratie-cockpit-dev-neu -g rg-cockpit-dev-neu` | `AuthorizationFailed` |
| `az group update -n rg-cockpit-dev-neu --tags test=1` | `AuthorizationFailed` |

**Deny-regels testen in een nieuwe Claude Code-sessie.** Wijzigingen in `.claude/settings.json` worden pas bij een nieuwe sessie ingelezen. Vraag Claude om `az group delete --help` en `az deployment --help` te draaien: beide moeten geweigerd worden.

**Terugdraaien** als iets nodig blijkt dat de rol niet heeft: `az role assignment create --assignee-object-id $SP --assignee-principal-type ServicePrincipal --role Contributor --scope $RG_SCOPE`. Pas daarna de rol aan in `infra/rbac/cockpit-dev-operator.json`, en voer `az role definition update --role-definition @cockpit-dev-operator.json` uit voordat je Contributor opnieuw intrekt.

## Jaarlijks: certificaat vernieuwen

In Cloud Shell, ingelogd als admin. Het certificaat wordt niet gedownload en komt nergens anders terecht dan in het Codespaces-secret.

```bash
APP=e05a8c62-4ab0-4541-8c41-5ed1a39d5641
az ad app credential list --id $APP --cert --query "[].{thumbprint:customKeyIdentifier, eind:endDateTime}" -o table   # noteer de oude thumbprint
az ad app credential reset --id $APP --create-cert --years 1 --query fileWithCertAndPrivateKey -o tsv
```

Let op: het is `az ad app`, niet `az ad sp`. Zonder `--append` vervangt `reset` alle bestaande sleutels, zodat er precies één certificaat overblijft. De uitvoer is het pad naar het PEM-bestand in je Cloud Shell-thuismap. Die map wordt bewaard, dus verwijder het bestand meteen nadat het secret is gezet:

```bash
PEM=<pad uit de vorige stap>
gh auth login -s codespace:secrets
base64 -w0 "$PEM" | gh secret set AZURE_SP_CERT_B64 --user --app codespaces --repos CherryMedia1/makelaarscockpit
rm -f "$PEM"
gh auth logout
```

Daarna de Codespace stoppen en starten: een Codespaces-secret wordt bij de start geladen. Het loginscript ziet het nieuwe certificaat en logt opnieuw in.

**Controleren:**

```bash
az ad app credential list --id $APP --cert --query "[].{thumbprint:customKeyIdentifier, eind:endDateTime}" -o table
```

Er moet precies één certificaat staan, met een nieuwe thumbprint en een einddatum over een jaar. Het loginscript waarschuwt 30 dagen voor het verlopen.

## Als het certificaat lekt

1. **Direct resetten** zoals bij "Jaarlijks: certificaat vernieuwen". Daarmee is de oude sleutel meteen ongeldig.
2. **Controleren** met `az ad app credential list --id $APP --cert` dat de oude thumbprint weg is en er precies één certificaat staat.
3. **Nagaan wat er is gebeurd:** `az monitor activity-log list -g rg-cockpit-dev-neu --caller $APP --offset 7d --query "[].{tijd:eventTimestamp, actie:operationName.value, status:status.value}" -o table`. Met de rol `cockpit-dev-operator` kan de sleutel hooguit lezen (configuratie, geen data), revisies herstarten en Postgres starten of stoppen.
4. Het Codespaces-secret bijwerken (staat al in de reset-stap), en de Codespace herstarten.
