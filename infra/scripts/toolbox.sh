#!/usr/bin/env bash
# Opent een shell in de toolbox-container (uitgaand via het vaste NAT-IP). Schaalt op naar 1 replica en na afloop terug naar 0.
# In de shell: `rw dev /wonen/v3/objecten` doet een Realworks-call met het token uit Key Vault.
set -euo pipefail
RG="rg-cockpit-dev-neu"; APP="ca-toolbox-cockpit-dev-neu"
sub=$(az account show --query name -o tsv | tr -d '\r')
[[ "$sub" == "cockpit-dev" ]] || { echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'." >&2; exit 1; }
echo "== toolbox opschalen =="
az containerapp update -g "$RG" -n "$APP" --min-replicas 1 --output none
for i in $(seq 1 30); do
  st=$(az containerapp replica list -g "$RG" -n "$APP" --query "[0].properties.runningState" -o tsv 2>/dev/null | tr -d '\r' || true)
  [[ "$st" == "Running" ]] && break; sleep 5
done
echo "replica: ${st:-onbekend}"
echo "== shell (typ 'exit' om te stoppen) =="
az containerapp exec -g "$RG" -n "$APP" --command bash || true
echo "== toolbox terugschalen naar 0 =="
az containerapp update -g "$RG" -n "$APP" --min-replicas 0 --output none && echo "klaar"
