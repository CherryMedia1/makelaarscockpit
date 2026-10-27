# ADR-016 Woningtekst-module en schrijfprofielen
Datum: 2026-10-27 · Status: voorgesteld
## Context
Fase B van de intake-module (plan `docs/plannen/woningtekst-module.md`): een woningtekst in de huisstijl van het kantoor, te bewerken, goed te keuren en te kopiëren. C&R maakt teksten nu met een eigen GPT ("Wilma") op basis van steekwoorden per ruimte. De opdracht van Tim (`docs/plannen/Woningteksten/INSTRUCTIE-woningtekst-module.md`, niet in git) vraagt om schrijfprofielen per kantoor, zodat niets C&R-specifieks in de code staat, en om voorbereiding op het automatisch afleiden van een profiel uit bestaande teksten.

Uitgangspunten uit eerdere besluiten: tekst alleen uit bevestigde feiten (plan intake §3), mens in de lus, geen terugschrijven naar Realworks (ADR-005), alleen EU-datazone-modellen (ADR-014), opschonen na verkoop (ADR-015). De repo is publiek; echte woningteksten van C&R zijn klantdata en komen er niet in.

Besluiten van Tim (2026-10-27): geen "Omschrijving" genereren, koppen in titelstijl, kopiëren als tekst (Word later), varianten (Funda kort, Engels, social) buiten v1.
## Beslissing
1. **Schrijfprofiel per tenant, geversioneerd** (`intake_schrijfprofiel`): de vragenlijst (secties met sleutel, label, hint, volgorde), de structuur (secties met standaardkop, toegestane varianten of vrije kop), toon en schrijfregels, lengte per woningtype, kopstijl, vaste blokken (zoals de NEN2580-clausule) en het model. Eén JSON-document, gecontroleerd met een JSON Schema in `packages/ai`. Eén actieve versie per tenant; een tekst verwijst naar de profielversie waarmee hij gemaakt is.
2. **Voorbeeldteksten in de database** (`intake_schrijfvoorbeeld`, per tenant, met woningtype), nooit in de repo. Per generatie gaan twee voorbeelden mee, bij voorkeur van hetzelfde woningtype. Tests gebruiken verzonnen voorbeelden.
3. **Feiten voor de tekst komen uit het intakedossier:** de bevestigde velden van het woningprofiel, de woninggegevens uit de Realworks-kopie (adres, plaats, energielabel) en de steekwoorden die een medewerker per sectie invult. Wat een medewerker zelf typt, geldt als bevestigd. Voorstellen en conflicten gaan niet mee. Zo werkt de module ook voor een woning zonder Plaud-opname.
4. **Generatie via de wachtrij:** het portaal zet een bericht op de queue `intake-tekst`; een eventgestuurde job (`schrijf-woningtekst`) maakt de tekst. Het portaal toont "bezig" tot de versie er is. Een tekst kost het model 30 à 90 seconden; zo hangt het portaal niet en zijn er herhaalpogingen.
5. **Nieuwe deployment `tekst`** (voorlopig `gpt-5.4`, Data Zone Standard EU); `gpt-5.5` is de eerste kandidaat in de vergelijking. Het profiel kiest alleen uit de logische deployments `tekst` en `controle`.
6. **Gestructureerde output** (inleiding, secties met sleutel, kop en tekst, gebruikte feiten, aannames). De code zet de koppen in de kopstijl van het profiel, laat secties zonder invoer weg en voegt vaste blokken letterlijk toe; het model schrijft die nooit zelf.
7. **Controles na generatie,** opgeslagen per versie en zichtbaar naast de tekst: deterministisch (toegestane koppen, geen sectie zonder invoer, adres en bezichtigingsuitnodiging in de inleiding, lengte binnen de bandbreedte) en een bronnencontrole met het model `controle`. Die laatste markeert elke concrete bewering die niet uit de feiten volgt. Waarschuwingen blokkeren niet, maar zijn zichtbaar bij het goedkeuren.
8. **Versies:** elke modelversie en elke bewerking door een medewerker is een eigen versie (`intake_woningtekst_versie`), zodat het verschil later gebruikt kan worden om profielen bij te stellen. Goedkeuren legt vast welke versie, door wie en wanneer.
9. **Publiceren via een interface** `WoningtekstPublicatie`, in v1 alleen kopiëren en downloaden als tekst. Een publicatie naar Realworks kan later worden toegevoegd als ADR-005 dat toestaat.
10. **Profielbeheer** door de kantoorbeheerder (ADR-006): profiel bekijken en bewerken (nieuwe versie), voorbeeldteksten toevoegen. Het C&R-profiel wordt via deze pagina ingevoerd. De profielgenerator (profiel afleiden uit 3 tot 5 teksten) krijgt in v1 alleen het schema, de analyseprompt en een stub.
11. **Persoonsgegevens in steekwoorden:** e-mailadressen en telefoonnummers worden vóór de modelaanroep verwijderd en gemeld; namen zijn niet betrouwbaar te herkennen, daarvoor staat een waarschuwing bij het invulveld.
## Gevolgen
- Migratie 0012: `intake_schrijfprofiel`, `intake_schrijfvoorbeeld`, `intake_woningtekst`, `intake_woningtekst_versie`, met `tenant_id` en RLS.
- Infra: queue `intake-tekst`, deployment `tekst` (capaciteit 30K TPM; het quotum voor `gpt-5.4` in Sweden Central wordt gedeeld met `extractie`), event-job `job-tekst-cockpit-{env}-neu`.
- Kosten per tekst rond € 0,10 (invoer met twee voorbeelden ongeveer 10K tokens, uitvoer met redeneren ongeveer 4K), plus de bronnencontrole; vastgelegd in `intake_verbruik`.
- ADR-015 wordt aangevuld: na verkoop blijven goedgekeurde teksten met hun versies bewaard; teksten die nooit zijn goedgekeurd worden verwijderd.
- Open bij C&R: zijn vrije koppen bij extra secties en de omgevingssectie gewenst (voorlopig ja)?
