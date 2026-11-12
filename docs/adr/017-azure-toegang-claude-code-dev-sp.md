# ADR-017 Azure-toegang voor Claude Code via dev-service principal
Datum: 2026-11-12 · Status: geaccepteerd (Tim, 2026-11-12, issue #36)
## Context
We werken in GitHub Codespaces, en Claude Code draait daarin. Inloggen bij Azure lukt daar niet: de security defaults van de tenant blokkeren de device-code-flow (AADSTS530035), en de browserflow vraagt elke keer handwerk. Voor beheer van dev (status bekijken, revisies herstarten, de database aan of uit zetten) is een automatische, beperkte login nodig.

Er is een service principal `sp-cockpit-dev-claudecode` met een certificaat. Bij het ontwerp speelden drie feiten:
- **Dev bevat echte klantdata.** Er is nog geen prod-omgeving; de pilot met C&R draait in dev. De database bevat tenant `cr` met relaties, objecten en agenda uit Realworks, en de blobcontainers `raw-realworks` en `intake` bevatten ruwe antwoorden en transcripten.
- **Contributor op de resourcegroep geeft toegang tot die data**, ook zonder datarol. Met `listKeys` op storage zijn alle blobs te lezen. Met `containerApps exec` (en via `containerApps/write` het commando van een app wijzigen) gebruik je de managed identity, en daarmee Key Vault en de Realworks-tokens. Via `flexibleServers/write` kun je de beheerder of het wachtwoord van Postgres resetten. Met `vaults/write` zet je RBAC op Key Vault uit en geef je jezelf een access policy.
- De repo is publiek.

Harde regels uit CLAUDE.md die hier spelen:
- **Regel 3:** secrets alleen uit Key Vault via managed identity; nooit GitHub Secrets voor runtime.
- **Regel 6:** nooit `az deployment` of `az … delete` richting prod; dev mag.
## Beslissing
1. **Claude Code logt in als `sp-cockpit-dev-claudecode`.** Het certificaat (PEM met sleutel, base64) staat als Codespaces-gebruikerssecret `AZURE_SP_CERT_B64`, alleen voor deze repo. `.devcontainer/azure-login.sh` draait bij elke start (`postStartCommand`). Het script schrijft het certificaat naar `~/.azure-sp/` (map 700, bestand 600, buiten `/workspaces`), logt idempotent in op `cockpit-dev` en print nooit het certificaat, de base64-waarde of tokens. appId en tenant staan in `containerEnv`; die zijn niet geheim. Bewust niet onder de namen `AZURE_CLIENT_ID` of `AZURE_TENANT_ID`, zodat de Azure SDK in lokale code ze niet ongemerkt oppikt.
2. **Een eigen rol `cockpit-dev-operator`, geen Contributor**, omdat dev echte klantdata bevat. De definitie staat in `infra/rbac/cockpit-dev-operator.json`, met als enige scope `rg-cockpit-dev-neu`. De rol bevat:
   - `*/read`;
   - revisies van container apps activeren, deactiveren en herstarten;
   - Postgres flexible server starten en stoppen.

   Niet in de rol: schrijven of deployen, `listKeys` en het opvragen van secrets, `exec`, jobs starten (dat verwerkt echte data), en logs lezen. De Log Analytics-werkruimte `log-cockpit-neu` staat in `rg-cockpit-shared-neu` en is bedoeld voor alle omgevingen; ook het lezen van logs via de dev-resources sluiten we uit (`NotActions`). Contributor wordt pas ingetrokken nadat de rol is toegewezen en gecontroleerd (runbook).
3. **RBAC is de grens; deny-regels zijn een vangrail.** `.claude/settings.json` weigert `az deployment …`, `az … delete …` en elke aanroep van `dev-aan.sh` of `dev-uit.sh`. Die regels matchen alleen de tekst van een commando; de rol bepaalt wat werkelijk kan.
4. **Werk dat meer rechten vraagt, doet Tim zelf** vanuit Azure Cloud Shell: `dev-aan.sh`, `dev-uit.sh`, `toolbox.sh`, rolbeheer en certificaatbeheer. Een workflow in GitHub Actions met OIDC moet dev-aan en dev-uit later overnemen (#38).
5. **Het certificaat geldt één jaar** en wordt vernieuwd met `az ad app credential reset --create-cert` vanuit Cloud Shell, rechtstreeks naar het Codespaces-secret. Er is altijd precies één certificaat (runbook `docs/runbooks/azure-sp-claudecode.md`).
## Gevolgen
- **Regel 3:** een Codespaces-secret is een GitHub-secret. Dit is ontwikkeltooling, geen runtime, en valt daarom niet onder het verbod. Het is een afgebakende uitzondering: één certificaat, één service principal, leesrechten op dev. Runtime blijft Key Vault met managed identity. Een tweede geval van een GitHub-secret buiten runtime vraagt een eigen ADR.
- **Regel 6:** de service principal heeft geen rechten buiten `rg-cockpit-dev-neu` en kan ook in dev niet deployen of verwijderen. Daarmee wordt de regel strenger toegepast dan hij luidt.
- **Ook Tims eigen `az` in de Codespace draait als deze service principal.** Voor dev-aan, dev-uit en de toolbox is dat Cloud Shell, tot de workflow er is.
- **Met de rol kan de service principal geen klantdata lezen.** Wel ziet hij configuratie, zoals namen, instellingen en omgevingsvariabelen van container apps die geen secretRef zijn. Die mogen volgens de regels geen geheimen of persoonsgegevens bevatten.
- **Zodra dev geen echte klantdata meer bevat** (bijvoorbeeld na een aparte prod-omgeving), kan de rol ruimer. Dat vraagt een nieuwe ADR; Contributor wordt het niet zonder herziening van de punten hierboven.
- **Storage accepteert nog sleutels** (`allowSharedKeyAccess` staat aan). Met deze rol kan de service principal ze niet opvragen, maar uitzetten blijft verstandig (#37).
- appId, tenant en abonnement staan in een publieke repo. Dat zijn identificatienummers; zonder certificaat geven ze geen toegang.
- Wijzigingen in `.claude/settings.json` gelden pas in een nieuwe Claude Code-sessie.
