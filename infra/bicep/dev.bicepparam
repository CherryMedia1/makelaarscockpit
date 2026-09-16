// Parameters voor de dev-omgeving (rg-cockpit-dev-neu)
using './main.bicep'

param env = 'dev'
param location = 'northeurope'
param regionShort = 'neu'

// De NAT Gateway kost ongeveer € 28 per maand zolang hij bestaat. In week 1 en 2 draait er nog niets in Azure
// dat Realworks aanroept; zet op true zodra Functions of API in Azure draaien. Het publieke IP blijft altijd bestaan.
param natGatewayEnabled = false

// Menselijke beheerder in dev: Entra-beheerder op Postgres en Key Vault Secrets Officer.
// Zet beide op '' als je dat niet wilt; de apps werken via de managed identity.
param adminObjectId = '5ea0a0fb-3469-4a13-b138-fff365379ce7'
param adminPrincipalName = 'Tim@cherrymedia.nl'
