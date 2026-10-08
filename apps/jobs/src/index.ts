// Jobs die in Azure als Container Apps-job draaien (ADR-008). Gebruik: node jobs.cjs <commando>
import { gebruikersBijwerken } from "./gebruikers-bijwerken";
import { importVerkooplijst } from "./import-verkooplijst";
import { importWaardebepalingen } from "./import-waardebepalingen";
import { syncRealworks } from "./sync-realworks";

const commandos: Record<string, () => Promise<void>> = {
  "sync-realworks": syncRealworks,
  "import-verkooplijst": importVerkooplijst,
  "import-waardebepalingen": importWaardebepalingen,
  "gebruikers-bijwerken": gebruikersBijwerken,
};

async function main(): Promise<void> {
  const commando = process.argv[2] ?? "";
  const job = commandos[commando];
  if (!job) throw new Error(`onbekend commando '${commando}'; kies uit: ${Object.keys(commandos).join(", ")}`);
  console.log(`job ${commando} gestart`);
  await job();
  console.log(`job ${commando} klaar`);
}

main().catch((fout) => {
  // Alleen de melding, geen objecten met mogelijk persoonsgegevens.
  console.error(`job mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
  process.exit(1);
});
