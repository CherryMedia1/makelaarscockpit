// User-assigned managed identity: de identiteit van API en Functions richting Key Vault, Storage, Service Bus en Postgres
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
}

output identityId string = identity.id
output identityName string = identity.name
output principalId string = identity.properties.principalId
output clientId string = identity.properties.clientId
