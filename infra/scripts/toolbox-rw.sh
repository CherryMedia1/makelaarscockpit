#!/bin/bash
# Draait ÍN de toolbox-container: Realworks-calls met een token uit Key Vault via de managed identity.
# Gebruik: rw [tenant] [pad] [host]            één call, eerste 800 tekens van het antwoord
#          rw multi [tenant] pad1 pad2 ...     meerdere paden in één sessie, één regel per pad (code + begin antwoord)
set -euo pipefail
if ! az account show --output none 2>/dev/null; then
  az login --identity --client-id "$AZURE_CLIENT_ID" --output none
fi
token_voor() { # tenant pad
  local api; api=$(echo "$2" | cut -d/ -f2)
  local t; t=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "tenant-$1-realworks-token-$api" --query value -o tsv 2>/dev/null || true)
  [[ -n "$t" ]] || t=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "tenant-$1-realworks-token" --query value -o tsv)
  echo "$t"
}
if [[ "${1:-}" == "multi" ]]; then
  TENANT="${2:-dev}"; shift 2
  echo "tenant $TENANT, vanaf IP $(curl -s --max-time 10 https://api.ipify.org || echo onbekend)"
  for PAD in "$@"; do
    TOKEN=$(token_voor "$TENANT" "$PAD")
    code=$(curl -s -o /tmp/rw.json -w "%{http_code}" -H "Authorization: rwauth $TOKEN" -H "Accept: application/json" "https://api.realworks.nl$PAD")
    printf "%-52s HTTP %s  %s\n" "$PAD" "$code" "$(head -c 110 /tmp/rw.json | tr '\n' ' ')"
  done
  exit 0
fi
TENANT="${1:-dev}"; PAD="${2:-/wonen/v3/objecten}"; HOST="${3:-api.realworks.nl}"
TOKEN=$(token_voor "$TENANT" "$PAD")
echo "GET https://$HOST$PAD (tenant $TENANT, vanaf IP $(curl -s --max-time 10 https://api.ipify.org || echo onbekend))"
code=$(curl -s -o /tmp/rw.json -w "%{http_code}" -H "Authorization: rwauth $TOKEN" -H "Accept: application/json" "https://$HOST$PAD")
echo "HTTP $code"; head -c 800 /tmp/rw.json; echo
