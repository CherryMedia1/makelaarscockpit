# ADR-018 Rechten van de GitHub Actions-SP in dev
Datum: 2026-11-12 · Status: voorgesteld (issue #41)
## Context
De workflows `deploy-dev` en `deploy-apps-dev` loggen via OIDC in als de service principal `github-cockpit-dev` (runbook `docs/runbooks/github-actions-oidc.md`). Die heeft op `rg-cockpit-dev-neu` twee rollen, beide zonder conditie: Contributor en User Access Administrator. De tweede is er omdat `main.bicep` rolopdrachten maakt voor de managed identity en de beheerder.

Drie feiten maken dat te ruim:
- **Dev bevat echte klantdata** (ADR-017, `docs/inventarisatie-klantdata-dev.md`).
- **User Access Administrator zonder conditie mag elke rol aan elke principal geven.** Een workflow kan zichzelf of een ander daarmee Owner of een datarol geven, zoals Storage Blob Data Owner of Key Vault Secrets Officer.
- **De repo is publiek** en het federated credential bindt aan de GitHub-environment `dev`, niet aan een branch. Tot 2026-11-12 had die environment geen beperkingen.

Bicep wijst in dev acht rollen toe, aan twee principals:

| Rol | Aan | Bron |
|---|---|---|
| Storage Blob Data Owner, Storage Queue Data Contributor, Storage Table Data Contributor | managed identity | `modules/storage.bicep` |
| Key Vault Secrets User | managed identity | `modules/keyvault.bicep` |
| Key Vault Secrets Officer | beheerder | `modules/keyvault.bicep` |
| Azure Service Bus Data Owner | managed identity | `modules/servicebus.bicep` |
| Communication and Email Service Owner | managed identity | `modules/communication.bicep` |
| Cognitive Services User | managed identity | `modules/foundry.bicep` (in dev uit via `foundryRolHandmatig`) |

AcrPull in `shared.bicep` valt hierbuiten: die staat in `rg-cockpit-shared-neu` en wordt niet door een workflow gedeployed.
## Beslissing
1. **User Access Administrator wordt vervangen door Role Based Access Control Administrator met een conditie.** De conditie staat het toewijzen en verwijderen van rolopdrachten alleen toe voor de acht rollen hierboven, en alleen aan de managed identity `id-cockpit-dev-neu` en de beheerder.
2. **De conditie beperkt op rol én op principal.** Alleen op rol beperken is niet genoeg: dan kan de service principal zichzelf een datarol geven.
3. **De conditie staat als bestand in de repo**: `infra/rbac/github-cockpit-dev-rbac-conditie.txt`. Een wijziging is daarmee zichtbaar in review. Het bestand is de bron; de toewijzing in Azure volgt het bestand.
4. **Tim voert de wijziging uit in Cloud Shell** volgens het runbook, in de volgorde: nieuwe rol toewijzen, conditie teruglezen, oude rol intrekken, `deploy-dev` draaien als positieve test.
5. **De GitHub-environment `dev` laat alleen deploys vanaf `main` toe en vraagt goedkeuring** van een reviewer (ingesteld door Tim op 2026-11-12). Dat hoort bij deze beslissing: het bepaalt wie het OIDC-token kan krijgen.
6. **Contributor blijft voorlopig.** De workflows hebben het nodig om te deployen. Wat Contributor aan data ontsluit, staat in ADR-017; dat wordt kleiner met #37 (storage-sleutels uit) en met de keuze over echte data in dev (#39).
## Gevolgen
- **Een nieuwe rolopdracht in Bicep vraagt eerst een aanpassing van de conditie.** Anders faalt `deploy-dev` met `AuthorizationFailed` op `Microsoft.Authorization/roleAssignments/write`. De volgorde staat in het runbook: bestand aanpassen in de PR, conditie bijwerken in Cloud Shell, dan mergen.
- **De conditie bevat object-id's.** Wordt de managed identity opnieuw aangemaakt of wisselt de beheerder, dan veranderen die en moet de conditie mee.
- **De service principal kan zichzelf geen rollen meer geven** en geen rollen buiten de lijst toewijzen. Hij kan de acht rollen wel opnieuw toewijzen aan en verwijderen van de twee genoemde principals; dat is wat Bicep doet.
- **Een handmatige `deploy-dev` wacht op goedkeuring.** Ook een run via `workflow_dispatch` start pas nadat de reviewer hem in GitHub heeft goedgekeurd.
- **Niet opgelost:** met Contributor kan de service principal nog storage-sleutels opvragen en container apps wijzigen, en zo indirect bij data (ADR-017). Dit besluit sluit alleen de route via rolopdrachten.
- **Harde regels:** dit raakt regel 3 niet (geen secrets; OIDC blijft) en blijft binnen regel 6 (alleen dev). Een prod-omgeving krijgt een eigen service principal met een eigen conditie.
- De conditie is geschreven volgens de voorbeelden van Microsoft ("Constrain roles and specific principals") en niet in Azure getest: de dev-service principal mag geen rollen toewijzen. De eerste test is de uitvoering van het runbook.
