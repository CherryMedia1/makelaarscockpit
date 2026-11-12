#!/usr/bin/env bash
# Logt de Codespace bij elke start in op Azure dev als service principal sp-cockpit-dev-claudecode (ADR-017, issue #36).
# Het certificaat komt uit het Codespaces-secret AZURE_SP_CERT_B64 en wordt buiten /workspaces bewaard.
# Print nooit het certificaat, de base64-waarde of tokens: geen set -x, uitvoer van az naar /dev/null,
# bij een fout alleen de AADSTS-code. Idempotent: is de login al in orde en het certificaat ongewijzigd, dan gebeurt er niets.
set -uo pipefail
umask 077

ABONNEMENT="cockpit-dev"
MAP="$HOME/.azure-sp"
PEM="$MAP/cockpit-dev.pem"
RUNBOOK="docs/runbooks/azure-sp-claudecode.md"

if [[ -z "${AZURE_SP_CERT_B64:-}" ]]; then
  echo "azure-login: Codespaces-secret AZURE_SP_CERT_B64 ontbreekt; niet ingelogd op Azure (zie $RUNBOOK)."
  exit 0
fi
if [[ -z "${AZURE_SP_APP_ID:-}" || -z "${AZURE_SP_TENANT_ID:-}" ]]; then
  echo "azure-login: AZURE_SP_APP_ID of AZURE_SP_TENANT_ID ontbreekt in containerEnv; niet ingelogd." >&2
  exit 1
fi

mkdir -p "$MAP" && chmod 700 "$MAP"
nieuw=$(mktemp "$MAP/.cert.XXXXXX")
trap 'rm -f "$nieuw"' EXIT
if ! printf '%s' "$AZURE_SP_CERT_B64" | base64 -d >"$nieuw" 2>/dev/null || ! grep -q "PRIVATE KEY" "$nieuw"; then
  echo "azure-login: AZURE_SP_CERT_B64 is geen base64 van een PEM met sleutel; niet ingelogd (zie $RUNBOOK)." >&2
  exit 1
fi

# Een vernieuwd certificaat (ander secret na een herstart) vervangt het bestand en dwingt een nieuwe login af.
gewijzigd=1
if [[ -f "$PEM" ]] && cmp -s "$nieuw" "$PEM"; then
  gewijzigd=0
else
  mv "$nieuw" "$PEM"
fi
chmod 600 "$PEM"

if ! openssl x509 -in "$PEM" -noout -checkend $((30 * 86400)) >/dev/null 2>&1; then
  einde=$(openssl x509 -in "$PEM" -noout -enddate 2>/dev/null | cut -d= -f2)
  echo "azure-login: let op, het certificaat verloopt op ${einde:-onbekend}; vernieuwen volgens $RUNBOOK."
fi

huidig=$(az account show --query "join('|', [user.name, user.type, name])" -o tsv 2>/dev/null | tr -d '\r')
if [[ $gewijzigd -eq 0 && "$huidig" == "$AZURE_SP_APP_ID|servicePrincipal|$ABONNEMENT" ]]; then
  echo "ingelogd als service principal op $ABONNEMENT"
  exit 0
fi

fout=$(az login --service-principal -u "$AZURE_SP_APP_ID" --tenant "$AZURE_SP_TENANT_ID" --certificate "$PEM" --output none 2>&1 >/dev/null)
if [[ $? -ne 0 ]]; then
  code=$(grep -oE 'AADSTS[0-9]+' <<<"$fout" | head -1)
  echo "azure-login: inloggen mislukt (${code:-geen AADSTS-code}); zie $RUNBOOK." >&2
  exit 1
fi
if ! az account set --subscription "$ABONNEMENT" >/dev/null 2>&1; then
  echo "azure-login: ingelogd, maar abonnement $ABONNEMENT niet gevonden; heeft de service principal een rol op rg-cockpit-dev-neu?" >&2
  exit 1
fi
echo "ingelogd als service principal op $ABONNEMENT"
