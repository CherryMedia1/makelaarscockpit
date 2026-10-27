# Plan: woningtekst-module (fase B van de intake-module)

> Uitwerking van fase B in `docs/plannen/intake-module.md`, op basis van de opdracht van Tim (`docs/plannen/Woningteksten/INSTRUCTIE-woningtekst-module.md`, niet in git: bevat echte teksten van C&R). Beslissingen staan in ADR-016. Werk per stap, één PR per stap, en vraag review voordat de volgende begint.

## 1. Doel en afbakening

C&R maakt in MakelaarsCockpit een woningtekst in hun eigen stijl, vanuit het intakedossier van een woning: bewerken, goedkeuren, kopiëren. Dit vervangt de huidige werkwijze met de eigen GPT ("Wilma").

**In v1:** schrijfprofielen per kantoor, steekwoorden per sectie, generatie met controles, bewerken per sectie, opnieuw schrijven (hele tekst of één sectie), goedkeuren, kopiëren en downloaden als tekst, profielbeheer, stub van de profielgenerator.

**Niet in v1 (besluit Tim, 2026-10-27):** download als Word, varianten (Funda kort, Engels, social), terugschrijven naar Realworks (ADR-005), "Omschrijving" bovenaan de tekst.

## 2. Hoe het werkt voor de medewerker

1. Intakepagina van een woning → **Woningtekst**.
2. Links per sectie van de vragenlijst een veld voor steekwoorden (entree, woonkamer, keuken, …), met de hint uit het profiel. Daarnaast het feitenblok: adres en plaats uit Realworks plus de bevestigde velden van het woningprofiel. Staan er nog voorstellen of conflicten open, dan meldt de pagina dat die niet meegaan.
3. **Tekst schrijven** → de pagina toont "bezig" en ververst zichzelf; na 30 à 90 seconden staat de tekst er.
4. De tekst staat per sectie in te bewerken velden (kop en tekst). Waarschuwingen uit de controles staan bij de sectie, bijvoorbeeld "noemt een open haard; staat niet in de feiten".
5. **Opslaan** (nieuwe versie), **Opnieuw schrijven** (hele tekst of één sectie), **Goedkeuren**, **Kopiëren als tekst** en **Downloaden (.txt)**. Onderaan: "Geschreven met profiel C&R, versie 1".

## 3. Datamodel (migratie 0012)

Alle tabellen met `tenant_id`, RLS (`tenant_isolatie`) en grants op `cockpit_app`.

| Tabel | Kern |
|---|---|
| `intake_schrijfprofiel` | `versie` (uniek per tenant), `status` (`concept`, `actief`, `gearchiveerd`; hoogstens één actief per tenant), `naam`, `profiel` (jsonb, gecontroleerd met het schema uit §4), `aangemaakt_door`, `aangemaakt_op` |
| `intake_schrijfvoorbeeld` | `titel`, `woningtype`, `tekst`, `aangemaakt_door`, `aangemaakt_op` |
| `intake_woningtekst` | `dossier_id` (uniek), `profiel_id` (de versie waarmee geschreven), `steekwoorden` (jsonb per sectiesleutel), `status` (`concept`, `bezig`, `geschreven`, `mislukt`, `goedgekeurd`), `goedgekeurde_versie_id`, `goedgekeurd_door`, `goedgekeurd_op`, `gewijzigd_op` |
| `intake_woningtekst_versie` | `woningtekst_id`, `bron` (`model`, `medewerker`), `inhoud` (jsonb: inleiding en secties met sleutel, kop en tekst), `tekst` (gerenderd, met vaste blokken), `feiten` (jsonb: momentopname van de feiten die meegingen), `controles` (jsonb), `model`, `prompt_versie`, `prompt_hash`, `aangemaakt_door`, `aangemaakt_op` |

Tokens en kosten gaan naar het bestaande `intake_verbruik` (stappen `tekst-v1` en `tekstcontrole-v1`).

## 4. Schrijfprofiel (JSON Schema in `packages/ai`)

```
vragenlijst:  [{ sleutel, label, hint, volgorde, verplicht }]
structuur:    { inleiding: { regels[] },
                secties: [{ sleutel, rol: "ruimte"|"extra"|"omgeving"|"afsluiting", invoer: [vragenlijst-sleutels],
                            standaardkop, varianten[], vrijeKop: bool }],
                afsluiting: { regels[] } }
toon:         { aanspreekvorm: "je"|"u", regels[], signatuur[], vermijden[] }
lengte:       { appartement: [min,max], eengezinswoning: [min,max], vrijstaand: [min,max] }   (woorden, zonder vaste blokken)
kopstijl:     "titel" | "hoofdletters"
inleidingLabel: string (leeg voor C&R)
vasteBlokken: [{ sleutel, positie: "einde", tekst }]
model:        { deployment: "tekst", voorbeelden: 2 }
```

Het C&R-profiel (versie 1) maak ik op basis van de opdracht en de voorbeeldteksten. Het staat niet in git maar lokaal naast de opdracht; Tim voert het samen met de voorbeeldteksten in via de profielbeheerpagina (stap B6). De repo krijgt alleen een verzonnen testprofiel ("Kantoor Voorbeeld").

## 5. Generatie

1. **Feiten** (`packages/ai`, puur): adres, plaats en energielabel uit de woning; bevestigde velden als "label: waarde"; steekwoorden per sectie, met e-mailadressen en telefoonnummers verwijderd (ADR-016, punt 11). Woningtype uit het profiel (`object.woningtype`), anders "eengezinswoning".
2. **Prompt** (`packages/ai/src/tekst/`, met `prompt_versie`): generieke basisregels (geen verzonnen kenmerken, geen persoonsgegevens, geen claims over waarde of juridische zaken, correct Nederlands), de structuur en toon uit het profiel, twee voorbeeldteksten van hetzelfde woningtype en de lengte voor dat type. Gebruikersbericht: feiten en steekwoorden.
3. **Modelaanroep** in de job met strikte gestructureerde output (deployment `tekst`).
4. **Code**: kopstijl toepassen, secties zonder invoer weglaten, vaste blokken letterlijk toevoegen, renderen naar platte tekst met koppen op een eigen regel.
5. **Controles** (opgeslagen in `controles`):
   - deterministisch, in `packages/domain`: koppen uit de toegestane lijst (of vrij waar het profiel dat toestaat), geen sectie zonder invoer, adres en bezichtigingsuitnodiging in de inleiding, uitnodiging in de afsluiting, lengte binnen de bandbreedte, adres en plaats gelijk aan de woning;
   - bronnencontrole met deployment `controle`: concrete beweringen die niet uit de feiten volgen, met het stuk tekst erbij.
6. **Eén sectie opnieuw**: hetzelfde, met de bestaande tekst als context en alleen die sectie als opdracht.

## 6. Stappen

| # | Stap | Inhoud | Afhankelijk van |
|---|---|---|---|
| B0 | ADR en plan ✅ 2026-10-27 | ADR-016, dit plan | Akkoord Tim |
| B1 | Schrijfprofiel ✅ 2026-10-27 | JSON Schema en validatie in `packages/ai`, verzonnen testprofiel en -voorbeelden; profielgenerator: schema, analyseprompt en stub | B0 |
| B2 | Database | Migratie 0012 en queries in `packages/db`, integratietest | B1 |
| B3 | Tekstlogica | Feiten, prompt, outputschema, renderen met vaste blokken (`packages/ai`); controles (`packages/domain`). **Tests eerst.** | B1 |
| B4 | Job en infra | Command `schrijf-woningtekst` in `apps/jobs`, queue `intake-tekst`, deployment `tekst`, event-job; bronnencontrole; integratietest met opgenomen modelantwoord | B2, B3 |
| B5 | Portaal: tekst | Steekwoorden, feitenblok, schrijven met status, bewerken per sectie, opnieuw (geheel of sectie), goedkeuren, kopiëren en .txt | B4 |
| B6 | Portaal: profielbeheer | Kantoorbeheerder: profiel bekijken en bewerken (nieuwe versie), voorbeeldteksten toevoegen en verwijderen. Daarna voert Tim het C&R-profiel in | B2 |
| B7 | Opschonen | ADR-015 aanvullen: nooit goedgekeurde teksten weg na verkoop | B2 |
| B8 | Acceptatie | Drie echte woningen van C&R naast de tekst van Wilma; de backoffice beoordeelt of het "als C&R klinkt" | B5, B6 |

**Klaar als:** de backoffice van C&R keurt 8 van de 10 teksten goed met alleen kleine correcties, en de bronnencontrole vindt geen ongedekte feiten in goedgekeurde teksten.

## 7. Testen

- Unit: profielschema, feiten (inclusief verwijderen van e-mail en telefoon), prompt-assemblage, renderen met kopstijl en vaste blokken, alle controles.
- Integratie (`DB_INTEGRATIE=1`): job met een opgenomen modelantwoord voor het verzonnen testprofiel; versies, status en verbruik.
- Golden tests met het echte model (handmatig, tegen dev): de twee intakes uit de opdracht (Glymesstraat 21, Brugstraat 17) met het C&R-profiel. Die intakes zijn klantdata en staan niet in de repo; het script leest ze uit een lokale map.
- CI draait altijd met een nagebootste modelaanroep.

## 8. Open punten

- C&R: vrije koppen bij extra secties en de omgevingssectie gewenst? (voorlopig ja)
- C&R: voorbeeldtekst 01 (Glymesstraat 21) ontbreekt nog; er zijn er drie aangeleverd.
- Quotum: `gpt-5.4` Data Zone in Sweden Central heeft nu 50K voor `extractie`; `tekst` vraagt 30K extra. Vóór B4 controleren (zie `docs/handleiding-intake-azure.md`, stap 0).
