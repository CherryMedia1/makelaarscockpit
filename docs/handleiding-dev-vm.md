# Handleiding: ontwikkel-VM in Azure (werken vanaf het vaste IP)

Doel: alles wat je richting Realworks doet, komt van het vaste adres 134.149.33.214, ongeacht waar je laptop staat. Je werkt via VS Code Remote-SSH op een kleine Linux-VM in het VNet van dev; Claude Code draait op die VM. Je laptop is dan alleen nog een scherm.

De bestanden staan al klaar: `infra/bicep/modules/devvm.bicep` (VM, netwerkkaart, publiek IP voor SSH, NSG met alleen poort 22), schakelaars in `infra/bicep/dev.bicepparam`, `infra/scripts/devvm-setup.sh` (eenmalige inrichting op de VM) en aanpassingen in `dev-uit.sh` / `dev-aan.sh` (VM mee uit en aan).

Kosten als alles aan staat: VM ongeveer € 60 per maand (D2as_v5, 2 vCPU, 8 GiB; goedkopere B-maten weigert Azure voor deze subscription), publiek IP € 3, NAT Gateway € 28. Met `dev-uit.sh` blijft daar ongeveer € 3 (schijf) plus het IP van over, dus dealloceer de VM als je niet werkt.

---

> **Stand op 2026-09-28: nog niet uitvoerbaar.** Voor subscription cockpit-dev is in North Europe via de Azure-preflight elke VM-maat getest: B-serie (B1ms, B2s, B2ms, B4ms), B2als_v2, D2as_v5, D2s_v5, D2als_v7, D2as_v7, D2ls_v6 en DC2as_v6. Uitkomst: families mét quotum (BS, Dasv7, Dalsv7, Dlsv6: 10 vCPU) krijgen "SkuNotAvailable, Capacity Restrictions"; families zonder restrictie (Dasv5, Dsv5, Basv2, DCasv6) hebben quotum 0 en de automatische verhoging antwoordt "ContactSupport". Een quota-ticket vereist bovendien een supportplan. Tot dit is opgelost: gebruik de toolbox-container (optie B, `docs/handleiding-toolbox-container.md`) om vanaf het vaste IP te werken. Deze handleiding blijft geldig zodra Azure een VM-maat toestaat; controleer dat met de what-if uit stap 4.

## Stap 1 – vCPU-quota aanvragen (eenmalig, eerst doen)

Gecontroleerd op 2026-09-28 voor subscription cockpit-dev in North Europe:

| Familie | Maten | Situatie |
|---|---|---|
| standardBSFamily (B1ms, B2s, B2ms, B4ms) | goedkoopst | quotum 10, maar **capaciteitsrestrictie**: Azure weigert elke maat ("SkuNotAvailable") |
| standardBasv2Family (B2als_v2) | goedkoop | quotum 0, automatische verhoging geweigerd ("ContactSupport") |
| standardDASv5Family (D2as_v5, 2 vCPU, 8 GiB) | ± € 60 per maand aan, € 0 gedealloceerd | quotum 0, alleen quotumfout: **dit aanvragen** |

De VM-maat staat daarom op `Standard_D2as_v5` (`devVmSize` in `infra/bicep/dev.bicepparam`). Omdat je de VM met `dev-uit.sh` dealloceert als je niet werkt, betaal je alleen de uren dat hij aan staat (€ 0,08 per uur).

1. Portal → "Help + support" → "Create a support request".
2. Issue type: **Service and subscription limits (quotas)**. Subscription: cockpit-dev. Quota type: **Compute-VM (cores-vCPUs) subscription limit increases**.
3. "Enter details" → Deployment model Resource Manager → regio **North Europe** → familie **Standard DASv5 Family vCPUs** → nieuwe limiet **4**. Het regionale totaal (Total Regional vCPUs) staat al op 4.
4. Severity C (minimal), contact per e-mail. Verzenden. Doorlooptijd meestal enkele uren tot een werkdag.

Controle zodra het ticket is afgehandeld:
```
az vm list-usage -l northeurope --query "[?name.value=='standardDASv5Family' || name.value=='cores'].{familie:name.value, limiet:limit}" -o table
```
Beide limieten moeten 4 tonen. Daarna kun je verder met stap 2.

## Stap 2 – SSH-sleutel maken

Op je laptop (WSL of PowerShell), één keer:
```
ssh-keygen -t ed25519 -C "tim-laptop" -f ~/.ssh/id_ed25519
```
Enter voor geen wachtwoordzin, of kies er een (dan vraagt VS Code die bij verbinden). Toon de **openbare** sleutel:
```
cat ~/.ssh/id_ed25519.pub
```
Dat is één regel die begint met `ssh-ed25519`. Die mag in git; de privésleutel (zonder `.pub`) nooit.

## Stap 3 – Schakelaars aanzetten

Open `infra/bicep/dev.bicepparam` en zet:
```
param natGatewayEnabled = true
param devVmEnabled = true
param devVmAdminUsername = 'tim'
param devVmSshPublicKey = 'ssh-ed25519 AAAA... tim-laptop'
```
De NAT Gateway moet aan, anders gaat de VM niet via 134.149.33.214 naar buiten.

## Stap 4 – Deployen

```
az deployment group what-if -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
az deployment group create  -g rg-cockpit-dev-neu -f infra/bicep/main.bicep -p infra/bicep/dev.bicepparam
```
De what-if moet "+ Create" tonen voor de NAT Gateway, het VM-IP, de NSG, de netwerkkaart en de VM. De deploy duurt 3 tot 5 minuten. Het SSH-commando staat in de uitvoer bij `devVmSshCommand`, of:
```
az deployment group show -g rg-cockpit-dev-neu -n main --query properties.outputs.devVmSshCommand.value -o tsv
```
Foutmelding met "QuotaExceeded": stap 1 is nog niet verwerkt. "SkuNotAvailable": die maat weigert Azure voor deze subscription; kies een andere in `devVmSize`.

## Stap 5 – Eerste keer inloggen en inrichten

```
ssh tim@<ip-uit-stap-4>
```
Bevestig de host-fingerprint met "yes". Op de VM:
```
curl -s https://api.ipify.org; echo
```
Dit moet **134.149.33.214** geven. Zo niet, controleer of `natGatewayEnabled` op true stond bij de deploy.

Haal het inrichtingsscript op en draai het (10 minuten; installeert Azure CLI, Bicep, Node 22, GitHub CLI, PostgreSQL-client, Docker en Claude Code, en kloont de repo):
```
curl -fsSL https://raw.githubusercontent.com/CherryMedia1/makelaarscockpit/main/infra/scripts/devvm-setup.sh -o setup.sh
bash setup.sh
```
Is de repo privé, dan werkt de curl niet; kopieer het script dan vanaf je laptop:
```
scp infra/scripts/devvm-setup.sh tim@<ip>:~/setup.sh
```
Daarna op de VM, eenmalig:
```
az login --use-device-code          # code invoeren op microsoft.com/devicelogin
az account set --subscription cockpit-dev
gh auth login                       # GitHub, via browser op je laptop
claude                              # Claude Code, eenmalig inloggen
exit                                # en opnieuw inloggen voor de Docker-rechten
```

## Stap 6 – VS Code koppelen

1. Extensie "Remote - SSH" installeren (van Microsoft).
2. Command Palette (F1) → "Remote-SSH: Add New SSH Host" → `ssh tim@<ip>` → opslaan in je `~/.ssh/config`.
3. F1 → "Remote-SSH: Connect to Host" → kies de VM → "Open Folder" → `/home/tim/makelaarscockpit`.
4. Installeer in dat venster de extensies Claude Code, Bicep en GitHub Pull Requests (VS Code vraagt erom; ze draaien op de VM).

Handig in `~/.ssh/config` op je laptop, dan hoef je het IP niet te onthouden:
```
Host cockpit-dev
  HostName <ip>
  User tim
  IdentityFile ~/.ssh/id_ed25519
```
Daarna: `ssh cockpit-dev`.

## Stap 7 – Realworks-whitelist opschonen

In het Realworks-dashboard bij elk token alleen nog `134.149.33.214/32` laten staan en de laptop-adressen verwijderen. Test vanaf de VM:
```
cd ~/makelaarscockpit
infra/scripts/realworks-test.sh cr /wonen/v3/objecten
```

## Dagelijks gebruik

- Stoppen als je klaar bent: `infra/scripts/dev-uit.sh` (dealloceert de VM, stopt Postgres, verwijdert de NAT Gateway). Let op: zonder NAT Gateway gaat de VM niet via het vaste IP naar buiten, dus `dev-aan.sh` is nodig voordat je Realworks aanroept.
- Starten: `infra/scripts/dev-aan.sh` (start de VM en Postgres, deployt de Bicep, wat de NAT Gateway terugzet). Het VM-IP voor SSH blijft hetzelfde.
- De VM heeft de managed identity `id-cockpit-dev-neu`; `az login --identity` geeft daarmee leesrechten op Key Vault zonder je eigen account, handig voor scripts.

## Als iets vastloopt

- "SkuNotAvailable" of "QuotaExceeded" bij de deploy: stap 1.
- "Permission denied (publickey)": de sleutel in dev.bicepparam is niet de `.pub` van de sleutel die ssh gebruikt; controleer met `ssh -v`.
- Uitgaand IP is niet 134.149.33.214: NAT Gateway staat uit of is niet aan snet-data gekoppeld; redeploy met `natGatewayEnabled = true`.
- Realworks 403 "buiten het toegestane IP bereik" vanaf de VM: whitelist bij Realworks controleren (per token).
