# ADR-010 Verkopen uit Realworks naast de Excel-historie
Datum: 2026-10-02 · Status: geaccepteerd
## Context
De Wonen-API van Realworks levert per verkocht object de verkoopprijs (`transactieprijs`), de verkoopdatum (`transactiedatum`), de passeerdatum (`transportdatum`), de status (`VERKOCHT` of `VERKOCHT_ONDER_VOORBEHOUD`) en de gekoppelde makelaar (`gekoppeldeMakelaar`, de relatiecode van een medewerker). Dat zijn precies de kolommen die C&R nu in de Excel bijhoudt, behalve courtage, opstartnota en verdeling (ADR-007).

Gemeten op 2026-10-02 met het token van C&R: de lijst bevat alleen de actuele portefeuille (80 objecten, waarvan 2 verkocht en 18 onder voorbehoud). Het filter `actief=false` wordt herkend maar geeft 0 objecten: het archief komt niet mee. Een woning verdwijnt dus uit de API zodra die na het passeren wordt gearchiveerd. Of het archief alsnog vrijgegeven kan worden (API Manager) is een open vraag aan C&R en Realworks.
## Beslissing
1. **Twee bronnen, gescheiden op datum.** De Excel blijft de bron voor verkopen tot een startdatum per tenant (`tenant.koppeling_verkopen_vanaf`, voor C&R 2026-10-01). Verkochte objecten met een transactiedatum vanaf die dag komen uit Realworks. Zo telt geen verkoop dubbel. Staat de startdatum leeg, dan maakt de koppeling geen verkopen aan.
2. **Een verkocht object wordt automatisch een verkoopregel** (`herkomst = 'koppeling'`, soort koop, aandeel 1 voor de gekoppelde makelaar) met de Realworks-velden. Courtage, opstartnota, notastatus en verdeling blijven leeg tot een medewerker ze in het portaal invult (issue #7); de sync overschrijft die invoer nooit. Het dashboard toont deze verkopen als "courtage invullen".
3. **Onder voorbehoud telt mee** als verkocht, net als in de Excel bij "Maand verkocht", maar is herkenbaar (`onder_voorbehoud`). Valt een verkoop alsnog af (status niet meer verkocht) en is er nog niets ingevuld, dan verwijdert de sync de regel; is er wél iets ingevuld, dan blijft de regel staan en meldt de log dat.
4. **De sync draait dagelijks** (Container Apps-job met schema, 05:00 UTC), zodat een verkoop wordt vastgelegd vóór het object in het archief verdwijnt. Handmatig starten blijft mogelijk.
5. **Makelaar op relatiecode.** `medewerker.relatiecode` (uit `overige.relatiecode` van `/relaties/v1/medewerker`) is de sleutel waarmee een object naar zijn makelaar verwijst; het `id` van de medewerker is dat niet.
## Gevolgen
- Migratie 0006: `medewerker.relatiecode`, `verkoop.onder_voorbehoud`, `tenant.koppeling_verkopen_vanaf` en een unieke index per object voor koppelingsverkopen.
- De rekenregel staat in `packages/domain/src/verkoop/realworks-verkoop.ts` met tests; de sync-job in `apps/jobs` gebruikt die.
- In de zuinige stand (Postgres gestopt) mislukt de dagelijkse run; dat is bewust en zichtbaar in de job-historie. Wordt dev langer dan een dag uitgezet, dan haalt de eerstvolgende run alles in zolang de objecten nog niet gearchiveerd zijn.
- Als Realworks het archief later wél vrijgeeft, kan de startdatum naar achteren en kan de Excel-historie worden vervangen; daar is geen ontwerpwijziging voor nodig.
