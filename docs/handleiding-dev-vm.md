# Handleiding: ontwikkel-VM in Azure (werken vanaf het vaste IP)

Doel: alles wat je richting Realworks doet, komt van het vaste adres 134.149.33.214, ongeacht waar je laptop staat. Je werkt via VS Code Remote-SSH op een kleine Linux-VM in het VNet van dev; Claude Code draait op die VM. Je laptop is dan alleen nog een scherm.

De bestanden staan al klaar: `infra/bicep/modules/devvm.bicep` (VM, netwerkkaart, publiek IP voor SSH, NSG met alleen poort 22), schakelaars in `infra/bicep/dev.bicepparam`, `infra/scripts/devvm-setup.sh` (eenmalige inrichting op de VM) en aanpassingen in `dev-uit.sh` / `dev-aan.sh` (VM mee uit en aan).

Kosten als alles aan staat: VM ongeveer € 25 tot € 30 per maand (B-serie, 2 vCPU, 4 GiB), publiek IP € 3, NAT Gateway € 28. Met `dev-uit.sh` blijft daar ongeveer € 1 (schijf) plus het IP van over.

---

## Stap 1 – vCPU-quota aanvragen via een supportticket (eenmalig, eerst doen)

Nieuwe subscriptions hebben nul vCPU-quota. Voor deze subscription is dat op 2026-09-28 gecontroleerd: de VM-maat B2als_v2 hoort bij de familie **standardBasv2Family**, het quotum staat op **0**, en een automatische verhoging via de quota-API wordt geweigerd met "ContactSupport". Het moet dus via een gratis supportticket.

1. Portal → "Help + support" → "Create a support request".
2. Issue type: **Service and subscription limits (quotas)**. Subscription: cockpit-dev. Quota type: **Compute-VM (cores-vCPUs) subscription limit increases**.
3. "Enter details" → Deployment model Resource Manager → regio **North Europe** → familie **Standard Basv2 Family vCPUs** → nieuwe limiet **4**. Voeg ook **Total Regional vCPUs** toe met **4**.
4. Severity C (minimal), contact per e-mail. Verzenden. Doorlooptijd meestal enkele uren tot een werkdag. Wordt de aanvraag afgewezen omdat de subscription nieuw is, vraag dan om **Standard BS Family vCPUs** (B2s) of **Standard Dasv5 Family vCPUs** (D2as_v5) en pas `vmSize` aan in `infra/bicep/modules/devvm.bicep`.

Controle zodra het ticket is afgehandeld:
```
az vm list-usage -l northeurope --query "[?name.value=='standardBasv2Family' || name.value=='cores'].{familie:name.value, limiet:limit}" -o table
```
Beide limieten moeten 4 (of hoger) tonen. Daarna kun je verder met stap 2.

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
Foutmelding met "SKU" of "quota": stap 1 is nog niet verwerkt.

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
