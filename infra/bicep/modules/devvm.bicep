// Ontwikkel-VM (Ubuntu) in snet-data: werken via SSH en VS Code vanuit Azure, uitgaand via de NAT Gateway (vast IP voor Realworks)
param env string

@description('Korte regiocode in alle resourcenamen, bv. neu (North Europe).')
param regionShort string = 'neu'
param location string
param tags object = {}

@description('Subnet snet-data waarin de VM landt.')
param subnetId string

@description('Resource-id van de managed identity; op de VM werkt dan `az login --identity` voor leesrechten op Key Vault, Storage en Service Bus.')
param identityId string

@description('Beheerdersnaam op de VM (ook je SSH-gebruikersnaam).')
param adminUsername string = 'tim'

@description('Openbare SSH-sleutel, de inhoud van ~/.ssh/id_ed25519.pub. Geen wachtwoordlogin.')
param sshPublicKey string

@description('VM-maat. Standard_B2s = 2 vCPU, 4 GiB (familie standardBSFamily, quotum aanwezig): genoeg voor VS Code Remote en Claude Code.')
param vmSize string = 'Standard_B2s'

var vmName = 'vm-cockpit-${env}-${regionShort}'

resource pip 'Microsoft.Network/publicIPAddresses@2025-09-01' = {
  name: 'pip-vm-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2025-09-01' = {
  name: 'nsg-vm-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'allow-ssh'
        properties: {
          description: 'SSH met sleutel; wachtwoordlogin staat uit'
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '22'
        }
      }
    ]
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2025-09-01' = {
  name: 'nic-vm-cockpit-${env}-${regionShort}'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: subnetId
          }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: pip.id
          }
        }
      }
    ]
    networkSecurityGroup: {
      id: nsg.id
    }
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-11-01' = {
  name: vmName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        name: 'osdisk-vm-cockpit-${env}-${regionShort}'
        createOption: 'FromImage'
        diskSizeGB: 64
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
  }
}

output vmName string = vm.name
output sshPublicIp string = pip.properties.ipAddress
output sshCommand string = 'ssh ${adminUsername}@${pip.properties.ipAddress}'
