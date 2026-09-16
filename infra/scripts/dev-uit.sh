#!/usr/bin/env bash
# Zet de dev-omgeving in de zuinige stand: Postgres stoppen, NAT Gateway loskoppelen en verwijderen.
# Het publieke IP blijft bestaan, dus het bij Realworks gewhiteliste adres verandert niet.
# Let op: Azure start een gestopte Postgres-server na 7 dagen automatisch weer op.
# Let op: draai dev-aan.sh vóór een Bicep-deploy (ook de deploy-dev workflow); een gestopte server accepteert geen wijzigingen.
set -euo pipefail

RG="rg-cockpit-dev-neu"
PG="psql-cockpit-dev-neu"
VNET="vnet-cockpit-dev-neu"
NAT="nat-cockpit-dev-neu"

sub=$(az account show --query name -o tsv | tr -d '\r')
if [[ "$sub" != "cockpit-dev" ]]; then
  echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'. Gestopt." >&2
  exit 1
fi

echo "== Postgres stoppen ($PG) =="
state=$(az postgres flexible-server show -g "$RG" -n "$PG" --query state -o tsv 2>/dev/null | tr -d '\r' || true)
if [[ "$state" == "Ready" ]]; then
  az postgres flexible-server stop -g "$RG" -n "$PG" --output none
  echo "gestopt"
else
  echo "overgeslagen (status: ${state:-niet gevonden})"
fi

echo "== NAT Gateway loskoppelen en verwijderen ($NAT) =="
if az network nat gateway show -g "$RG" -n "$NAT" --output none 2>/dev/null; then
  for snet in snet-apps snet-functions; do
    az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$snet" --remove natGateway --output none
  done
  az network nat gateway delete -g "$RG" -n "$NAT"
  echo "verwijderd"
else
  echo "overgeslagen (bestaat niet)"
fi

echo "Klaar. Wat doorloopt: Postgres-opslag, publiek IP, Service Bus en Container Registry, samen ongeveer € 20 per maand."
