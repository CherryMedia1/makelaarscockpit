# Runbook: GitHub Actions naar Azure via OIDC

Bijgewerkt: 2026-09-16. Geen van deze waarden is geheim; het zijn identificatienummers.

## App-registratie github-cockpit-dev (stap 3.1)

| Wat | Waarde |
|---|---|
| Display name | `github-cockpit-dev` |
| Application (client) ID = `AZURE_CLIENT_ID` | `6e637a59-2fec-4d37-a63e-23496497ac92` |
| Service principal object-id | `3901ac34-a0f2-4e58-ba7e-6a924f45abdc` |
| `AZURE_TENANT_ID` | `d7d84db3-a6b9-492e-b12c-a4e3e7bf3d27` |
| `AZURE_SUBSCRIPTION_ID` (cockpit-dev) | `3cd2db41-5e0d-4d87-b029-df0fdefabc3d` |

Rollen: Contributor op `rg-cockpit-dev-neu` en `rg-cockpit-shared-neu`, User Access Administrator op `rg-cockpit-dev-neu`
(nodig omdat Bicep rolopdrachten maakt).

## Federated credential (stap 3.2)

GitHub presenteert het subject inclusief account- en repo-id, en dat moet exact overeenkomen:

| Naam | Subject |
|---|---|
| `github-cockpit-dev-main` | `repo:CherryMedia1@283943421/makelaarscockpit@1372678128:environment:dev` |

De klassieke vorm uit de handleiding (`repo:CherryMedia1/makelaarscockpit:environment:dev`) werkte niet (AADSTS700213).

Faalt de login met AADSTS700213, kijk dan in de log van azure/login naar "subject claim" en maak een credential met precies die waarde.
Verhuist de repo naar een organisatie, dan veranderen owner en id en moet de credential opnieuw.

## GitHub (stap 3.3)

Settings → Environments → `dev`. Settings → Secrets and variables → Actions → Variables:
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` met de waarden hierboven.
