# ADR-013 Intake-module: woningprofiel uit intakegesprek en checklist, als betaalde module per tenant
Datum: 2026-10-26 · Status: geaccepteerd
## Context
De intake-module (werknaam Startklaar, plan in `docs/plannen/intake-module.md`) zet per verkoopopdracht het intakegesprek en de woningchecklist om in een woningprofiel, en daaruit in een woningtekst en concept-partnerafspraken. Het is een betaalde add-on bovenop de dashboards; C&R is de eerste klant.

Bij het herzien van het plan tegen de repo speelden vier feiten:
- Een verkoopopdracht bestaat al als `woning` op het bord van dashboard 3 (ADR-012), inclusief woningen in voorbereiding die alleen uit een verkoopgesprek in de agenda bekend zijn. Dat is precies het moment van de intake.
- Het databaseschema gebruikt één schema met de rol `cockpit_app` en `metTenant`; een tweede databaseschema vraagt extra grants en een `search_path` zonder dat het iets oplevert.
- Achtergrondwerk draait als Container Apps-job in het VNet (ADR-008); de bestaande jobs draaien voor één tenant uit de omgeving. De Function App is alleen voor webhooks.
- Het model mag het profiel voorstellen, maar niet beslissen: elk feit in de woningtekst moet door een medewerker bevestigd zijn.
## Beslissing
1. **Module per tenant aan of uit** in een nieuwe tabel `tenant_module` (`tenant_id`, `module`, `aan_sinds`). Portaalpagina's, jobs en webhooks van de module controleren de vlag. Modules die later volgen gebruiken dezelfde tabel.
2. **Een intakedossier hangt aan een `woning`** (één dossier per woning, `woning_id` uniek). Geen eigen adres of Realworks-object-id in het dossier: die komen van de woning. Een opname die nog niet aan een woning te koppelen is, staat zonder dossier in de inbox.
3. **Tabellen met voorvoegsel `intake_`** in het bestaande schema, elk met een eigen `tenant_id`, row-level security (`tenant_isolatie`) en grants op `cockpit_app`, ook kindtabellen van het dossier.
4. **Verwerking via Service Bus:** upload, formulier en (later) de Plaud-poller zetten een bericht op de queue `intake-verwerking` met alleen id's (tenant, dossier, bron). Een eventgestuurde Container Apps-job `verwerk-intake` in `apps/jobs` verwerkt het bericht. De job is multi-tenant: de tenant komt uit het bericht en elke databasehandeling loopt via `metTenant`. Geen Durable Functions.
5. **Eén schema als bron van waarheid:** het woningprofiel staat als JSON Schema in `packages/ai`; types, de extractie-output van het model, het checklistformulier en de review-UI worden ervan afgeleid. Samenvoegregels (welke bron wint, wanneer een conflict ontstaat) zijn pure functies in `packages/domain`.
6. **Mens in de lus:** een veld uit een bron is een voorstel. Alleen een medewerker zet het op bevestigd; een bevestigd veld wordt nooit door een nieuwe bron overschreven, een afwijking wordt een conflict. De tekstgenerator leest alleen bevestigde velden.
7. **Rollen (aanvulling op ADR-006):** elke medewerker van de tenant mag velden bevestigen, corrigeren en afwijzen, teksten goedkeuren en partnerafspraken versturen (besluit Tim, 2026-10-26). Per handeling wordt vastgelegd wie en wanneer.
## Gevolgen
- Migratie 0010 maakt `tenant_module`, `intake_dossier`, `intake_bron`, `intake_veld` en `intake_verbruik`; tabellen voor tekst, Plaud en partners volgen in hun eigen fase.
- `packages/ai` wordt een workspace-pakket (`@makelaarscockpit/ai`) met schema, gegenereerde types en fixtures.
- Infra: Service Bus-queue `intake-verwerking` en een eventgestuurde job met KEDA-scaler op die queue; bij een lege queue kost de job niets.
- Een dossier is alleen te openen voor een woning op het bord. Verdwijnt een woning van het bord, dan blijft het dossier bestaan tot de opschoonregels van ADR-015 het verwijderen.
- Bevestigingen zijn per medewerker herleidbaar, maar er is geen tweede paar ogen; als de praktijk erom vraagt, volgt een rol "backoffice" met een eigen ADR.
