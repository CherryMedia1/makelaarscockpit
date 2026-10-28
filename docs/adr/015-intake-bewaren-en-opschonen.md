# ADR-015 Intake: bewaren en opschonen na verkoop
Datum: 2026-10-26 · Status: geaccepteerd
## Context
De intake-module (ADR-013) slaat transcripten van intakegesprekken, notities, gespreksverslagen en checklists op. Die bevatten persoonsgegevens van de verkoper. Het afgeleide woningprofiel bevat vooral woningkenmerken, maar ook een paar gegevens over de verkoper (beschikbaarheid, sleutelregeling, huisdieren) en citaten uit het gesprek als bewijs per veld. Het kantoor is verwerkingsverantwoordelijke, MakelaarsCockPit verwerker (ADR-006).

Besluiten van Tim (2026-10-26):
- Transcripten worden niet gefilterd op persoonlijke informatie.
- Het gespreksverslag wordt altijd bewaard zolang de woning in verkoop is.
- Na verkoop mogen de gegevens met persoonsgegevens en de verslagen weg; het bevestigde woningprofiel en de goedgekeurde teksten blijven bewaard.
- Een woning die zonder verkoop verdwijnt: na 30 dagen verwijderen.
## Beslissing
1. **Geen filterstap** op persoonlijke informatie bij binnenkomst. Bronnen worden opgeslagen zoals ze binnenkomen, in Blob-container `intake` onder `{tenant}/{dossier}/`.
2. **Opschonen na verkoop:** zodra de transportdatum van het object verstreken is, worden verwijderd:
   - alle bronbestanden in Blob (transcripten, notities, gespreksverslagen, checklist-PDF's, meetrapporten);
   - het citaat in `bewijs` van elk veld (de verwijzing naar bron en tijdstempel of pagina blijft);
   - alle velden in de groep `planning`;
   - voorstellen, conflicten en afgewezen velden.
   Het dossier krijgt de status `opgeschoond`. Bewaard blijven de bevestigde velden buiten `planning`, de goedgekeurde teksten en het tokenverbruik.
3. **Ingetrokken woningen:** verdwijnt een woning zonder verkoop van het bord, dan wordt het hele dossier met alle bronnen 30 dagen later verwijderd. Komt de woning binnen die termijn terug, dan blijft alles staan.
4. **Plaud-toegang ingetrokken:** een Plaud-webhook met `userAccess: INACTIVE` verwijdert de transcripten en notities uit Plaud van die gebruiker, ook in lopende dossiers.
5. **Audio wordt niet gekopieerd.** Komt er toch audio binnen, dan gaat die naar de bestaande container `audio`, die na 30 dagen automatisch verwijdert.
6. **Uitvoering:** de beslisregel (welk dossier wanneer, wat weg moet) staat in `packages/domain` met tests. De sync-job `sync-realworks` voert het opschonen uit na het bijwerken van het bord, en logt alleen id's en aantallen.
## Gevolgen
- Uitvoering (2026-10-27): migratie 0011 voegt `woning.niet_zichtbaar_sinds` toe, die de sync bijhoudt. Een verkochte woning die van het bord verdwijnt zonder bekende transportdatum telt ook als verkocht (Realworks archiveert na de overdracht). Het opgeschoonde profiel is in het portaal alleen nog te lezen.
- Aanvulling (ADR-016, 2026-10-28): na verkoop blijft een goedgekeurde woningtekst met al zijn versies bewaard; een tekst die nooit is goedgekeurd wordt met zijn versies verwijderd. Bij een ingetrokken woning gaat de tekst mee met het dossier.
- Na opschonen zijn bronlinks in de review niet meer te openen; de UI toont dan "bron verwijderd na verkoop".
- `verkoopargumenten` blijven bewaard als deel van het profiel; het zijn woningkenmerken in de woorden van de verkoper, zonder herleidbare persoonsgegevens behalve via het adres van de woning.
- Het bewaarde profiel en de teksten zijn bruikbaar voor de evaluatieset van fase B, maar blijven gegevens van het kantoor: ze staan niet in de repo.
- Blob-versiebeheer en soft delete van de container `intake` krijgen een bewaartermijn van hooguit 7 dagen, zodat verwijderde bestanden ook echt verdwijnen.
- De bewaartermijnen staan in de verwerkersovereenkomst met elk kantoor.
