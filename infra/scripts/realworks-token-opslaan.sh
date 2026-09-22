#!/usr/bin/env bash
# Slaat een Realworks-token (per API: wonen, relaties, taken, agenda) en de afdelingscode van een tenant op in Key Vault (stap 4.4).
# Gebruik: realworks-token-opslaan.sh [tenant] [api]   bv. realworks-token-opslaan.sh cr wonen
# Het token wordt onzichtbaar ingevoerd en komt nergens anders terecht (niet in git, niet in de shell-history).
set -euo pipefail

KV="kv-cockpit-dev-neu-01"
TENANT="${1:-cr}"
API="${2:-wonen}"

sub=$(az account show --query name -o tsv | tr -d '\r')
[[ "$sub" == "cockpit-dev" ]] || { echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'." >&2; exit 1; }

read -r -s -p "Realworks-token voor tenant '$TENANT', API '$API' (onzichtbaar): " TOKEN; echo
read -r -p "Afdelingscode (leeg = overslaan): " AFDELING

[[ -n "$TOKEN" ]] || { echo "Geen token ingevoerd." >&2; exit 1; }
az keyvault secret set --vault-name "$KV" --name "tenant-$TENANT-realworks-token-$API" --value "$TOKEN" --output none
echo "opgeslagen: tenant-$TENANT-realworks-token-$API"
if [[ -n "$AFDELING" ]]; then
  az keyvault secret set --vault-name "$KV" --name "tenant-$TENANT-realworks-afdeling" --value "$AFDELING" --output none
  echo "opgeslagen: tenant-$TENANT-realworks-afdeling"
fi
