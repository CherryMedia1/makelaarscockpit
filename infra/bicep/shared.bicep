// Gedeelde resources voor alle omgevingen in rg-cockpit-shared-{regionShort}: Container Registry en Log Analytics-werkruimte
targetScope = 'resourceGroup'

@description('Azure-regio; voor dit project altijd northeurope.')
param location string = resourceGroup().location

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'

@description('Tags voor alle resources.')
param tags object = {
  project: 'makelaarscockpit'
  env: 'shared'
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2026-03-01' = {
  name: 'log-cockpit-${regionShort}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: 'crcockpit${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

output logAnalyticsWorkspaceId string = logAnalytics.id
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
