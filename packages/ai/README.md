# packages/ai

Prompts, schema's en evaluatiesets.

## Intake (ADR-013)
- `src/intake/woningprofiel.schema.json`: het woningprofiel, enige bron van waarheid. Na een wijziging: `npm run genereer -w @makelaarscockpit/ai` (de tests falen als de types niet actueel zijn), plus een migratie en een update van de evaluatieset in dezelfde PR.
- `src/intake/schema.ts`: validatie (`valideerProfiel`), bladvelden voor formulier en review (`bladen`), het schema voor gestructureerde modeloutput (`extractieSchema`), omzetting naar veldvoorstellen (`naarVeldvoorstellen`, gooit bladen zonder bewijs weg) en terug (`profielUitVelden`).
- `fixtures/intake/`: verzonnen dossiers; nooit klantdata.
