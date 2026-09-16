// VNet met subnets voor Container Apps, Functions en data, plus één vast uitgaand IP via NAT Gateway (voor Realworks-whitelisting)
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Maak de NAT Gateway aan en koppel hem aan snet-apps en snet-functions. Op false blijft het publieke IP bestaan (het adres verandert niet), maar vervallen de uurkosten van de gateway.')
param natGatewayEnabled bool = true

resource pip 'Microsoft.Network/publicIPAddresses@2025-09-01' = {
  name: 'pip-nat-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

resource nat 'Microsoft.Network/natGateways@2025-09-01' = if (natGatewayEnabled) {
  name: 'nat-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    idleTimeoutInMinutes: 4
    publicIpAddresses: [
      {
        id: pip.id
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2025-09-01' = {
  name: 'vnet-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.10.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-apps'
        properties: {
          addressPrefix: '10.10.1.0/24'
          natGateway: natGatewayEnabled ? { id: nat.id } : null
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-functions'
        properties: {
          addressPrefix: '10.10.2.0/24'
          natGateway: natGatewayEnabled ? { id: nat.id } : null
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-data'
        properties: {
          addressPrefix: '10.10.3.0/24'
        }
      }
    ]
  }
}

output natPublicIp string = pip.properties.ipAddress
output vnetId string = vnet.id
output appsSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-apps')
output functionsSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-functions')
output dataSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-data')
