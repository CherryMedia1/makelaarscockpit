// Applicatielaag voor één omgeving: de Container Apps met hun images. Los van main.bicep, zodat een infra-deploy nooit een app-versie terugzet.
targetScope = 'resourceGroup'

@description('Omgeving: dev, test of prod.')
@allowed(['dev', 'test', 'prod'])
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'

param location string = resourceGroup().location

@description('Volledige image-naam van het portaal, bv. crcockpitneu.azurecr.io/web:<git-sha>.')
param webImage string

@description('Volledige image-naam van de migratie-job, bv. crcockpitneu.azurecr.io/migratie:<git-sha>.')
param migratieImage string

@description('Volledige image-naam van de jobs (sync, import), bv. crcockpitneu.azurecr.io/jobs:<git-sha>.')
param jobsImage string

@description('Sleutel van de tenant waarvoor het portaal en de jobs draaien, tot de inlog er is (issue #5).')
param tenantSleutel string = 'cr'

@description('Login-server van de gedeelde Container Registry.')
param registryServer string = 'crcockpit${regionShort}.azurecr.io'

@description('Tags voor alle resources.')
param tags object = {
  project: 'makelaarscockpit'
  env: env
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: 'id-cockpit-${env}-${regionShort}'
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2026-01-01' existing = {
  name: 'cae-cockpit-${env}-${regionShort}'
}

resource keyVault 'Microsoft.KeyVault/vaults@2026-02-01' existing = {
  name: 'kv-cockpit-${env}-${regionShort}-01'
}

// Databasetoegang met de managed identity (Postgres is Entra-only); gedeeld door het portaal en de jobs.
var databaseEnv = [
  {
    name: 'PGHOST'
    value: 'psql-cockpit-${env}-${regionShort}.postgres.database.azure.com'
  }
  {
    name: 'PGDATABASE'
    value: 'cockpit'
  }
  {
    name: 'PGUSER'
    value: identity.name
  }
  {
    name: 'AZURE_CLIENT_ID'
    value: identity.properties.clientId
  }
  {
    name: 'TENANT_SLEUTEL'
    value: tenantSleutel
  }
]

var jobsEnv = concat(databaseEnv, [
  {
    name: 'KEY_VAULT_URL'
    value: keyVault.properties.vaultUri
  }
  {
    name: 'STORAGE_ACCOUNT'
    value: 'stcockpit${env}${regionShort}'
  }
])

resource web 'Microsoft.App/containerApps@2026-01-01' = {
  name: 'ca-web-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registryServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          // Tijdelijke afscherming van de pilot tot de inlog er is (issue #5).
          name: 'pilot-wachtwoord'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/pilot-wachtwoord'
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          env: concat(databaseEnv, [
            {
              name: 'PILOT_WACHTWOORD'
              secretRef: 'pilot-wachtwoord'
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        // Schaalt naar nul als niemand het portaal gebruikt; de eerste aanvraag daarna duurt enkele seconden.
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

// Voert de databasemigraties uit vanuit het VNet (Postgres laat alleen het NAT-IP toe) met de managed identity als inlog.
resource migratieJob 'Microsoft.App/jobs@2026-01-01' = {
  name: 'job-migratie-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registryServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migratie'
          image: migratieImage
          env: [
            {
              name: 'PGHOST'
              value: 'psql-cockpit-${env}-${regionShort}.postgres.database.azure.com'
            }
            {
              name: 'PGDATABASE'
              value: 'cockpit'
            }
            {
              name: 'PGUSER'
              value: identity.name
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: identity.properties.clientId
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

// Sync en import als handmatig te starten jobs (ADR-008). Beide gaan via het vaste NAT-IP naar buiten.
var jobs = [
  {
    naam: 'sync'
    commando: 'sync-realworks'
  }
  {
    naam: 'import'
    commando: 'import-verkooplijst'
  }
]

resource taakJobs 'Microsoft.App/jobs@2026-01-01' = [
  for job in jobs: {
    name: 'job-${job.naam}-cockpit-${env}-${regionShort}'
    location: location
    tags: tags
    identity: {
      type: 'UserAssigned'
      userAssignedIdentities: {
        '${identity.id}': {}
      }
    }
    properties: {
      environmentId: containerAppsEnv.id
      workloadProfileName: 'Consumption'
      configuration: {
        triggerType: 'Manual'
        replicaTimeout: 900
        replicaRetryLimit: 0
        manualTriggerConfig: {
          parallelism: 1
          replicaCompletionCount: 1
        }
        registries: [
          {
            server: registryServer
            identity: identity.id
          }
        ]
      }
      template: {
        containers: [
          {
            name: job.naam
            image: jobsImage
            args: [
              job.commando
            ]
            env: jobsEnv
            resources: {
              cpu: json('0.5')
              memory: '1Gi'
            }
          }
        ]
      }
    }
  }
]

output migratieJobName string = migratieJob.name
output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
