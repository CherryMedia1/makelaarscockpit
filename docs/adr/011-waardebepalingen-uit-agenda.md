# ADR-011 Waardebepalingen uit de Realworks-agenda, uitkomst als eigen invoer
Datum: 2026-10-08 · Status: geaccepteerd
## Context
C&R houdt in de Excel "Waardebepaallijst" per waardebepaling bij: datum, makelaar, adres, status (gewonnen, verloren, in afwachting, oriënterend, …), aan welke makelaar verloren en hoe binnengehaald; het tabblad "Score per makelaar" rekent gewonnen ÷ (gewonnen + verloren). In Realworks staat elke waardebepaling als agendapunt van het type "Waardebepaling" (631 in 2026, 151 in 2025), met de locatie, de medewerker ("Agendapunt voor"), de klant ("Id van de gekoppelde relatie") en meestal een `project.projectcode` die naar het Wonen-object verwijst. De Agenda-API kent geen filters: elke run leest de hele agenda (circa 12.600 punten, 126 pagina's).
## Beslissing
1. **De agenda is de bron voor het bestaan van een waardebepaling.** De dagelijkse sync spiegelt agendapunten van het type Waardebepaling in de tabel `waardebepaling`; andere agendapunten worden niet bewaard (en de notities in `extraInfo` nooit).
2. **De uitkomst is eigen invoer**: status, verloren aan en binnengehaald via worden in het portaal gezet. Een handmatig gezette status wordt door de sync nooit overschreven (`status_bron = 'handmatig'`).
3. **Automatisch gewonnen**: past een Wonen-object bij de waardebepaling (dezelfde projectcode, of hetzelfde adres en plaats en gepubliceerd ná de waardebepaling), dan wordt de status gewonnen en het object gekoppeld, zolang niemand de status met de hand heeft gezet.
4. **Realworks is leidend** (besluit Tim, 2026-10-08). Alleen agendapunten tellen als waardebepaling. De Excel wordt geïmporteerd om de al vastgelegde uitkomsten te behouden: een rij vult het agendapunt met hetzelfde adres aan, eerst op dezelfde dag en anders het dichtstbijzijnde binnen 31 dagen. Rijen zonder agendapunt worden niet overgenomen. Staat de woning volgens Realworks in de verkoop, dan blijft de status gewonnen, ook als de Excel iets anders zegt. In Realworks geannuleerde afspraken tellen niet mee.
5. **De locatie van Realworks** ("postcode  plaats straat huisnummer") wordt gesplitst met de plaatsen die het kantoor al kent; onbekende plaatsen vallen terug op het eerste woord.
## Gevolgen
- Migratie 0008; domeinregels en de dashboardcijfers in `packages/domain/src/waardebepaling` met tests; de sync-job leest nu ook de agenda (enkele minuten extra per dag).
- Later kan dezelfde agendaspiegel bezichtigingen en andere afspraken leveren voor dashboard 3, zonder nieuw ontwerp.
- De score per makelaar telt de makelaar van het agendapunt; is die niet als medewerker bekend, dan telt "Onbekend".
