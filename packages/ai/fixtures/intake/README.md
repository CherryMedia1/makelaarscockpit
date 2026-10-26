# Fixtures intake

Verzonnen dossiers voor tests. Nooit echte klantdata, adressen of namen; adressen staan in het niet-bestaande Testdorp.

Per dossier:
- `transcript.txt`: intakegesprek met tijdstempels, zoals een export uit Plaud.
- `checklist.json`: ingevuld digitaal checklistformulier (een gedeeltelijk woningprofiel).
- `extractie.json`: opgenomen modelantwoord op het transcript, in de vorm van `extractieSchema()`. De integratietests van de verwerkingsjob gebruiken dit in plaats van een echte modelaanroep.
