#!/bin/bash
# Draait ÍN de toolbox-container: Realworks-call met een token uit Key Vault via de managed identity.
# Gebruik: rw [tenant] [pad] [host]   bv. rw dev /wonen/v3/objecten
set -euo pipefail
TENANT="${1:-dev}"; PAD="${2:-/wonen/v3/objecten}"; HOST="${3:-api.realworks.nl}"
if ! az account show --output none 2>/dev/null; then
  az login --identity --client-id "$AZURE_CLIENT_ID" --output none
fi
API=$(echo "$PAD" | cut -d/ -f2)
TOKEN=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "tenant-$TENANT-realworks-token-$API" --query value -o tsv 2>/dev/null || true)
[[ -n "$TOKEN" ]] || TOKEN=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "tenant-$TENANT-realworks-token" --query value -o tsv)
echo "GET https://$HOST$PAD (tenant $TENANT, vanaf IP $(curl -s --max-time 10 https://api.ipify.org || echo onbekend))"
code=$(curl -s -o /tmp/rw.json -w "%{http_code}" -H "Authorization: rwauth $TOKEN" -H "Accept: application/json" "https://$HOST$PAD")
echo "HTTP $code"; head -c 800 /tmp/rw.json; echo
