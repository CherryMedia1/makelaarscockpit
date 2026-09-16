// PostgreSQL Flexible Server 16 (Burstable B2s) met alleen Entra-authenticatie; in dev publiek bereikbaar via een firewallregel voor het NAT-IP
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Vast uitgaand IP van de NAT Gateway; de enige toegestane bron in de firewall.')
param natPublicIp string

@description('Principal-id van de managed identity; wordt Entra-beheerder zodat API en Functions kunnen inloggen.')
param identityPrincipalId string

@description('Naam van de managed identity (wordt de principalName in Postgres).')
param identityName string

@description('Object-id van de menselijke beheerder (Entra-beheerder op de server). Leeg = geen menselijke beheerder.')
param adminObjectId string = ''

@description('UPN van de menselijke beheerder; hoort bij adminObjectId.')
param adminPrincipalName string = ''

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: 'psql-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    createMode: 'Default'
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: subscription().tenantId
    }
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource allowNatGateway 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2025-08-01' = {
  parent: postgres
  name: 'allow-nat-gateway'
  properties: {
    startIpAddress: natPublicIp
    endIpAddress: natPublicIp
  }
}

// Entra-beheerders na elkaar aanmaken: de server accepteert maar één beheerdersbewerking tegelijk.
resource identityAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2025-08-01' = {
  parent: postgres
  name: identityPrincipalId
  properties: {
    principalName: identityName
    principalType: 'ServicePrincipal'
    tenantId: subscription().tenantId
  }
  dependsOn: [
    allowNatGateway
  ]
}

resource humanAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2025-08-01' = if (!empty(adminObjectId)) {
  parent: postgres
  name: adminObjectId
  properties: {
    principalName: adminPrincipalName
    principalType: 'User'
    tenantId: subscription().tenantId
  }
  dependsOn: [
    identityAdmin
  ]
}

output postgresName string = postgres.name
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
