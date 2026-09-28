// Toolbox-container (Azure CLI + curl) in de Container Apps Environment: shell vanaf het vaste NAT-IP, standaard 0 replica's
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Resource-id van de Container Apps Environment.')
param containerAppsEnvironmentId string

@description('Resource-id van de managed identity (leest tokens uit Key Vault).')
param identityId string

@description('Client-id van de managed identity, voor `az login --identity` in de container.')
param identityClientId string

@description('Naam van de Key Vault met de Realworks-tokens.')
param keyVaultName string

resource toolbox 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'ca-toolbox-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'toolbox'
          image: 'mcr.microsoft.com/azure-cli:latest'
          command: [
            '/bin/sh'
            '-c'
            'echo "$TOOLBOX_RW" | base64 -d > /usr/local/bin/rw && chmod +x /usr/local/bin/rw && sleep infinity'
          ]
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: identityClientId
            }
            {
              name: 'KEY_VAULT_NAME'
              value: keyVaultName
            }
            {
              name: 'TOOLBOX_RW'
              value: base64(loadTextContent('../../scripts/toolbox-rw.sh'))
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output toolboxName string = toolbox.name
