# ADR-020 Pijplijn voor bezichtigersleads, fases per kantoor
Datum: 2026-11-23 · Status: geaccepteerd (Tim, 2026-11-23, issue #54)
## Context
Het leadoverzicht toont wie er is komen kijken (ADR-019). Kantoren willen die leads opvolgen in vaste stappen, en elk kantoor werkt anders. De oorspronkelijke randvoorwaarden voor de module vroegen een vastgelegde toestemming per kanaal, afgedwongen in het domein. Het plan staat in `docs/plannen/bezichtigers-pijplijn.md`.

Besluiten van Tim (2026-11-23):
- Toestemming om bezichtigers te benaderen is er; de applicatie dwingt geen toestemming per kanaal af.
- "Social media marketing" betekent benaderen via advertentiedoelgroepen, niet persoonlijk en direct.
- Social media-links komen uit Realworks als ze daar staan; anders vult een medewerker ze in.
- Het beheerscherm voor de fases komt er meteen, met een lead-kaart per bezichtiger.
- Wat "gewonnen" betekent, bepaalt het kantoor zelf. Een lead hangt aan de persoon, niet aan een woning.
## Beslissing
1. **Fases per tenant** in `pijplijn_fase`: naam, volgorde, soort (`open`, `gewonnen`, `verloren`) en actief. De kantoorbeheerder beheert ze in het portaal (Instellingen → Pijplijn). Bij de onboarding krijgt een kantoor de startset uit `STANDAARD_FASES` of een eigen set. Een uitgezette fase is niet meer te kiezen, maar blijft staan bij leads die erin zitten.
2. **Een pijplijn-item is een `lead`**: hoogstens één per bezichtiger, met fase, eigenaar (medewerker), notitie en contactgegevens. Elke wijziging van fase komt in `lead_historie` (van, naar, wie, wanneer).
3. **Geen afdwinging van toestemming per kanaal.** Dit vervangt voor de pijplijn randvoorwaarde 2 uit de oorspronkelijke opdracht. De applicatie voert zelf geen uitgaande actie uit: ze belt, mailt en adverteert niet, exporteert geen lijsten en uploadt geen doelgroepen. Een fase is een registratie van wat het kantoor zelf doet. Het kantoor is als verwerkingsverantwoordelijke zelf verantwoordelijk voor de grondslag van het bellen en adverteren.
4. **Contactgegevens** (e-mail, telefoon, website) worden alleen opgehaald voor bezichtigers met een lead, uit de Relatie-API via `packages/realworks`. Realworks is leidend; de sync ververst ze. Dit vult ADR-019 punt 3 aan.
5. **Social media-links**: uit Realworks als de relatie ze heeft, anders handmatig ingevuld. Geen opzoeken bij externe bronnen.
6. **Bewaren:** een bezichtiger met een lead wordt niet door de zesmaandenregel verwijderd zolang de lead bestaat. De bezichtigingen zelf volgen wel de zes maanden.
7. **Rollen** (ADR-006): elke medewerker zet fases en vult de kaart in; alleen de kantoorbeheerder beheert de fases.
8. **Realworks blijft alleen-lezen** (ADR-005); er wordt niets teruggeschreven.
## Gevolgen
- Migratie 0015 maakt `pijplijn_fase` met `tenant_id`, row-level security en grants, en zet de vijf testfases voor C&R. `lead` en `lead_historie` volgen in een eigen migratie.
- De database bevat voor leads straks ook e-mail en telefoon. Dat hoort in de verwerkersovereenkomst en vergroot wat bij de keuze uit de beslisnotitie (prod opzetten, dev legen) moet verhuizen.
- Zonder afdwinging kan een medewerker een lead op "Telefonisch benaderd" zetten ongeacht een beltoestemming. Of de toestemming van het kantoor voldoet aan de Telecommunicatiewet (expliciete beltoestemming sinds 1-7-2026), is een vraag voor de jurist; de applicatie controleert het niet.
- `geenMailing` uit Realworks wordt niet gebruikt, omdat de applicatie niet mailt. Bij een latere mailingfunctie blokkeert het wel.
- Exports, mailing en een koppeling met Meta vragen een eigen plan en ADR; dan komt de toestemming per kanaal opnieuw op tafel.
- **Open:** hoe lang een open of afgesloten lead blijft staan (C&R, jurist). Tot dan: zolang de lead bestaat; een medewerker kan een lead uit de pijplijn halen.
