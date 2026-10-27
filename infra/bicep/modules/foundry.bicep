// Microsoft Foundry (AIServices) in Sweden Central voor de intake-module (ADR-014): modellen en Content Understanding in één resource,
// alleen Data Zone Standard (EU), geen lokale sleutels; de managed identity krijgt Cognitive Services User
param env string

@description('Korte regiocode van de Foundry-regio in de resourcenaam: sdc (Sweden Central).')
param regionShort string = 'sdc'

@description('Regio van de Foundry-resource; Content Understanding is niet beschikbaar in North Europe (ADR-014).')
param location string = 'swedencentral'
param tags object = {}

@description('Principal-id van de managed identity die modellen en Content Understanding aanroept.')
param identityPrincipalId string

@description('Ken de rol Cognitive Services User toe aan de managed identity. Uit als die rol al handmatig is toegewezen (handleiding-intake-azure.md, route B): Azure staat geen tweede toewijzing van dezelfde rol toe.')
param rolToewijzen bool = true

@description('Capaciteit per deployment in duizenden tokens per minuut (quota per subscription en regio).')
param capaciteit object = {
  extractie: 50
  controle: 50
  embedding: 50
}

// Logische namen in de code (ADR-014): wisselen van model is een wijziging hier plus een run van de evaluatieset.
var deployments = [
  {
    naam: 'extractie'
    model: 'gpt-5.4'
    versie: '2026-03-05'
    capaciteit: capaciteit.extractie
  }
  {
    naam: 'controle'
    model: 'gpt-5.4-mini'
    versie: '2026-03-17'
    capaciteit: capaciteit.controle
  }
  {
    // Content Understanding vraagt een embeddingmodel naast het completion-model.
    naam: 'embedding'
    model: 'text-embedding-3-large'
    versie: '1'
    capaciteit: capaciteit.embedding
  }
]

var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'aif-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: 'aif-cockpit-${env}-${regionShort}'
    allowProjectManagement: true
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: 'intake'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Intake'
    description: 'Intake-module: extractie woningprofiel en woningtekst (ADR-013, ADR-014).'
  }
}

// Deployments binnen één account één voor één aanmaken; parallel geeft conflicten.
@batchSize(1)
resource modelDeployments 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = [
  for d in deployments: {
    parent: foundry
    name: d.naam
    sku: {
      name: 'DataZoneStandard'
      capacity: d.capaciteit
    }
    properties: {
      model: {
        format: 'OpenAI'
        name: d.model
        version: d.versie
      }
      versionUpgradeOption: 'NoAutoUpgrade'
    }
  }
]

resource identityUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (rolToewijzen) {
  name: guid(foundry.id, identityPrincipalId, cognitiveServicesUserRoleId)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output foundryName string = foundry.name
output foundryEndpoint string = foundry.properties.endpoint
output projectName string = project.name
