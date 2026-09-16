// Container Apps Environment (workload profiles, Consumption) in snet-apps; logs naar Log Analytics, Dapr-telemetrie naar App Insights
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Subnet snet-apps (gedelegeerd aan Microsoft.App/environments) waarin de omgeving landt.')
param subnetId string

@description('Resource-id van de gedeelde Log Analytics-werkruimte voor console- en systeemlogs.')
param logAnalyticsWorkspaceId string

@description('Connection string van App Insights; de API-container krijgt dezelfde string in week 2 als omgevingsvariabele.')
@secure()
param appInsightsConnectionString string

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: 'cae-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
    daprAIConnectionString: appInsightsConnectionString
    vnetConfiguration: {
      infrastructureSubnetId: subnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'log-analytics'
  scope: containerAppsEnv
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
  }
}

output containerAppsEnvironmentId string = containerAppsEnv.id
output containerAppsEnvironmentName string = containerAppsEnv.name
output defaultDomain string = containerAppsEnv.properties.defaultDomain
