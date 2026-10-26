// Genereert src/intake/woningprofiel.ts uit het JSON Schema. Met --check: faal als het bestand niet actueel is (draait in de tests).
import { readFile, writeFile } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const schemaPad = new URL("../src/intake/woningprofiel.schema.json", import.meta.url);
const typesPad = new URL("../src/intake/woningprofiel.ts", import.meta.url);

const schema = JSON.parse(await readFile(schemaPad, "utf8"));
const types = await compile(schema, "Woningprofiel", {
  bannerComment: "// Gegenereerd uit woningprofiel.schema.json met `npm run genereer -w @makelaarscockpit/ai`. Niet met de hand wijzigen.",
  additionalProperties: false,
  style: { semi: true, singleQuote: false, printWidth: 120 },
});

if (process.argv.includes("--check")) {
  const huidig = await readFile(typesPad, "utf8").catch(() => "");
  if (huidig !== types) {
    console.error("woningprofiel.ts is niet actueel; draai npm run genereer -w @makelaarscockpit/ai");
    process.exit(1);
  }
} else {
  await writeFile(typesPad, types);
}
