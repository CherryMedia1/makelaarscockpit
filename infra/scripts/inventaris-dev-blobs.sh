#!/usr/bin/env bash
# Inventarisatie van de blob-opslag in dev (issue #39): per container het aantal blobs, de totale grootte en de oudste en
# nieuwste wijzigingsdatum. Alleen lezen. Er worden geen bestandsnamen of inhoud getoond of opgeslagen (harde regel 2).
# Gebruik (Cloud Shell, als jezelf): bash infra/scripts/inventaris-dev-blobs.sh
# Vereist tijdelijk de rol Storage Blob Data Reader op het storage-account; toewijzen en intrekken staat in README.md.
set -euo pipefail

RG="rg-cockpit-dev-neu"; OPSLAG="stcockpitdevneu"

sub=$(az account show --query name -o tsv | tr -d '\r')
[[ "$sub" == "cockpit-dev" ]] || { echo "Actieve subscription is '$sub', verwacht 'cockpit-dev'." >&2; exit 1; }

# Containernamen via ARM (geen datarol nodig); de namen bevatten geen persoonsgegevens.
containers=$(az storage container-rm list -g "$RG" --storage-account "$OPSLAG" --query "[].name" -o tsv | tr -d '\r')

printf "%-34s %8s %12s %-20s %-20s %s\n" "container" "blobs" "grootte_MB" "oudste" "nieuwste" "soft-deleted"
for c in $containers; do
  # Per blob alleen grootte, wijzigingsdatum en of hij soft-deleted is; de naam wordt niet opgevraagd.
  az storage blob list --auth-mode login --account-name "$OPSLAG" --container-name "$c" --include d --num-results '*' \
      --query "[].[properties.contentLength, properties.lastModified, deleted]" -o tsv \
    | tr -d '\r' \
    | awk -v c="$c" -F'\t' '
        tolower($3) == "true" { weg += 1; next }
        {
          n += 1; bytes += $1
          d = substr($2, 1, 19)
          if (oud == "" || d < oud) oud = d
          if (d > nieuw) nieuw = d
        }
        END { printf "%-34s %8d %12.1f %-20s %-20s %d\n", c, n, bytes / 1048576, (oud == "" ? "-" : oud), (nieuw == "" ? "-" : nieuw), weg }
      '
done
