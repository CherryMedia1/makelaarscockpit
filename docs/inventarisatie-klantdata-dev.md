# Inventarisatie: echte klantdata in dev

Stand: 2026-11-12 · Issue #39 · Omgeving: `rg-cockpit-dev-neu` (abonnement `cockpit-dev`)

Deze inventarisatie is gemaakt vanuit de code, de Bicep-bestanden en de ARM-metadata die de service principal `sp-cockpit-dev-claudecode` mag lezen. Er is geen data gelezen uit Postgres, blobs of Key Vault. Aantallen staan er daarom nog niet in: die komen uit de twee scripts in [infra/scripts/README.md](../infra/scripts/README.md), die Tim zelf draait. De beslissing staat in [beslisnotitie-klantdata-dev.md](beslisnotitie-klantdata-dev.md).

## Samenvatting

- Dev is op dit moment de productieomgeving van de pilot. De sync haalt elke ochtend de echte Realworks-gegevens van C&R op, en medewerkers van C&R kunnen inloggen op het portaal in dev.
- Persoonsgegevens staan op vier plekken: de database, de blob-containers `raw-realworks`, `intake` en `import`, de back-ups van Postgres (7 dagen) en de soft-deleted blobs (7 dagen).
- Opschonen is alleen geregeld voor intakedossiers (ADR-015) en voor de container `audio`. Voor `raw-realworks` en `import` bestaat geen bewaartermijn: die groeien of blijven staan.
- In de git-repo staat geen klantdata en heeft die ook nooit gestaan. De repo is publiek.
- De service principal van Claude Code heeft alleen nog de rol `cockpit-dev-operator`. De service principal van GitHub Actions heeft Contributor op de resourcegroep en kan daarmee bij alle data.

## 1. Routes waarlangs echte data in dev komt

| Route | Hoe | Automatisch? | Bron in de code |
|---|---|---|---|
| Sync uit Realworks | Job `job-sync-cockpit-dev-neu` haalt medewerkers, het Wonen-aanbod en de agenda van C&R op, schrijft naar Postgres en zet de ruwe antwoorden in `raw-realworks` | Ja, dagelijks 05:00 UTC | [sync-realworks.ts](../apps/jobs/src/sync-realworks.ts), [apps.bicep:282](../infra/bicep/apps.bicep#L282) |
| Import van Excel-historie | Tim uploadt een Excel naar container `import`; een handmatige job leest hem in (verkooplijst, waardebepalingen, woningen) | Nee, handmatig | [import-verkooplijst.ts](../apps/jobs/src/import-verkooplijst.ts), [import-waardebepalingen.ts](../apps/jobs/src/import-waardebepalingen.ts), [import-woningen.ts](../apps/jobs/src/import-woningen.ts) |
| Intake-uploads | Een ingelogde medewerker uploadt in het portaal een transcript uit Plaud (.txt) of een PDF; het bestand gaat naar container `intake`, een bericht met id's naar de queue | Door gebruikers | [acties.ts:50](../apps/web/src/app/(portaal)/woningen/[id]/intake/acties.ts#L50), [intake.ts](../apps/web/src/lib/intake.ts) |
| Intake-verwerking | Job `job-intake-cockpit-dev-neu` leest het bestand, stuurt de tekst naar Foundry (Sweden Central, ADR-014) en schrijft velden met citaten naar Postgres | Ja, bij een bericht op de queue | [verwerk-intake.ts](../apps/jobs/src/verwerk-intake.ts) |
| Woningtekst | Job `job-tekst-cockpit-dev-neu` schrijft een tekst op basis van het profiel en de steekwoorden | Ja, bij een bericht op de queue | [schrijf-woningtekst.ts](../apps/jobs/src/schrijf-woningtekst.ts) |
| Invoer in het portaal | Courtage, verdeling, kosten, status van waardebepalingen, stappen per woning, schrijfprofiel en voorbeeldteksten | Door gebruikers | apps/web |
| Gebruikers toevoegen | `gebruiker-toevoegen.sh` zet e-mailadres en naam als tijdelijk bestand in `import`; de job leest het en verwijdert het daarna | Nee, handmatig | [gebruiker-toevoegen.sh](../infra/scripts/gebruiker-toevoegen.sh), [gebruikers-bijwerken.ts](../apps/jobs/src/gebruikers-bijwerken.ts) |
| Seed in migraties | Migratie 0002 maakt tenant `cr` aan met de kantoornaam en Realworks-codes; 0005 en 0006 vullen de Microsoft-organisatie en de startdatum van de koppeling | Bij elke deploy | [0002_tenant_cr.sql](../db/migrations/0002_tenant_cr.sql) |

Toelichting:

- **Welke tenant en welk token.** Alle jobs in dev draaien met `TENANT_SLEUTEL=cr` ([apps.bicep:23](../infra/bicep/apps.bicep#L23), bevestigd in de live job). De sync leest de secrets `tenant-cr-realworks-token-wonen`, `tenant-cr-realworks-token-relaties` en `tenant-cr-realworks-token-agenda` uit `kv-cockpit-dev-neu-01` ([sync-realworks.ts:20](../apps/jobs/src/sync-realworks.ts#L20)). Volgens het [runbook](runbooks/realworks-koppeling.md) zijn dit de tokens van de echte C&R-koppeling; of Realworks een test-API heeft, staat daar nog als "invullen". Welke secrets er werkelijk in de vault staan heb ik niet opgevraagd.
- **Plaud.** Er is geen webhook. De Function App `func-cockpit-dev-neu` draait, maar bevat nul functies; `apps/functions` is nog leeg. Transcripten komen alleen binnen via handmatige upload in het portaal. ADR-015 punt 4 (Plaud-toegang ingetrokken) is daardoor nog niet gebouwd.
- **Het portaal is publiek bereikbaar** (externe ingress) en gebruikers loggen in met Microsoft of een e-maillink. Wat C&R daar invoert, is echte bedrijfsdata.
- **Geen losse seedscripts.** Buiten de migraties is er geen script dat data in dev zet. De map `input/` is bedoeld voor Excel-bestanden op de laptop en wordt door git genegeerd.

## 2. Waar persoonsgegevens kunnen staan

### Database (`cockpit` op `psql-cockpit-dev-neu`)

"Betrokkene" is de persoon over wie de gegevens gaan. Een woonadres van een verkoper is een persoonsgegeven.

| Tabel | Migratie | Wat erin kan staan | Betrokkene |
|---|---|---|---|
| `tenant` | [0001](../db/migrations/0001_basis.sql#L15) | Kantoornaam, Realworks-codes, Microsoft-organisatie | Geen personen |
| `medewerker` | [0001](../db/migrations/0001_basis.sql#L26) | Naam, roepnaam, achternaam, Realworks-id, relatiecode | Medewerkers kantoor |
| `gebruiker` | [0005](../db/migrations/0005_gebruikers_en_inlog.sql#L8) | E-mailadres, naam, laatste inlog | Medewerkers kantoor, beheerder |
| `inlog_token` | [0005](../db/migrations/0005_gebruikers_en_inlog.sql#L26) | Hash van het token, tijdstippen (geen adres) | Medewerkers kantoor |
| `object` | [0001](../db/migrations/0001_basis.sql#L41) | Adres, postcode, vraag- en transactieprijs, data | Verkopers |
| `verkoop` | [0001](../db/migrations/0001_basis.sql#L69) | Adres, verkoopprijs, courtage, data | Verkopers; financieel van het kantoor |
| `verkoop_verdeling` | [0001](../db/migrations/0001_basis.sql#L99) | Naam van de makelaar, aandeel | Medewerkers kantoor |
| `kostenregel` | [0001](../db/migrations/0001_basis.sql#L110) | Leverancier, vrije omschrijving, bedrag | Leveranciers; vrije tekst |
| `doelstelling` | [0001](../db/migrations/0001_basis.sql#L126) | Omzetdoelen per maand | Geen personen |
| `waardebepaling` | [0008](../db/migrations/0008_waardebepalingen.sql#L2) | Adres, postcode, Realworks-relatie-id, naam makelaar, "verloren aan" | Mogelijke verkopers (ook mensen die geen klant werden) |
| `agendapunt` | [0009](../db/migrations/0009_woningen_in_verkoop.sql#L10) | Locatie (adres), type en datum van de afspraak | Verkopers |
| `woning` | [0009](../db/migrations/0009_woningen_in_verkoop.sql#L28) | Adres, plaats, vraagprijs, namen makelaar en backoffice | Verkopers, medewerkers |
| `woning_stap` | [0009](../db/migrations/0009_woningen_in_verkoop.sql#L50) | Stap, status, datum | Indirect via de woning |
| `intake_dossier` | [0010](../db/migrations/0010_intake.sql#L13) | Koppeling aan woning, status | Indirect |
| `intake_bron` | [0010](../db/migrations/0010_intake.sql#L25) | Oorspronkelijke bestandsnaam, pad in blob | Verkopers (bestandsnaam kan een naam of adres bevatten) |
| `intake_veld` | [0010](../db/migrations/0010_intake.sql#L46) | Waarde per profielveld en een letterlijk citaat uit het gesprek | Verkopers |
| `intake_verbruik` | [0010](../db/migrations/0010_intake.sql#L67) | Tokens en kosten | Geen personen |
| `intake_schrijfprofiel` | [0012](../db/migrations/0012_woningtekst.sql#L6) | Schrijfstijl van het kantoor | Geen personen |
| `intake_schrijfvoorbeeld` | [0012](../db/migrations/0012_woningtekst.sql#L20) | Echte woningteksten van het kantoor | Indirect (woning herkenbaar) |
| `intake_woningtekst`, `intake_woningtekst_versie` | [0012](../db/migrations/0012_woningtekst.sql#L31) | Steekwoorden, tekst, momentopname van de feiten | Verkopers |
| `tenant_module`, `schema_migraties` | [0010](../db/migrations/0010_intake.sql#L5) | Instellingen | Geen personen |

De gevoeligste velden staan in `intake_veld`. Het [woningprofiel-schema](../packages/ai/src/intake/woningprofiel.schema.json) bevat naast woningkenmerken de groep `planning` (beschikbaarheid van de verkoper, sleutelregeling, huisdieren, voorkeur passeerdatum), de groepen `gebreken` en `vve`, `verkoopargumenten` in de woorden van de verkoper en een vrij veld `opmerkingen`. Elk veld kan in `bewijs` een citaat uit het transcript hebben. Transcripten worden niet gefilterd (ADR-015), dus alles wat in een gesprek gezegd is, kan in een citaat terechtkomen.

### FORCE ROW LEVEL SECURITY per tabel

De applicatie logt in als `id-cockpit-dev-neu`, de eigenaar van de tabellen. Zonder FORCE geldt RLS niet voor de eigenaar. Vastgesteld door alle twaalf migraties op een lokale Postgres 16 te draaien en de catalogus (`pg_class`) uit te lezen. De stand in dev zelf bevestig je met blok 1b van `inventaris-dev.sql`.

| Tabel | RLS | FORCE | Beleid | Rechten `cockpit_app` |
|---|---|---|---|---|
| `medewerker`, `object`, `verkoop`, `verkoop_verdeling`, `kostenregel`, `doelstelling` | aan | **ja** | `tenant_isolatie` | lezen en schrijven |
| `waardebepaling`, `agendapunt`, `woning`, `woning_stap` | aan | **ja** | `tenant_isolatie` | lezen en schrijven |
| `intake_dossier`, `intake_bron`, `intake_veld`, `intake_verbruik` | aan | **ja** | `tenant_isolatie` | lezen en schrijven |
| `intake_schrijfprofiel`, `intake_schrijfvoorbeeld`, `intake_woningtekst`, `intake_woningtekst_versie` | aan | **ja** | `tenant_isolatie` | lezen en schrijven |
| `tenant_module` | aan | **ja** | `tenant_isolatie` | alleen lezen |
| `gebruiker` | aan | **nee** | `tenant_isolatie` | lezen, toevoegen, wijzigen |
| `inlog_token` | aan | **nee** | geen | geen |
| `tenant` | aan | **nee** | `eigen_tenant` (alleen lezen) | alleen lezen |
| `schema_migraties` | uit | nee | geen | geen (heeft geen `tenant_id`) |

Negentien van de tweeëntwintig tabellen met klantgegevens hebben FORCE: daar geldt RLS ook als de applicatie vergeet naar `cockpit_app` te wisselen. Bij drie tabellen ontbreekt FORCE:

- **`gebruiker` en `inlog_token`** hebben `tenant_id` maar geen FORCE. Dat is bewust (migratie 0005): bij het inloggen is de tenant nog niet bekend. De functies in [packages/db/src/toegang.ts](../packages/db/src/toegang.ts) draaien als eigenaar, buiten `metTenant`. Voor deze twee tabellen is RLS dus geen vangnet; de isolatie hangt alleen aan de filters in de code. De controle in [db/migrate.mjs:91](../db/migrate.mjs#L91) zondert ze expliciet uit.
- **`tenant`** heeft geen `tenant_id` en sinds migratie 0003 geen FORCE, zodat de platformcode een tenant op sleutel kan opzoeken.

Dit wijkt af van harde regel 1 zoals die nu luidt. Dat is vastgelegd in issue #40; er is geen migratie geschreven.

### Blob-containers (`stcockpitdevneu`)

| Container | Inhoud | Persoonsgegevens | Bewaartermijn nu |
|---|---|---|---|
| `raw-realworks` | Per sync-run de ruwe Wonen-pagina's en de ruwe agendapunten van het type waardebepaling ([sync-realworks.ts:37](../apps/jobs/src/sync-realworks.ts#L37), [:108](../apps/jobs/src/sync-realworks.ts#L108)) | Ja. Bevat alles wat Realworks teruggeeft, ook velden die de database niet overneemt. Of de agenda vrije tekst of namen bevat, heb ik niet kunnen zien | **Geen.** Elke dag komen er bestanden bij |
| `intake` | Transcripten en PDF's onder `{tenant}/{dossier}/{bron-id}.{ext}` | Ja, het meest gevoelig (volledige gesprekken) | Tot opschonen volgens ADR-015 |
| `import` | Excel-bestanden met de historie; tijdelijk `gebruikers.json` | Ja (adressen, prijzen, namen makelaars) | **Geen.** De importjobs verwijderen het Excel-bestand niet; alleen `gebruikers.json` wordt verwijderd |
| `audio` | Bedoeld voor audio; de code schrijft er niet naar | Zou kunnen | 30 dagen (lifecycle-regel) |
| `documents` | Nog niet gebruikt door de code | Onbekend | Geen |
| `azure-webjobs-*`, `app-package-*` | Systeemcontainers van de Function App | Nee | n.v.t. |

De bestandsnamen in `raw-realworks`, `intake` en `import` bevatten geen persoonsgegevens (tenant-sleutel, datum, id's of een vaste naam). De oorspronkelijke bestandsnaam van een upload staat alleen in de database.

### Queues en topics (`sb-cockpit-dev-neu`)

De queues `intake-verwerking` en `intake-tekst` bevatten alleen id's ([servicebus.bicep](../infra/bicep/modules/servicebus.bicep)). Op het moment van meten waren beide leeg, ook de dead-letter-queues. De topics `realworks-events`, `workflow-commands` en `document-jobs` hebben geen subscriptions en geen berichten; er schrijft nog niets naar.

### Overige plekken

| Plek | Wat | Bewaartermijn |
|---|---|---|
| Back-ups Postgres | Volledige kopie van de database | 7 dagen |
| Soft-deleted blobs | Verwijderde bestanden, ook opgeschoonde transcripten en `gebruikers.json` | 7 dagen |
| Log Analytics `log-cockpit-neu` (gedeeld) | Console-uitvoer van jobs en portaal. De jobs loggen id's en aantallen | 30 dagen |
| Foundry `aif-cockpit-dev-sdc` | Transcripten en profielen gaan als prompt naar Sweden Central (ADR-014). Wat Microsoft daarvan bewaart, is een vraag voor de beslisnotitie | Niet vastgesteld |
| Azure Communication Services | Verstuurt inloglinks; de dienst verwerkt e-mailadressen van gebruikers | Niet vastgesteld |
| Realworks-tokens in Key Vault | Geen persoonsgegevens, wel de sleutel tot alle data van C&R in Realworks | Tot vervanging |

## 3. Wat nu actief is in dev

Gemeten via ARM op 2026-11-12.

| Onderdeel | Trigger | Stand |
|---|---|---|
| `job-sync-cockpit-dev-neu` | Schema `0 5 * * *` (UTC) | Actief. De laatste vijf runs (8 t/m 12 november) zijn geslaagd: er komt dagelijks nieuwe data binnen |
| `job-intake-cockpit-dev-neu` | Queue `intake-verwerking` | Actief. Laatste run 2026-10-27 |
| `job-tekst-cockpit-dev-neu` | Queue `intake-tekst` | Actief |
| `job-import-*`, `job-gebruikers-*`, `job-migratie-*` | Handmatig | Draaien alleen als iemand ze start; de migratie-job start bij elke deploy |
| `ca-web-cockpit-dev-neu` | Publiek, schaalt 0 tot 2 | Actief |
| `ca-toolbox-cockpit-dev-neu` | Handmatig via `toolbox.sh` | Shell met de managed identity: toegang tot Key Vault, database en blobs |
| `func-cockpit-dev-neu` | - | Draait, bevat geen functies |
| Workflow `deploy-apps-dev` | Elke push naar `main` op apps, packages of db | Deployt naar dev en voert migraties uit op de echte data |
| Postgres | - | Aan (`Ready`); alleen Entra-login; firewall alleen het NAT-IP |
| NAT Gateway | - | Aanwezig, dus de sync bereikt Realworks |

Staat dev in de zuinige stand (Postgres gestopt), dan mislukt de sync en komt er die dag niets binnen. Het opschonen draait dan ook niet.

## 4. Opschonen volgens ADR-015 in dev

Wat er is:

- De beslisregel staat in [packages/domain/src/intake/opschonen.ts](../packages/domain/src/intake/opschonen.ts#L24) met tests. De uitvoering staat in [apps/jobs/src/intake/opschonen.ts](../apps/jobs/src/intake/opschonen.ts) en [packages/db/src/intake.ts:271](../packages/db/src/intake.ts#L271).
- Er is geen aparte opschoonjob. Het opschonen is de laatste stap van de dagelijkse sync ([sync-realworks.ts](../apps/jobs/src/sync-realworks.ts)). In dev loopt het dus elke ochtend mee, zolang de sync slaagt.
- Na verkoop: bestanden in `intake` weg, citaten leeg, de groep `planning` en niet-bevestigde velden weg, niet-goedgekeurde teksten weg. Ingetrokken woning: na 30 dagen het hele dossier weg.
- Soft delete van blobs staat op 7 dagen en versiebeheer staat uit. Dat past bij ADR-015.

Wat ontbreekt of afwijkt:

1. **Opschonen hangt aan de sync.** Mislukt de sync eerder in de run (Realworks niet bereikbaar, token verlopen, dev in de zuinige stand), dan wordt er niet opgeschoond. Er is geen melding als dat dagen achter elkaar gebeurt.
2. **Alleen tenant `cr`.** De sync draait voor één tenant uit de omgeving. Een tweede tenant wordt niet opgeschoond tot de job per tenant draait.
3. **ADR-015 gaat alleen over de intake.** Voor `raw-realworks`, `import`, en de tabellen `object`, `verkoop`, `waardebepaling` en `agendapunt` is geen bewaartermijn vastgelegd. `raw-realworks` bevat inmiddels een dagelijkse kopie van het aanbod sinds de eerste sync.
4. **`intake_woningtekst_versie.feiten`** bewaart een momentopname van de feiten bij elke versie, en bij een goedgekeurde tekst blijven alle versies staan (ADR-016). De groepen `planning`, `gebreken`, `zaken` en `opmerkingen` gaan niet mee in die feiten ([feiten.ts:9](../packages/ai/src/tekst/feiten.ts#L9)). De steekwoorden van de medewerker gaan wel mee; dat is vrije tekst en blijft dus bewaard.
5. **Uploads zonder dossier** (`intake_bron.dossier_id` leeg) vallen buiten het opschonen, want dat loopt per dossier. De huidige upload in het portaal maakt altijd een dossier, dus dit speelt pas bij een Plaud-koppeling.
6. **Plaud-toegang ingetrokken** (ADR-015 punt 4) is niet gebouwd, omdat er geen webhook is.
7. **Back-ups** bevatten opgeschoonde gegevens nog 7 dagen. ADR-015 noemt dat niet.

## 5. Klantdata in de git-repo

Onderzocht: de werkmap, alle branches (lokaal en op GitHub) en de volledige historie (`git log --all`). Alleen bestandsnamen, typen en commits zijn bekeken en gemeld.

- **`input/`**: in git staat alleen `input/README.md`, toegevoegd in commit `311f237` (2026-10-08). Er is nooit een ander bestand in die map gecommit. In de Codespace is de map verder leeg.
- **Bestandstypen in de hele historie**: geen `.xlsx`, `.xls`, `.csv`, audio, dumps of `.env`. Wel één PDF (`docs/huisstijl/huisstijlhandboek.pdf`) en vier `.txt`-bestanden: twee lettertypelicenties en `packages/ai/fixtures/intake/dossier-01/transcript.txt` (commits `653b53b` en `8a2061e`).
- **Fixtures** in `packages/ai/fixtures/`: volgens de README's verzonnen, met adressen in het niet-bestaande Testdorp. Een zoekactie op plaatsnamen en postcodes vond alleen Testdorp.
- **Verwijderde bestanden**: in de hele historie is één bestand verwijderd, `.devcontainer/devcontainer-lock.json`. Er is dus niets met data weggehaald dat nog in de historie staat.
- **E-mailadressen in de historie**: vijf domeinen. Drie zijn voorbeelden of technisch (`voorbeeld.nl`, `kantoor.nl`, het afzenderdomein van Azure). Eén adres op het domein van C&R staat in `docs/runbooks/inlog.md` en is een placeholder, geen persoon. Eén adres is dat van de beheerder zelf, in `infra/bicep/dev.bicepparam` (`adminPrincipalName`).
- **`docs/plannen/Woningteksten/`**: staat lokaal in de Codespace (vier `.md`, één `.json`), wordt door git genegeerd en is nooit gecommit. De map bevat volgens `.gitignore` echte woningteksten en intakes. Die staan dus wel in de Codespace, buiten Azure.

Conclusie: er staat geen klantdata in de repo en die heeft er niet gestaan. Wel openbaar, en geen klantdata: de kantoornaam en Realworks-codes van C&R in migratie 0002, de Microsoft-organisatie in 0005, en het beheerdersadres en object-id in `dev.bicepparam`. De regels noemen de codes "geen geheimen"; of je het beheerdersadres in een publieke repo wilt, is aan jou.

Opmerking: het issue verwijst naar "harde regel 8". CLAUDE.md heeft zeven harde regels; ik ben uitgegaan van regel 2 (geen persoonsgegevens in logs) en de afspraak in `.gitignore` dat klantbestanden niet in git komen.

## 6. Wie kan bij de data

| Wie | Rol | Toegang tot data |
|---|---|---|
| Managed identity `id-cockpit-dev-neu` | Eigenaar van de database, Storage Blob Data Owner, Key Vault Secrets User | Alles; dit is de applicatie |
| Tim | Owner op het abonnement, Entra-beheerder op Postgres, Secrets Officer | Alles, deels pas na een roltoewijzing |
| Service principal van GitHub Actions | Contributor en User Access Administrator op de resourcegroep | Indirect alles: kan storage-sleutels opvragen, container apps wijzigen en zichzelf rollen geven (zie ADR-017) |
| `sp-cockpit-dev-claudecode` | Alleen `cockpit-dev-operator` (gecontroleerd: Contributor is ingetrokken) | Geen data; wel configuratie |
| Medewerkers C&R | Portaal | Eigen tenant |

Netwerk: storage, Key Vault en Service Bus zijn vanaf internet bereikbaar en leunen op Entra-rollen. Storage accepteert nog sleutels (#37); `gebruiker-toevoegen.sh` gebruikt zo'n sleutel ([regel 22](../infra/scripts/gebruiker-toevoegen.sh#L22)).

## 7. Uitkomsten van de scripts

In te vullen door Tim na het draaien van `inventaris-dev.sql` en `inventaris-dev-blobs.sh`. Alleen aantallen en datums, geen inhoud.

| Tabel of container | Tenant | Aantal | Oudste | Nieuwste | Grootte |
|---|---|---|---|---|---|
| | | | | | |

## Niet te verifiëren met de huidige rol

- Aantallen en datums in database en blobs (daarvoor zijn de scripts).
- Welke secrets er in Key Vault staan en of er nog oude tokens zijn.
- De inhoud van de ruwe Realworks-antwoorden, dus welke persoonsgegevens `raw-realworks` precies bevat.
- Of er rijen of bestanden zijn die buiten de beschreven routes zijn ontstaan, bijvoorbeeld handmatig via de toolbox.
- Logs: de rol sluit het lezen daarvan uit.

## Vervolgissues

| Issue | Onderwerp |
|---|---|
| #40 | RLS zonder FORCE op `gebruiker`, `inlog_token` en `tenant` |
| #41 | GitHub Actions-service principal: User Access Administrator vervangen (hoge prioriteit) |
| #42 | Lifecycle-regels voor `raw-realworks` en `import` |
| #43 | Melding bij mislukte sync- of opschoonrun |
| #44 | CLAUDE.md bijwerken naar de tien harde regels |
| #37 | Storage: sleutels uitzetten (bestond al) |

