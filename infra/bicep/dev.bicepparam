// Parameters voor de dev-omgeving (rg-cockpit-dev-neu)
using './main.bicep'

param env = 'dev'
param location = 'northeurope'
param regionShort = 'neu'

// De NAT Gateway kost ongeveer € 28 per maand zolang hij bestaat. In week 1 en 2 draait er nog niets in Azure
// dat Realworks aanroept; zet op true zodra Functions of API in Azure draaien. Het publieke IP blijft altijd bestaan.
param natGatewayEnabled = true

// Ontwikkel-VM (docs/handleiding-dev-vm.md). Zet devVmEnabled én natGatewayEnabled op true en plak je openbare SSH-sleutel.
param devVmEnabled = false
param devVmAdminUsername = 'tim'
param devVmSshPublicKey = ''
param devVmSize = 'Standard_D2as_v5'

// Toolbox-container (docs/handleiding-toolbox-container.md): shell vanaf het vaste IP, standaard 0 replica's.
param toolboxEnabled = true

// Intake-module (ADR-013, ADR-014): Foundry in Sweden Central. Kosten per token; zonder gebruik vrijwel nul.
param intakeEnabled = true
// De rol Cognitive Services User op Foundry is in dev handmatig in de portal toegewezen (handleiding-intake-azure.md, route B);
// een tweede toewijzing door Bicep faalt met RoleAssignmentExists. Wil je hem toch door Bicep laten beheren: verwijder de
// handmatige toewijzing in de portal en zet dit op false.
param foundryRolHandmatig = true

// Menselijke beheerder in dev: Entra-beheerder op Postgres en Key Vault Secrets Officer.
// Zet beide op '' als je dat niet wilt; de apps werken via de managed identity.
param adminObjectId = '5ea0a0fb-3469-4a13-b138-fff365379ce7'
param adminPrincipalName = 'Tim@cherrymedia.nl'
