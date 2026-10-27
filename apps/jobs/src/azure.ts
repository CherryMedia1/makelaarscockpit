// Toegang tot Key Vault en Blob Storage met de managed identity (lokaal: az login).
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { BlobServiceClient } from "@azure/storage-blob";

const clientId = process.env.AZURE_CLIENT_ID;
export const credential = new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : {});

export function omgeving(naam: string): string {
  const waarde = process.env[naam];
  if (!waarde) throw new Error(`omgevingsvariabele ${naam} ontbreekt`);
  return waarde;
}

let secrets: SecretClient | undefined;
export async function leesSecret(naam: string): Promise<string> {
  secrets ??= new SecretClient(omgeving("KEY_VAULT_URL"), credential);
  const secret = await secrets.getSecret(naam);
  if (!secret.value) throw new Error(`secret ${naam} is leeg`);
  return secret.value;
}

let blobs: BlobServiceClient | undefined;
const blobService = () => (blobs ??= new BlobServiceClient(`https://${omgeving("STORAGE_ACCOUNT")}.blob.core.windows.net`, credential));

export async function leesBlob(container: string, naam: string): Promise<Buffer> {
  return blobService().getContainerClient(container).getBlobClient(naam).downloadToBuffer();
}

export async function schrijfBlob(container: string, naam: string, inhoud: string): Promise<void> {
  await blobService().getContainerClient(container).getBlockBlobClient(naam).upload(inhoud, Buffer.byteLength(inhoud), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

export async function verwijderBlob(container: string, naam: string): Promise<void> {
  await blobService().getContainerClient(container).getBlobClient(naam).deleteIfExists();
}

/** Verwijdert alle blobs onder een prefix (bijv. de map van één intakedossier); geeft het aantal terug. */
export async function verwijderBlobsMetPrefix(container: string, prefix: string): Promise<number> {
  const map = blobService().getContainerClient(container);
  let aantal = 0;
  for await (const blob of map.listBlobsFlat({ prefix })) {
    await map.getBlobClient(blob.name).deleteIfExists();
    aantal += 1;
  }
  return aantal;
}
