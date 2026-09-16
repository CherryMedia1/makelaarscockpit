#!/usr/bin/env bash
# Zet de dev-omgeving weer aan: Postgres starten en de Bicep-template opnieuw deployen.
# De deploy herstelt wat dev-uit.sh heeft verwijderd, volgens infra/bicep/dev.bicepparam
# (de NAT Gateway komt alleen terug als natGatewayEnabled daar op true staat).
set -euo pipefail

RG="rg-cockpit-dev-neu"
PG="psql-cockpit-dev-neu"
BICEP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bicep" && pwd)"

sub=$(az account show --query name -o tsv | tr -d '\r')
if [[ "$sub" != "cockpit-dev" ]]; then
  echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'. Gestopt." >&2
  exit 1
fi

echo "== Postgres starten ($PG) =="
state=$(az postgres flexible-server show -g "$RG" -n "$PG" --query state -o tsv 2>/dev/null | tr -d '\r' || true)
if [[ "$state" == "Stopped" ]]; then
  az postgres flexible-server start -g "$RG" -n "$PG" --output none
  echo "gestart"
else
  echo "overgeslagen (status: ${state:-niet gevonden})"
fi

echo "== Bicep deployen ($RG) =="
cd "$BICEP"
az deployment group create -g "$RG" -f main.bicep -p dev.bicepparam --query "properties.provisioningState" -o tsv | tr -d '\r'
echo "Klaar."
