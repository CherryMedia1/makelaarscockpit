# ADR-012 Woningen in verkoop: stappen per woning, Realworks leidend
Datum: 2026-10-08 · Status: geaccepteerd
## Context
C&R bewaakt in de Excel "Nieuwe woningen in verkoop" per woning elf stappen (foto's met meetrapport en plattegrond, woningvideo, energielabel, styling, tekst, woningzoeker, socials en website, Funda, reel, bord, verkoopgesprek), met de makelaar en de backoffice-medewerker. De cellen zijn vrije tekst (V, X, een datum, een naam). Realworks kent een deel van die stappen zelf: mediasoorten, energieklasse, aanbiedingstekst en publicatiedatum op het Wonen-object, en afspraken in de agenda (verkoopgesprek, foto's/video, video) die via `project.projectcode` aan de woning hangen. Een woning in voorbereiding staat nog niet in de Wonen-API; ze verschijnt pas rond publicatie. De agenda kent haar eerder.
## Beslissing
1. **Realworks is leidend** (besluit Tim, 2026-10-08). Een stap die Realworks als klaar ziet, is klaar en niet met de hand te wijzigen. Voorrang per stap: klaar volgens Realworks, dan handmatige invoer, dan een planning uit de agenda, anders open.
2. **Handmatige stappen** hebben de status open, gepland (met datum), klaar of niet van toepassing. Alleen die invoer wordt opgeslagen (`woning_stap`); wat Realworks ziet, wordt bij het tonen afgeleid en nooit gekopieerd.
3. **Het bord** (`woning`, beheerd door de sync) bevat elke woning die Realworks nu als object levert en niet is ingetrokken, plus woningen in voorbereiding: een verkoopgesprek of foto-afspraak van de laatste 60 dagen voor een project dat nog geen object is. De sleutel is de projectcode (objectcode). Verdwijnt een woning uit Realworks, dan verdwijnt ze van het bord; de ingevulde stappen blijven bewaard.
4. **Agendaspiegel**: de sync bewaart alleen afspraken van de types die bij een woning horen (verkoopgesprek, foto's/video, video, energielabel, bord, open huis, tekenafspraak, overdracht), met type, datum, status en project. Geen bezichtigingen, geen notities, geen klantgegevens.
5. **De Excel wordt geïmporteerd** voor woningen die op het bord staan: V of een datum wordt klaar (een datum in de toekomst gepland), X wordt niet van toepassing, andere tekst blijft open. Rijen zonder woning in Realworks worden overgeslagen; in het portaal gezette stappen blijven staan.
6. **Backoffice per woning** is eigen invoer, te kiezen uit de medewerkers van het kantoor. Het tabblad BORDEN valt buiten dit dashboard.
## Gevolgen
- Migratie 0009: signaalkolommen op `object`, tabellen `agendapunt`, `woning` en `woning_stap` met row-level security.
- Domeinregels in `packages/domain/src/woningen` met tests; de sync-job werkt na de agenda het bord bij.
- De 60-dagenregel voor woningen in voorbereiding is een aanname; een woning die langer in voorbereiding is zonder nieuwe afspraak valt van het bord tot ze online komt.
- Het koopovereenkomst-spoor (verkocht onder voorbehoud tot en met de bedenktijd) volgt als tweede spoor op hetzelfde model.
