// E-maildienst voor inloglinks: Azure Communication Services met een door Azure beheerd afzenderdomein, data in Europa
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param tags object = {}

@description('Principal-id van de managed identity die e-mail mag versturen.')
param identityPrincipalId string

var emailOwnerRoleId = '09976791-48a7-449e-bb21-39d1a415f350'

resource emailService 'Microsoft.Communication/emailServices@2025-09-01' = {
  name: 'email-cockpit-${env}-${regionShort}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Europe'
  }
}

resource domein 'Microsoft.Communication/emailServices/domains@2025-09-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource communicatie 'Microsoft.Communication/communicationServices@2025-09-01' = {
  name: 'acs-cockpit-${env}-${regionShort}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Europe'
    linkedDomains: [
      domein.id
    ]
  }
}

resource identityMagMailen 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(communicatie.id, identityPrincipalId, emailOwnerRoleId)
  scope: communicatie
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', emailOwnerRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output endpoint string = 'https://${communicatie.properties.hostName}'
output afzender string = 'DoNotReply@${domein.properties.mailFromSenderDomain}'
