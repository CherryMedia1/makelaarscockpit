// Service Bus (Standard) met topics realworks-events, workflow-commands en document-jobs, queues intake-verwerking en intake-tekst; de managed identity krijgt Data Owner
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Principal-id van de managed identity die berichten mag versturen en ontvangen.')
param identityPrincipalId string

var topicNames = [
  'realworks-events'
  'workflow-commands'
  'document-jobs'
]

var serviceBusDataOwnerRoleId = '090c5cfd-751d-490a-894a-3ce6f1109419'

resource serviceBus 'Microsoft.ServiceBus/namespaces@2026-01-01' = {
  name: 'sb-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource topics 'Microsoft.ServiceBus/namespaces/topics@2026-01-01' = [
  for name in topicNames: {
    parent: serviceBus
    name: name
    properties: {
      defaultMessageTimeToLive: 'P14D'
    }
  }
]

// Queue voor de verwerking van intakebronnen (ADR-013); berichten bevatten alleen id's.
resource intakeQueue 'Microsoft.ServiceBus/namespaces/queues@2026-01-01' = {
  parent: serviceBus
  name: 'intake-verwerking'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
  }
}

// Queue voor het schrijven van woningteksten (ADR-016); berichten bevatten alleen id's en eventueel een sectiesleutel.
resource tekstQueue 'Microsoft.ServiceBus/namespaces/queues@2026-01-01' = {
  parent: serviceBus
  name: 'intake-tekst'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    defaultMessageTimeToLive: 'P1D'
    deadLetteringOnMessageExpiration: true
  }
}

resource identityDataOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, identityPrincipalId, serviceBusDataOwnerRoleId)
  scope: serviceBus
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', serviceBusDataOwnerRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output serviceBusNamespace string = serviceBus.name
output serviceBusEndpoint string = serviceBus.properties.serviceBusEndpoint
