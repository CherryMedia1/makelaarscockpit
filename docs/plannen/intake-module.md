# Plan: Startklaar-module (werknaam) — intake → woningprofiel → woningtekst

> Plan voor Claude Code. Lees dit volledig voordat je code schrijft. Werk per fase, sluit elke fase af met de acceptatiecriteria en vraag om review voordat je aan de volgende begint.
>
> Herzien 2026-10-26 tegen de bestaande repo, CLAUDE.md en de ADR's. Wijzigingen ten opzichte van de eerste versie staan in §11.

## 1. Context

- **Product:** MakelaarsCockpit, een SaaS voor Nederlandse makelaarskantoren bovenop Realworks CRM. Repo: `CherryMedia1/makelaarscockpit` (npm-workspaces-monorepo).
- **Basisabonnement:** dashboards en KPI-inzicht (bestaat al).
- **Deze module:** een betaalde add-on die per verkoopopdracht:
  1. het intakegesprek (Plaud Pro-opname) en de woningchecklist omzet in één gestructureerd **woningprofiel**;
  2. daaruit een **woningtekst** plus varianten genereert;
  3. de uitvoer kopieerklaar aanbiedt voor Realworks;
  4. partnerafspraken (fotograaf, stylist, bouwkundige keuring, inmeter) als concept voorbereidt.
- **Launching customer:** C&R Makelaars (Roosendaal).
- **Naam:** nog niet definitief. Gebruik in code de neutrale slug `intake`. Gebruik geen merknaam in identifiers.
- **Aansluiting op wat er is:** een verkoopopdracht bestaat al als `woning` op het bord van dashboard 3 (ADR-012, sleutel projectcode), inclusief woningen in voorbereiding die alleen uit een verkoopgesprek in de agenda bekend zijn. Een intakedossier hangt aan die `woning`; het is geen tweede, los woningbegrip.

## 2. Stack en conventies (bestaand, niet afwijken)

- TypeScript overal. Next.js (`apps/web`) leest en schrijft via `packages/db` in serveronderdelen (ADR-008); een Fastify-API (`apps/api`) volgt pas als een tweede afnemer erom vraagt.
- Achtergrondwerk draait als Container Apps-jobs (`apps/jobs`, ADR-008). De Function App (`apps/functions`, Flex Consumption) is alleen voor webhooks: binnen 1 seconde 202, verwerking via Service Bus.
- Alle Azure-resources in **North Europe** (`neu`, ADR-002). Microsoft Foundry en Content Understanding in **Sweden Central** voor modellen (nieuwe ADR, zie §7 fase A). **Geen** losse Azure OpenAI-resource: alles via Foundry.
- PostgreSQL Flexible Server met row-level security (`metTenant` in `packages/db`), Service Bus, Blob Storage, Key Vault (dev: `kv-cockpit-dev-neu-01`), NAT Gateway.
- Migraties in `db/migrations` (genummerd, één schema); domeinlogica met tests vooraf in `packages/domain`; prompts, schema's en evaluatiesets in `packages/ai`.
- Infra als code in Bicep (`infra/bicep`). GitHub Actions met OIDC, geen opgeslagen secrets.
- Architectuurbeslissingen vastleggen als ADR in `docs/adr/`. Relevant: ADR-005 (Realworks-schrijfstrategie, geaccepteerd), ADR-006 (toegang en rollen), ADR-008 (jobs en databasetoegang), ADR-012 (woningen in verkoop).
- Secrets en tokens altijd in Key Vault via Managed Identity, nooit in code, `.env` in de repo of logs. Logs bevatten id's, nooit namen, adressen of transcripttekst.
- UI volgt `docs/huisstijl/BRAND.md` met de semantische tokens.

## 3. Harde randvoorwaarden

1. **Plaud:** gebruik alleen de officiële Developer API (`https://platform.plaud.ai/developer/api`, OAuth 2.0 + PKCE). **Geen** reverse-engineered clients of browsertokens.
2. **Realworks:** geen browserautomatisering of scraping van het CRM. Lezen via de officiële API's met het `rwauth`-token per koppeling, alleen via `packages/realworks`. Terugschrijven alleen via endpoints die ADR-005 toestaat.
3. **Mens in de lus:** niets gaat naar buiten (mail, uitnodiging, Realworks) zonder expliciete goedkeuring door een gebruiker in de UI.
4. **Tekst alleen uit bevestigde feiten:** de generator leest uitsluitend velden met status `bevestigd` uit het woningprofiel, nooit rechtstreeks uit het transcript.
5. **AVG (besluit Tim, 2026-10-26):**
   - Transcripten worden niet gefilterd op persoonlijke informatie; er is geen filterstap.
   - Het gespreksverslag (PDF) wordt altijd bewaard, tot het opschonen na verkoop.
   - **Na verkoop** worden de gegevens met persoonsgegevens verwijderd: transcripten, notities, gespreksverslagen en andere bronbestanden, plus de citaten in `bewijs` en de groep `planning`. Moment: zodra de transportdatum van het object verstreken is. Het bevestigde woningprofiel en de goedgekeurde teksten blijven bewaard (woningkenmerken, onder meer voor de evaluatieset).
   - **Ingetrokken woningen:** verdwijnt een woning zonder verkoop uit Realworks, dan wordt het hele dossier 30 dagen later verwijderd.
   - Transcripties ook opschonen bij een Plaud-webhook met `userAccess: INACTIVE`.
   - Audio niet kopiëren. Gebeurt dat toch, dan verwijderen na verwerking (de bestaande container `audio` verwijdert na 30 dagen).
   - Alle data in EU-regio's.
6. **Multi-tenant:** elke tabel heeft een eigen `tenant_id` met row-level security, ook kindtabellen die al via een dossier aan een tenant hangen. Elke query filtert zelf op `tenant_id`; RLS is het vangnet. Blobpaden beginnen met de tenant.
7. **Feature flag:** de module is per tenant aan of uit, omdat het een betaalde add-on is. Opslag in `tenant_module` (§5); portaalpagina's, jobs en webhooks controleren de vlag.

## 4. Architectuur

```
Bronnen                         Azure (North Europe) / Foundry (Sweden Central)   Uitvoer
-------                         -----------------------------------------------   -------
Plaud Developer API  ──►  Poller-job + Service Bus
Upload (PDF) / formulier ──►  Blob `intake` + Service Bus
Checklist-PDF        ──►  Content Understanding (PDF → velden)
BAG/PDOK, EP-Online  ──►  Verrijking
Realworks API        ──►  (object lezen; webhooks via Function → Service Bus)
                                   │
                                   ▼
                          Foundry-model: transcript → velden (met bewijs)
                                   │
                                   ▼
                          WONINGPROFIEL (PostgreSQL)  ◄──►  Review backoffice (Next.js)
                                   │ (alleen bevestigde velden)
                                   ▼
                          Foundry-agent: woningtekst + bronnencontrole ──►  Realworks (kopieerklaar)
                                   │
                                   └──────────────────────────────────►  Partnerplanning (Graph/Bookings, na akkoord)
```

Verwerking (extractie, verrijking, samenvoegen) draait als een door Service Bus gestarte Container Apps-job in `apps/jobs`, niet als Durable Function. Samenvoegregels zijn pure functies in `packages/domain`.

## 5. Datamodel

### Tabellen (PostgreSQL, voorvoegsel `intake_`)

Het bestaande schema gebruikt één databaseschema met `cockpit_app` en `metTenant`; de module volgt dat met een tabelvoorvoegsel in plaats van een eigen schema. Elke tabel heeft `tenant_id uuid not null references tenant (id)`, RLS-beleid `tenant_isolatie` en `aangemaakt_op`.

| Tabel | Doel | Kernkolommen (naast `id`, `tenant_id`) |
| --- | --- | --- |
| `tenant_module` | Betaalde modules per tenant | `module` (`intake`), `aan_sinds`, primaire sleutel (`tenant_id`, `module`) |
| `intake_dossier` | Een verkoopopdracht | `woning_id` (unique, verwijst naar `woning`), `status`, `aangemaakt_door` |
| `intake_bron` | Elke input | `dossier_id` (nullable: ongekoppelde opname in de inbox), `type` (`plaud_transcript`, `plaud_note`, `checklist_form`, `checklist_pdf`, `gespreksverslag_pdf`, `meetrapport`, `bag`, `ep_online`), `extern_id`, `blob_pad`, `ontvangen_op`, `verwerkt_op`, `verwerkstatus`; unique (`tenant_id`, `type`, `extern_id`) |
| `intake_veld` | Eén waarde in het woningprofiel | `dossier_id`, `pad` (bijv. `installaties.cv.merk`), `waarde` (jsonb), `bron_id`, `bewijs` (jsonb: tijdstempel of pagina en citaat), `zekerheid` (0–1), `status` (`voorstel`, `bevestigd`, `conflict`, `afgewezen`), `bevestigd_door`, `bevestigd_op` |
| `intake_tekst` | Gegenereerde tekst (fase B) | `dossier_id`, `soort` (`hoofdtekst`, `funda_kort`, `engels`, `social_1`, `social_2`), `inhoud`, `bronnencontrole` (jsonb), `status` (`concept`, `goedgekeurd`, `overgenomen_in_realworks`), `model`, `prompt_versie` |
| `intake_verbruik` | Tokenverbruik per stap | `dossier_id`, `stap`, `model`, `input_tokens`, `output_tokens`, `kosten_eur` |
| `plaud_koppeling` | OAuth per gebruiker (fase C) | `gebruiker_id`, `keyvault_secret_naam`, `laatste_sync_op`, `status` |
| `partner` | Vaste partners per kantoor (fase D) | `soort` (`fotograaf`, `stylist`, `keuring`, `inmeter`), `naam`, `email`, `agenda_bron` (`graph`, `bookings`, `mail`) |
| `partner_afspraak` | Concept en definitieve afspraken (fase D) | `dossier_id`, `partner_id`, `voorgesteld_tijdvak`, `briefing`, `status` (`concept`, `goedgekeurd`, `verstuurd`, `bevestigd`) |

Fase A maakt alleen `tenant_module`, `intake_dossier`, `intake_bron`, `intake_veld` en `intake_verbruik` aan. De overige tabellen komen in de fase die ze nodig heeft.

### Woningprofiel-schema (JSON Schema, `packages/ai/src/intake/woningprofiel.schema.json`)

Eén bron van waarheid. Gebruik het voor de extractie-output van het model, de Content Understanding-analyzer, het checklistformulier, de review-UI en de tekstgenerator. TS-types worden eruit gegenereerd en ingecheckt; CI controleert dat ze actueel zijn.

Hoofdgroepen:

- `object`: adres, bouwjaar, woningtype, woonoppervlakte_m2, inhoud_m3, perceel_m2, aantal_kamers, aantal_slaapkamers, ligging, tuin (oppervlak, oriëntatie), parkeren
- `indeling[]`: per verdieping de ruimtes met korte omschrijving
- `installaties`: cv (merk, type, bouwjaar, eigendom of huur), warmtepomp, zonnepanelen (aantal, bouwjaar), ventilatie, isolatie (dak, gevel, vloer, glas), energielabel
- `keuken`: opstelling, bouwjaar, apparatuur[] (soort, merk, staat)
- `sanitair[]`: ruimte, bouwjaar, voorzieningen
- `onderhoud[]`: wat, jaar
- `verkoopargumenten[]`: in de woorden van de verkoper
- `zaken`: mee_te_nemen[], over_te_nemen[] (voorbereiding Lijst van Zaken)
- `planning`: beschikbaarheid_verkoper, sleutelregeling, huisdieren, wensen_foto, wensen_styling, keuring_gewenst, meetrapport_aanwezig

Elk blad krijgt in de extractie-output de vorm `{ waarde, bewijs, zekerheid }`.

## 6. Pijplijn

1. **Ingest Plaud (fase C):** een poller-job haalt per `plaud_koppeling` elke 5–10 minuten nieuwe opnames op (geen webhooks voor nieuwe opnames). Alleen transcript en notitie, geen audio. Opslag in Blob-container `intake` onder `{tenant}/{dossier}/plaud/`.
2. **Dossier koppelen:** match op het adres in de opnametitel, daarna in het transcript (BAG-normalisatie), tegen de woningen op het bord. Geen zekere match = de opname gaat naar de inbox "nog te koppelen" in de UI.
3. **Checklist:** het digitale formulier schrijft direct naar `intake_veld` met status `voorstel`. Een PDF gaat via een Content Understanding-analyzer met hetzelfde schema.
4. **Extractie gesprek:** een Foundry-model met gestructureerde output (schema uit §5). Elk veld moet `bewijs` hebben, anders wordt het weggegooid.
5. **Verrijking:** BAG/PDOK en EP-Online.
6. **Samenvoegen:** regels in code (`packages/domain`), niet in het model:
   - meetrapport > BAG > checklist > gesprek voor oppervlaktes;
   - checklist > gesprek voor merk en type.
   - Verschillen boven de drempel worden `conflict`.
   - Een bevestigd veld wordt nooit door een nieuwe bron overschreven; een afwijking wordt een nieuw `conflict`-voorstel.
7. **Review:** backoffice-UI met per veld de bronlink (tijdstempel in het transcript of PDF-pagina). Acties: bevestigen, corrigeren of afwijzen.
8. **Tekst:** een Foundry-agent met tools: `lees_profiel`, `haal_huisstijl`, `controleer_bronnen`. Output: hoofdtekst plus varianten.
9. **Bronnencontrole:** een tweede, kleinere modelstap. Elke feitelijke bewering in de tekst moet terug te voeren zijn op een bevestigd veld; zo niet, dan wordt hij gemarkeerd in de UI.
10. **Realworks-uitvoer:** een kopieerklaar paneel per Realworks-veld, in schermvolgorde. Een webhook `OBJECT_UPDATE` (Function: 202, dan Service Bus) plus object-GET via `packages/realworks` controleert of de tekst is overgenomen en zet dan de status op `overgenomen_in_realworks`. Het signaal `heeft_tekst` op `object` bestaat al.

## 7. Fasering

### Fase A — Fundament

**Doel:** voor een woning op het bord een intakedossier openen, PDF's en de checklist invoeren, velden laten extraheren en die in de UI reviewen. Plaud-koppeling volgt in fase C; in fase A komt een transcript binnen als upload (export uit Plaud of gespreksverslag-PDF).

Volgorde, één issue en één PR per stap:

| # | Stap | Inhoud | Afhankelijk van |
| --- | --- | --- | --- |
| A0 | ADR's ✅ 2026-10-26 | ADR-013 intake-module (koppeling aan `woning`, `tenant_module`, tabelvoorvoegsel, verwerking als Service Bus-job, rollen). ADR-014 Foundry en Content Understanding in Sweden Central (beschikbaarheid vooraf controleren met de capabilities-API, lesson uit ADR-002; modelkeuze, netwerk, identiteit, kosten). ADR-015 bewaren en opschonen na verkoop. | Akkoord Tim |
| A1 | Migratie 0010 ✅ 2026-10-26 | `tenant_module`, `intake_dossier`, `intake_bron`, `intake_veld`, `intake_verbruik` met RLS en grants zoals in 0001; vlag aan voor de C&R-tenant in dev. Queries in `packages/db/src/intake.ts`. | A0 |
| A2 | `packages/ai` ✅ 2026-10-26 | Workspace-pakket `@makelaarscockpit/ai`: JSON Schema, gegenereerde types, validatie (Ajv), fixtures in `packages/ai/fixtures/intake/` (verzonnen transcripts en checklists, nooit klantdata). | — |
| A3 | Samenvoegregels ✅ 2026-10-26 | `packages/domain/src/intake`: brongewichten, drempels, conflictdetectie, geen overschrijven van bevestigde velden. **Tests eerst.** | A2 |
| A4 | Bicep (dev) ✅ 2026-10-27, handmatig ingericht | Blob-container `intake`, Foundry-resource met project en deployments `extractie`, `controle` en `embedding` (Data Zone Standard EU, 50K TPM), rol Cognitive Services User voor de managed identity, Service Bus-queue `intake-verwerking`. Achter `intakeEnabled`, alleen aan in dev. De eventgestuurde job komt met A7 in `apps.bicep`. Uitvoeren met `docs/handleiding-intake-azure.md`. | A0 |
| A5 | Dossier en upload ✅ 2026-10-27 | Portaal: dossier openen vanaf een woning, PDF of transcriptexport uploaden naar Blob (server action, tenantpad), bericht op de queue. Pagina's alleen zichtbaar met de vlag aan. | A1, A4 |
| A6 | Checklistformulier ✅ 2026-10-27 | Formulier gegenereerd uit het schema; schrijft `intake_veld` met status `voorstel` en bron `checklist_form`. | A1, A2 |
| A7 | Verwerkingsjob | `apps/jobs` commando `verwerk-intake`: extractie (Foundry voor transcript, Content Understanding voor PDF), bewijs verplicht, samenvoegen (A3), verbruik loggen. Idempotent op `intake_bron.id`. Integratietests met opgenomen modelantwoorden uit de fixtures. | A2–A5 |
| A8 | Review-UI | Profiel per groep, status per veld, bronlink (tijdstempel of pagina met citaat), bevestigen, corrigeren of afwijzen; conflicten bovenaan. Elke medewerker van de tenant mag velden bewerken; wie en wanneer wordt per veld vastgelegd. | A1, A7 |
| A9 | Opschonen na verkoop | Regel in `packages/domain` (tests eerst): dossier is op te schonen als de transportdatum verstreken is. De sync-job verwijdert daarna de bronbestanden in Blob, de citaten in `bewijs` en de groep `planning`, en zet het dossier op `opgeschoond`. Een woning die zonder verkoop van het bord verdwijnt: dossier 30 dagen later volledig verwijderen. | A1, A7 |

**Klaar als:** voor 3 testdossiers van C&R staat een volledig profiel in de UI, met bron per veld en zonder handmatige databasehandelingen. Daarnaast: geen tabel zonder `tenant_id` en RLS, geen persoonsgegevens in de logs van een verwerkingsrun, een verkocht testdossier wordt correct opgeschoond, en `npm run lint`, `typecheck` en `test` slagen.

**Voorlopige modelkeuze:** zie ADR-014. Extractie met `gpt-5.4`, controle met `gpt-5.4-mini`, PDF's met Content Understanding, alle als Data Zone Standard (EU) in Sweden Central. Definitieve keuze uit de evaluatieset in fase B, op kwaliteit en op het kostendoel van €3 per dossier.

### Fase B — Tekst
- [ ] Huisstijlconfiguratie per tenant: aanspreekvorm, toon, lengte, vaste opbouw, voorbeeldteksten
- [ ] Foundry-agent voor tekst en varianten; prompts versioneren in `packages/ai/prompts/intake/` met `prompt_versie`
- [ ] Bronnencontrole-stap
- [ ] Evaluatieset: 20 eerdere C&R-woningen met goedgekeurde tekst; Foundry-evaluaties draaien in CI bij wijziging van prompts (de evaluatieset zelf bevat klantdata en staat dus niet in de repo, maar in Blob)
- [ ] Kopieerklaar Realworks-paneel

**Klaar als:** de backoffice keurt 8 van 10 teksten goed met alleen kleine correcties, en de bronnencontrole vindt geen ongedekte feiten in goedgekeurde teksten.

### Fase C — Plaud automatisch
- [ ] OAuth (PKCE)-flow "Koppel Plaud" per gebruiker; refresh-token naar Key Vault
- [ ] Poller-job met idempotentie op `extern_id`
- [ ] Webhook `userAccess: INACTIVE` (Function: 202, dan Service Bus) die transcripties opschoont
- [ ] Automatisch koppelen aan een dossier, plus de inbox voor ongekoppelde opnames

**Klaar als:** een nieuwe opname verschijnt binnen 15 minuten in het juiste dossier, zonder handwerk.

### Fase D — Partnerplanning
- [ ] Partnerregister per tenant
- [ ] Regels per tenant voor volgorde en combinaties (bijv. stylist vóór fotograaf, inmeter samen met fotograaf)
- [ ] Beschikbaarheid via Microsoft Graph of Bookings
- [ ] Concept-uitnodigingen met briefing uit het profiel; versturen alleen na klik op goedkeuren
- [ ] Herkenning van het meetrapport (NEN 2580): officiële m² en m³ naar het profiel

**Klaar als:** na bevestiging van een profiel staan binnen 1 minuut de concept-afspraken klaar, en er gaat niets weg zonder akkoord.

### Fase E — Terugschrijven (geblokkeerd door ADR-005)
- [ ] ADR-005 (geaccepteerd 2026-10-26) stelt dat objectgegevens (zoals de aanbiedingstekst) en documenten niet via de API te schrijven zijn. Deze fase start alleen als Realworks schriftelijk andere endpoints bevestigt; dat komt in een vervolg-ADR.
- [ ] Zo ja: kopieerknoppen vervangen door directe updates; het paneel blijft als fallback. Zo nee: het kopieerklaar paneel is het eindpunt.

## 8. Open vragen (niet zelf invullen, eerst navragen)

**Beantwoord (Tim, 2026-10-26):** geen filter op persoonlijke informatie in transcripten; gespreksverslag altijd bewaren; na verkoop gegevens met persoonsgegevens en verslagen verwijderen; elke medewerker mag velden bewerken, teksten goedkeuren en partnerafspraken versturen; ADR-005 bevestigd. Opschonen bij verstreken transportdatum; het bevestigde profiel en goedgekeurde teksten blijven bewaard; ingetrokken woningen 30 dagen na verdwijnen volledig verwijderen.

- Plaud: eigen OAuth `client_id` voor een SaaS? EU-dataopslag? Verwerkersovereenkomst? Toegang tot opnames in Plaud Team?
- C&R: welke Realworks-status triggert de partnerplanning? Gebruiken zij Outlook-agenda-synchronisatie met Realworks?

**Voorwaarde vóór echte klantdata:** aangepaste misbruikdetectie bij Microsoft aangevraagd en toegekend (ADR-014).

## 9. Kosten (indicatie voor bewaking)

- Doel: **≤ €3 aan AI per dossier**.
- Log per stap het tokenverbruik naar `intake_verbruik` (tenant, dossier, stap, model, input_tokens, output_tokens, kosten_eur).
- Waarschuw bij overschrijding van €5 per dossier.
- Vaste kosten van Foundry en Content Understanding in dev komen in ADR-014 en worden meegenomen in `dev-uit.sh` waar dat kan.

## 10. Werkwijze voor Claude Code

- Werk vanuit een GitHub-issue per stap. Begin elke fase met een korte planning in de chat en wacht op akkoord.
- Kleine PR's per checklistitem, met tests: unit voor de samenvoegregels (vóór de implementatie), integratietests met opgenomen fixtures. Gebruik nooit echte klantdata in de repo.
- Fixtures: geanonimiseerde of verzonnen transcripties en checklists in `packages/ai/fixtures/intake/`.
- Wijzigingen in het schema = een migratie plus geregenereerde types plus een update van de evaluatieset, in dezelfde PR.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Twijfel over een randvoorwaarde uit §3: stop en vraag het na.

## 11. Wijzigingen ten opzichte van de eerste versie

- Regio West Europe → North Europe (ADR-001, ADR-002); Foundry in Sweden Central wordt een nieuwe ADR.
- Repo `makelaarscockpit/platform` → `CherryMedia1/makelaarscockpit`.
- Backend "Fastify/NestJS" → portaal via `packages/db` (ADR-008); verwerking als Container Apps-job in plaats van Durable Functions; Functions alleen voor webhooks.
- `dossier` hangt aan de bestaande `woning` (ADR-012) in plaats van een eigen adres en Realworks-object-id.
- Alle tabellen krijgen een eigen `tenant_id` met RLS; tabelvoorvoegsel `intake_` in plaats van schema `intake`; `tenant_module` en `intake_verbruik` toegevoegd aan het datamodel.
- Schema, prompts en fixtures in het bestaande `packages/ai` in plaats van `packages/intake-schema`, `prompts/intake/` en `fixtures/intake/`.
- ADR-005 is geen open ADR maar een voorstel dat stelt dat objecttekst niet te schrijven is; fase E aangepast.
- AVG: geen filterstap meer; gespreksverslag bewaren; opschonen na verkoop (besluit Tim, 2026-10-26).
- Fase A uitgewerkt in stappen A0–A9, met een voorstel voor de voorlopige modelkeuze.
