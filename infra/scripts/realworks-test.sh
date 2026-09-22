#!/usr/bin/env bash
# Eerste handmatige call naar Realworks met het token uit Key Vault (stap 4.5).
# Gebruik: infra/scripts/realworks-test.sh [tenant] [pad]   bv. realworks-test.sh cr /wonen/v3/objecten
# Het token wordt gekozen op het eerste padsegment (wonen, relaties, taken, agenda).
# Vereist: het IP van waaruit je dit draait staat bij Realworks op de whitelist.
set -euo pipefail

KV="kv-cockpit-dev-neu-01"
TENANT="${1:-cr}"
PAD="${2:-/wonen/v3/objecten}"
BASIS="https://api.realworks.nl"

API=$(echo "$PAD" | cut -d/ -f2)
TOKEN=$(az keyvault secret show --vault-name "$KV" --name "tenant-$TENANT-realworks-token-$API" --query value -o tsv | tr -d '\r')
echo "GET $BASIS$PAD (tenant $TENANT, vanaf IP $(curl -s --max-time 10 https://api.ipify.org || echo onbekend))"
code=$(curl -s -o /tmp/realworks-antwoord.json -w "%{http_code}" -H "Authorization: rwauth $TOKEN" -H "Accept: application/json" "$BASIS$PAD")
echo "HTTP $code"
head -c 800 /tmp/realworks-antwoord.json; echo
case "$code" in
  401) echo "401: controleer het rwauth-voorvoegsel, het token, en of dit IP gewhitelist is." ;;
  403) echo "403: IP waarschijnlijk niet gewhitelist, of vrijgave bij C&R niet ingesteld." ;;
esac
