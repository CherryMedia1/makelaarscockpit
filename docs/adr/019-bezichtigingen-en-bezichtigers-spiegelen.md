# ADR-019 Bezichtigingen en de naam van de bezichtiger spiegelen voor een leadoverzicht
Datum: 2026-11-23 · Status: geaccepteerd (Tim, 2026-11-23, issue #48)
## Context
Een bezichtiger is een mogelijke koper en vaak ook een mogelijke verkoper van zijn huidige woning. Kantoren willen zien wie er is komen kijken. ADR-012 §4 sluit bezichtigingen en klantgegevens bewust uit van de agendaspiegel, dus daarvoor is een nieuw besluit nodig.

De spike (`docs/spike-bezichtigersleads-realworks.md`, ronde 1) liet zien dat elk agendapunt van een bezichtiging precies één gekoppelde relatie heeft en vrijwel altijd een project (object). De Relatie-API levert de naam; een marketingvrijgave of toestemming per kanaal levert Realworks niet.

Dit is de eerste plak van de module Bezichtigersleads. Het volledige ontwerp (toestemming per kanaal, mailing, bellijst, Meta-audience, leadscore, bewaartermijn per tenant) volgt in een eigen plan en ADR.

Besluiten van Tim (2026-11-23):
- De naam van de bezichtiger hoort in het overzicht.
- Voor nu akkoord met echte gegevens in dev (zie `docs/beslisnotitie-klantdata-dev.md`).
- Elke soort bezichtiging telt als lead; dezelfde relatie is één lead, en zichtbaar is dat een relatie vaker is komen kijken.
## Beslissing
1. **Module per tenant** (ADR-013): `bezichtigers` in `tenant_module`. Zonder de module spiegelt de sync geen bezichtigingen en toont het portaal geen leads. C&R is de eerste klant.
2. **Wat een bezichtiging is:** een agendapunt waarvan het type "bezicht" of "open huis" bevat (1e, 2e, planner, planner-blok, aankoop, huur, open huis), met een gekoppelde relatie die geen medewerker is, en dat niet geannuleerd is. De regel staat in `packages/domain/src/bezichtigers` met tests.
3. **Wat we bewaren:**
   - `bezichtiging`: Realworks-id, type, status, tijdstip, project, locatie (het adres van de bezichtigde woning) en de medewerker;
   - `bezichtiger`: het relatie-id en de naam.

   Niet bewaard: de notities van het agendapunt (`extraInfo`, `korteOmschrijving`), en van de relatie alles behalve de naam (geen e-mail, telefoon, adres of geslacht). Ruwe antwoorden van bezichtigingen en relaties gaan niet naar de blob.
4. **Alleen intern gebruik, alleen lezen.** Het overzicht is voor medewerkers van het kantoor zelf. Deze plak bevat geen enkele actie naar buiten: geen mailing, export, bellijst of advertentiedoelgroep. Die komen er pas met vastgelegde toestemming per kanaal en goedkeuring door een medewerker, in een volgende ADR.
5. **Realworks is leidend voor het bestaan.** De sync vervangt bij elke run de stand, idempotent op het Realworks-id. Een bezichtiging die Realworks niet meer levert (geannuleerd, verwijderd, of ouder dan de vrijgegeven periode van de Agenda-API) verdwijnt bij ons; een bezichtiger zonder bezichtigingen verdwijnt met zijn naam. 
   **Bewaartermijn zes maanden** (besluit Tim, 2026-11-23, issue #50): de sync bewaart alleen bezichtigingen van de laatste zes maanden en wat nog gepland staat. Wat ouder is, verdwijnt bij de eerstvolgende run.
6. **Namen ophalen:** per relatie één GET op de Relatie-API via `packages/realworks`, alleen voor bezichtigers zonder naam of met een naam ouder dan 30 dagen, een paar tegelijk en binnen een tijdsbudget per run. Er wordt niets naar Realworks geschreven (ADR-005).
7. **Rollen:** elke medewerker van de tenant ziet het overzicht, net als de andere dashboards (ADR-006).
8. **Synchroniseren op verzoek** (akkoord Tim, 2026-11-23, issue #51): elke medewerker kan op de pagina Leads een run aanvragen, naast de dagelijkse sync. Het portaal legt de aanvraag vast in `bezichtiger_sync` en zet een bericht met alleen id's op de queue `bezichtigers-sync`; de eventgestuurde job `sync-bezichtigers` verwerkt het (patroon ADR-013). De tenant komt uit de sessie en gaat mee in het bericht. De job spiegelt alleen bezichtigingen en namen. Hooguit één run per kwartier per kantoor; een run die na een half uur niet klaar is, blokkeert de knop niet langer. Een mislukte run wordt niet vanzelf herhaald. De regel staat in `packages/domain/src/bezichtigers/sync.ts`.
## Gevolgen
- Migratie 0014 maakt `bezichtiger_sync` (wie, wanneer, status, aantallen, een technische foutcode). Infra: de queue in `servicebus.bicep` (uitrol via deploy-dev) en de job in `apps.bicep` (uitrol via deploy-apps-dev). Staat dev zuinig (NAT Gateway uit), dan bereikt de job Realworks niet en toont de pagina dat de run is mislukt.
- ADR-012 §4 blijft gelden voor het bord "Woningen in verkoop"; bezichtigingen staan in eigen tabellen en alleen voor tenants met de module.
- Migratie 0013 maakt `bezichtiger` en `bezichtiging` met `tenant_id`, row-level security en grants, en zet de module aan voor C&R. Bestaande gegevens veranderen niet.
- De database in dev bevat hierna namen van bezichtigers van C&R. Dat vergroot wat er bij de keuze uit de beslisnotitie (prod opzetten, dev legen) moet verhuizen of gewist worden, en hoort in de verwerkersovereenkomst.
- De eerste run haalt een naam op voor elke bezichtiger (bij C&R ruim tweeduizend calls). Of Realworks daar een limiet op heeft, is niet bekend; bij een 429 of een vol tijdsbudget stopt het ophalen en gaat het de volgende run verder. Tot dan toont het overzicht "Naam nog niet opgehaald".
- Welke code de Relatie-API als `bedrijfscode` verwacht, is niet vastgesteld; de sync probeert de bedrijfscode en daarna de afdelingscode.
- In logs staan alleen aantallen en een HTTP-status, nooit een naam of relatie-id (harde regel 2).
- **Open, voor het volledige plan:** of de bewaartermijn van zes maanden een instelling per tenant wordt en of ze anders is met toestemming (vraag voor C&R en jurist), toestemming per kanaal, de signalen uit Realworks voor intrekken (`geenMailing`), en of aankoop- en huurbezichtigingen op termijn apart getoond worden.
