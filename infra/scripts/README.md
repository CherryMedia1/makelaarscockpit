# infra/scripts

Hulpscripts voor de dev-omgeving: `dev-uit.sh` en `dev-aan.sh` (kosten), `realworks-token-opslaan.sh` (token naar Key Vault), `realworks-test.sh` (eerste GET vanaf de laptop), `toolbox.sh` (shell vanaf het vaste IP; `toolbox-rw.sh` draait daarin), `devvm-setup.sh` (ontwikkel-VM, geparkeerd).

## Inventarisatie van klantdata in dev (issue #39)

Twee scripts die alleen tellen. Ze tonen geen kolominhoud en geen bestandsnamen. Achtergrond: `docs/inventarisatie-klantdata-dev.md`.

### Database: `inventaris-dev.sql`

Geeft per tabel en per tenant het aantal rijen en de oudste en nieuwste aanmaakdatum. Draait in een read-only transactie en zet RLS niet uit.

- **Waar:** in de toolbox-container, gestart vanuit Cloud Shell. De firewall van Postgres laat alleen het vaste NAT-IP toe; rechtstreeks vanuit Cloud Shell lukt het niet zonder een extra firewallregel.
- **Inloggen:** met een Entra-token van de managed identity. Er is geen beheerderswachtwoord (Postgres is Entra-only).
- **Rol:** `id-cockpit-dev-neu`, de eigenaar van de tabellen. Het script loopt de tenants langs en telt per tenant binnen het RLS-beleid; `BYPASSRLS` is niet nodig.

```bash
# Cloud Shell, als jezelf
az account set -s cockpit-dev
bash infra/scripts/toolbox.sh

# in de shell van de toolbox
tdnf install -y postgresql
az login --identity --client-id "$AZURE_CLIENT_ID" --output none
export PGHOST=psql-cockpit-dev-neu.postgres.database.azure.com PGDATABASE=cockpit PGUSER=id-cockpit-dev-neu PGSSLMODE=require
export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
curl -fsSL https://raw.githubusercontent.com/CherryMedia1/makelaarscockpit/main/infra/scripts/inventaris-dev.sql | psql -X -f -
exit
```

Zolang het script nog niet op `main` staat, vervang je `main` in de URL door de branchnaam.

Getest tegen een lokale Postgres 16 met alle migraties, niet tegen dev. Niet getest: de pakketnaam voor `psql` in het toolbox-image (`mcr.microsoft.com/azure-cli`). Werkt `tdnf install -y postgresql` niet, probeer dan `tdnf search postgresql`.

Het script stopt met `permission denied` als je inlogt met een rol die geen eigenaar is. Blok 0 van de uitvoer laat zien met welke rol je bent ingelogd en of de transactie read-only is.

### Blobs: `inventaris-dev-blobs.sh`

Geeft per container het aantal blobs, de totale grootte, de oudste en nieuwste wijzigingsdatum en het aantal soft-deleted blobs. Draait in Cloud Shell als jezelf.

Je hebt hiervoor tijdelijk de rol **Storage Blob Data Reader** op het storage-account nodig. Owner op het abonnement geeft geen toegang tot blobdata. De rol geeft leesrecht op alle blobs, dus trek hem direct na afloop weer in.

```bash
az account set -s cockpit-dev
IK=$(az ad signed-in-user show --query id -o tsv)
SCOPE=$(az storage account show -g rg-cockpit-dev-neu -n stcockpitdevneu --query id -o tsv)

# toewijzen (kan een paar minuten duren voordat het werkt)
az role assignment create --assignee-object-id "$IK" --assignee-principal-type User --role "Storage Blob Data Reader" --scope "$SCOPE" --query roleDefinitionName -o tsv

bash infra/scripts/inventaris-dev-blobs.sh

# intrekken en controleren (de laatste opdracht moet niets tonen)
az role assignment delete --assignee "$IK" --role "Storage Blob Data Reader" --scope "$SCOPE"
az role assignment list --assignee "$IK" --scope "$SCOPE" --query "[?roleDefinitionName=='Storage Blob Data Reader'].roleDefinitionName" -o tsv
```

Het script is niet tegen dev getest: de service principal van de Codespace heeft geen datarechten. Alleen de syntax en de optelling zijn gecontroleerd.
