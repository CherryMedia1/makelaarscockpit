#!/usr/bin/env bash
# Voegt een gebruiker toe aan een kantoor in dev, of werkt hem bij (issue #5).
# Gebruik: infra/scripts/gebruiker-toevoegen.sh <tenant> <e-mailadres> <medewerker|kantoorbeheerder> ["Naam"] [toegang-tot JJJJ-MM-DD] [microsoft-tenant-id]
# De gegevens gaan als tijdelijk bestand naar de afgeschermde opslag; de job leest het in het VNet en verwijdert het daarna.
set -euo pipefail

TENANT="${1:?tenant ontbreekt, bv. cr}"; EMAIL="${2:?e-mailadres ontbreekt}"; ROL="${3:?rol ontbreekt: medewerker of kantoorbeheerder}"
NAAM="${4:-}"; TOEGANG_TOT="${5:-}"; MICROSOFT_TENANT="${6:-}"
RG="rg-cockpit-dev-neu"; OPSLAG="stcockpitdevneu"; JOB="job-gebruikers-cockpit-dev-neu"

sub=$(az account show --query name -o tsv | tr -d '\r')
[[ "$sub" == "cockpit-dev" ]] || { echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'." >&2; exit 1; }

bestand=$(mktemp)
trap 'rm -f "$bestand"' EXIT
python3 - "$EMAIL" "$ROL" "$NAAM" "$TOEGANG_TOT" "$MICROSOFT_TENANT" > "$bestand" <<'PY'
import json, sys
email, rol, naam, tot, ms = sys.argv[1:6]
print(json.dumps([{"email": email, "rol": rol, "naam": naam or None, "toegangTot": tot or None, "microsoftTenantId": ms or None}]))
PY

sleutel=$(az storage account keys list -g "$RG" -n "$OPSLAG" --query "[0].value" -o tsv | tr -d '\r')
pad="$bestand"; command -v wslpath >/dev/null && az --version 2>/dev/null | grep -qi "windows\|Program Files" && pad=$(wslpath -w "$bestand") || true
az storage blob upload --account-name "$OPSLAG" --account-key "$sleutel" --container-name import --name "$TENANT/gebruikers.json" --file "$pad" --overwrite --output none

uitvoering=$(az containerapp job start -g "$RG" -n "$JOB" --query name -o tsv | tr -d '\r')
echo "job gestart: $uitvoering"
for _ in $(seq 1 40); do
  status=$(az containerapp job execution show -g "$RG" -n "$JOB" --job-execution-name "$uitvoering" --query properties.status -o tsv | tr -d '\r')
  case "$status" in Succeeded|Failed|Stopped|Degraded) break ;; esac
  sleep 8
done
echo "status: $status"
[[ "$status" == "Succeeded" ]] || { echo "Mislukt. Staat dev aan (infra/scripts/dev-aan.sh)?" >&2; exit 1; }
echo "Gebruiker toegevoegd of bijgewerkt voor kantoor '$TENANT'."
