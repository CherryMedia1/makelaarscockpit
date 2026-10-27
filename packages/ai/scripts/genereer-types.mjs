// Genereert TypeScript-types uit de JSON Schema's in src. Met --check: faal als een bestand niet actueel is (draait in de tests).
import { readFile, writeFile } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const SCHEMAS = [
  { schema: "../src/intake/woningprofiel.schema.json", types: "../src/intake/woningprofiel.ts", naam: "Woningprofiel" },
  { schema: "../src/tekst/schrijfprofiel.schema.json", types: "../src/tekst/schrijfprofiel.ts", naam: "Schrijfprofiel" },
];

let verouderd = false;
for (const s of SCHEMAS) {
  const schemaPad = new URL(s.schema, import.meta.url);
  const typesPad = new URL(s.types, import.meta.url);
  const bestand = s.schema.split("/").pop();
  const types = await compile(JSON.parse(await readFile(schemaPad, "utf8")), s.naam, {
    bannerComment: `// Gegenereerd uit ${bestand} met \`npm run genereer -w @makelaarscockpit/ai\`. Niet met de hand wijzigen.`,
    additionalProperties: false,
    ignoreMinAndMaxItems: true,
    style: { semi: true, singleQuote: false, printWidth: 120 },
  });
  if (process.argv.includes("--check")) {
    if ((await readFile(typesPad, "utf8").catch(() => "")) !== types) {
      console.error(`${s.types} is niet actueel; draai npm run genereer -w @makelaarscockpit/ai`);
      verouderd = true;
    }
  } else {
    await writeFile(typesPad, types);
  }
}
if (verouderd) process.exit(1);
