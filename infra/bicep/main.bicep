// Koppelt alle modules tot één omgeving (dev/test/prod) in resourcegroep rg-cockpit-{env}-{regionShort}
targetScope = 'resourceGroup'

@description('Omgeving: dev, test of prod. Komt terug in alle resourcenamen.')
@allowed(['dev', 'test', 'prod'])
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'

@description('Azure-regio; voor dit project altijd northeurope.')
param location string = resourceGroup().location

@description('Resource-id van de gedeelde Log Analytics-werkruimte uit shared.bicep.')
param logAnalyticsWorkspaceId string = resourceId('rg-cockpit-shared-${regionShort}', 'Microsoft.OperationalInsights/workspaces', 'log-cockpit-${regionShort}')

@description('Object-id van de menselijke beheerder: Entra-beheerder op Postgres en Key Vault Secrets Officer. Leeg = geen menselijke beheerder.')
param adminObjectId string = ''

@description('UPN (e-mailadres) van de menselijke beheerder; hoort bij adminObjectId.')
param adminPrincipalName string = ''

@description('Maak de NAT Gateway aan (uurkosten). Op false blijft het vaste publieke IP bestaan, maar loopt uitgaand verkeer niet via dat adres. Zet op true zodra Functions of API in Azure Realworks aanroepen.')
param natGatewayEnabled bool = true

@description('Tags voor alle resources.')
param tags object = {
  project: 'makelaarscockpit'
  env: env
}

module identity 'modules/identity.bicep' = {
  name: '${env}-identity'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
  }
}

module network 'modules/network.bicep' = {
  name: '${env}-network'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    natGatewayEnabled: natGatewayEnabled
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: '${env}-monitoring'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalyticsWorkspaceId
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: '${env}-keyvault'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
    adminObjectId: adminObjectId
  }
}

module storage 'modules/storage.bicep' = {
  name: '${env}-storage'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module serviceBus 'modules/servicebus.bicep' = {
  name: '${env}-servicebus'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module postgres 'modules/postgres.bicep' = {
  name: '${env}-postgres'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    natPublicIp: network.outputs.natPublicIp
    identityPrincipalId: identity.outputs.principalId
    identityName: identity.outputs.identityName
    adminObjectId: adminObjectId
    adminPrincipalName: adminPrincipalName
  }
}

module containerAppsEnv 'modules/containerapps-env.bicep' = {
  name: '${env}-containerapps-env'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    subnetId: network.outputs.appsSubnetId
    logAnalyticsWorkspaceId: logAnalyticsWorkspaceId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

module functions 'modules/functions.bicep' = {
  name: '${env}-functions'
  params: {
    env: env
    regionShort: regionShort
    location: location
    tags: tags
    subnetId: network.outputs.functionsSubnetId
    storageAccountName: storage.outputs.storageAccountName
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.clientId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

@description('Vast uitgaand IP-adres; dit adres whitelist je bij Realworks (stap 2.8 en 4.3).')
output natPublicIp string = network.outputs.natPublicIp
output keyVaultName string = keyVault.outputs.keyVaultName
output storageAccountName string = storage.outputs.storageAccountName
output serviceBusNamespace string = serviceBus.outputs.serviceBusNamespace
output postgresFqdn string = postgres.outputs.postgresFqdn
output containerAppsEnvironmentId string = containerAppsEnv.outputs.containerAppsEnvironmentId
output functionAppHostName string = functions.outputs.functionAppHostName
output identityClientId string = identity.outputs.clientId
