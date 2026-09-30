# Handleiding: toolbox-container (werken vanaf het vaste IP zonder VM)

Doel: Realworks aanroepen vanaf het vaste adres 134.149.33.214, ook al wisselt het IP van je laptop. Omdat deze subscription geen VM's toestaat (zie `docs/handleiding-dev-vm.md`), gebruiken we een klein containertje in de bestaande Container Apps Environment. Het gaat via de NAT Gateway naar buiten en heeft de managed identity, dus het leest de Realworks-tokens rechtstreeks uit Key Vault.

Kosten: de NAT Gateway moet aan staan (€ 28 per maand). De container staat standaard uit (revisie gedeactiveerd) en kost alleen iets tijdens gebruik (ordegrootte € 0,02 per uur).

## Wat er is

| Onderdeel | Waar |
|---|---|
| Container-app `ca-toolbox-cockpit-dev-neu` | `infra/bicep/modules/toolbox.bicep`, schakelaar `toolboxEnabled` in `dev.bicepparam` |
| Script dat de shell opent | `infra/scripts/toolbox.sh` |
| Hulpcommando `rw` in de container | `infra/scripts/toolbox-rw.sh` (wordt bij het opstarten in de container gezet) |

## Gebruik

1. Zorg dat dev aan staat (`infra/scripts/dev-aan.sh` als je hem had uitgezet).
2. Open de shell:
   ```
   infra/scripts/toolbox.sh
   ```
   Het script start de container (ongeveer een halve minuut), opent een bash-shell en stopt hem na `exit` weer.
3. In de shell, eerste keer per sessie:
   ```
   curl -s https://api.ipify.org; echo          # moet 134.149.33.214 geven
   rw dev /wonen/v3/objecten                    # Realworks-call met het development-token
   rw cr /relaties/v1                           # C&R-token voor Relaties
   ```
   `rw [tenant] [pad] [host]`: tenant `dev` gebruikt `tenant-dev-realworks-token`, tenant `cr` de tokens per API. Het commando logt zelf in met de managed identity.
4. Klaar? `exit`. Het script stopt de container.

## Realworks-whitelist

Bij elk token in het Realworks-dashboard volstaat nu `134.149.33.214/32`. Laptop-adressen kun je verwijderen; die heb je alleen nog nodig als je rechtstreeks vanaf je laptop wilt testen.

## Als iets vastloopt

- `az containerapp exec` vraagt de extensie "containerapp"; de CLI installeert die vanzelf, bevestig met y.
- Replica komt niet op "Running": kijk met `az containerapp logs show -g rg-cockpit-dev-neu -n ca-toolbox-cockpit-dev-neu --tail 50`.
- IP is niet 134.149.33.214: NAT Gateway staat uit (`natGatewayEnabled` in dev.bicepparam) of `dev-uit.sh` heeft hem verwijderd; draai `dev-aan.sh`.
- Realworks 403 "buiten het toegestane IP bereik": het vaste IP staat niet bij dát token op de whitelist.
- Wil je tóch een VM: `docs/handleiding-dev-vm.md`, zodra Azure een VM-maat toestaat.
