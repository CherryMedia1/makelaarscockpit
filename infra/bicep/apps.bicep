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

@description('Sleutel van de tenant waarvoor de jobs draaien. Het portaal haalt de tenant uit de sessie van de ingelogde gebruiker.')
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

resource communicatie 'Microsoft.Communication/communicationServices@2025-09-01' existing = {
  name: 'acs-cockpit-${env}-${regionShort}'
}

resource emailService 'Microsoft.Communication/emailServices@2025-09-01' existing = {
  name: 'email-cockpit-${env}-${regionShort}'
}

resource emailDomein 'Microsoft.Communication/emailServices/domains@2025-09-01' existing = {
  parent: emailService
  name: 'AzureManagedDomain'
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
          // Sleutel waarmee de sessie-cookies worden versleuteld (ADR-009).
          name: 'sessie-sleutel'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/web-sessie-sleutel'
          identity: identity.id
        }
        {
          name: 'microsoft-client-id'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/web-microsoft-client-id'
          identity: identity.id
        }
        {
          name: 'microsoft-client-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/web-microsoft-client-secret'
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
              name: 'SESSIE_SLEUTEL'
              secretRef: 'sessie-sleutel'
            }
            {
              name: 'MICROSOFT_CLIENT_ID'
              secretRef: 'microsoft-client-id'
            }
            {
              name: 'MICROSOFT_CLIENT_SECRET'
              secretRef: 'microsoft-client-secret'
            }
            {
              // Het publieke adres van het portaal, voor de inloglink in de e-mail en de terugkeer van Microsoft.
              name: 'PORTAAL_URL'
              value: 'https://ca-web-cockpit-${env}-${regionShort}.${containerAppsEnv.properties.defaultDomain}'
            }
            {
              name: 'ACS_ENDPOINT'
              value: 'https://${communicatie.properties.hostName}'
            }
            {
              name: 'MAIL_AFZENDER'
              value: 'DoNotReply@${emailDomein.properties.mailFromSenderDomain}'
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

// Sync, import en gebruikersbeheer als jobs (ADR-008). Ze gaan via het vaste NAT-IP naar buiten.
// De sync draait daarnaast dagelijks (ADR-010): Realworks toont een verkochte woning alleen tot die in het archief gaat.
// Tijd in UTC: 05:00 UTC is 07:00 in de zomer en 06:00 in de winter. In de zuinige stand (Postgres gestopt) mislukt de run; dat is bedoeld.
var jobs = [
  {
    naam: 'sync'
    commando: 'sync-realworks'
    schema: '0 5 * * *'
  }
  {
    naam: 'import'
    commando: 'import-verkooplijst'
    schema: ''
  }
  {
    naam: 'gebruikers'
    commando: 'gebruikers-bijwerken'
    schema: ''
  }
  {
    naam: 'import-wb'
    commando: 'import-waardebepalingen'
    schema: ''
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
        triggerType: empty(job.schema) ? 'Manual' : 'Schedule'
        replicaTimeout: 900
        replicaRetryLimit: 0
        manualTriggerConfig: empty(job.schema) ? {
          parallelism: 1
          replicaCompletionCount: 1
        } : null
        scheduleTriggerConfig: empty(job.schema) ? null : {
          cronExpression: job.schema
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
