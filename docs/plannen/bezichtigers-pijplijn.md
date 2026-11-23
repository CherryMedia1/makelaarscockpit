# Plan: pijplijn voor bezichtigersleads

Issue #54 · Datum: 2026-11-23 · Status: **akkoord van Tim (2026-11-23); een lead hangt aan de persoon**. Het ADR-concept hieronder is vastgelegd als ADR-020. Bouwt voort op het leadoverzicht (#48, ADR-019), de bewaartermijn van zes maanden (#50) en synchroniseren op verzoek (#51).

## Doel

Het leadoverzicht wordt een pijplijn. Elke bezichtiger heeft een lead-kaart; daar zet een medewerker de fase, en daarmee wordt de bezichtiger een pijplijn-item. De fases zijn per kantoor in te stellen. De kaart toont de contactgegevens uit Realworks en links naar social media.

Fases voor C&R om te testen: Social media marketing, Telefonisch benaderd, Voorstel gestuurd, Gewonnen, Verloren.

## Besluiten van Tim (2026-11-23)

1. Toestemming om bezichtigers te benaderen is er. De applicatie dwingt geen toestemming per kanaal af.
2. "Social media marketing" betekent benaderen via advertentiedoelgroepen, niet persoonlijk en direct.
3. Social media-links komen uit Realworks als ze daar staan; anders vult een medewerker ze in. Geen externe bronnen.
4. Het beheerscherm voor de fases komt er meteen, plus een lead-kaart per bezichtiger waarop de status wordt gezet.
5. Wat "gewonnen" betekent, bepaalt het kantoor zelf.

## Wat het wel en niet is

- **Wel:** vastleggen in welke fase een lead zit, wie de eigenaar is, een notitie, en wie wat wanneer verplaatste.
- **Niet:** de applicatie belt, mailt of adverteert niet, exporteert geen lijsten en uploadt geen doelgroepen. Een fase is een registratie van wat het kantoor zelf doet. Exports, mailing en een koppeling met Meta zijn een volgend plan, met een eigen ADR.
- **Realworks blijft alleen-lezen** (ADR-005). Er wordt niets teruggeschreven.

## ADR-concept: ADR-020 Pijplijn voor bezichtigersleads, fases per kantoor

**Context.** Het leadoverzicht toont wie er is komen kijken (ADR-019). Kantoren willen die leads opvolgen in vaste stappen, en elk kantoor werkt anders. De oorspronkelijke randvoorwaarden voor de module vroegen een vastgelegde toestemming per kanaal, afgedwongen in het domein.

**Beslissing.**
1. **Fases per tenant** in `pijplijn_fase`: naam, volgorde, soort (`open`, `gewonnen`, `verloren`) en actief. De kantoorbeheerder beheert ze in het portaal; bij de onboarding van een kantoor wordt de eerste set vastgelegd. Een fase die in gebruik is, kan niet worden verwijderd, wel uitgezet.
2. **Een pijplijn-item is een `lead`**: hoogstens één per bezichtiger, met fase, eigenaar (medewerker), notitie en contactgegevens. Elke wijziging van fase komt in `lead_historie` (van, naar, wie, wanneer).
3. **Geen afdwinging van toestemming per kanaal** (besluit Tim, 2026-11-23: de toestemming om bezichtigers te benaderen is er). Dit vervangt voor de pijplijn randvoorwaarde 2 uit de oorspronkelijke opdracht. De applicatie voert zelf geen uitgaande actie uit. Het kantoor is als verwerkingsverantwoordelijke zelf verantwoordelijk voor de grondslag van het bellen en adverteren.
4. **Contactgegevens** (e-mail, telefoon, website) worden alleen opgehaald voor bezichtigers met een lead, uit de Relatie-API via `packages/realworks`. Realworks is leidend; de sync ververst ze. Dit is een aanvulling op ADR-019 punt 3.
5. **Social media-links**: uit Realworks als de relatie ze heeft, anders handmatig ingevuld door een medewerker. Geen opzoeken bij externe bronnen.
6. **Bewaren:** een bezichtiger met een lead wordt niet door de zesmaandenregel verwijderd zolang de lead bestaat. De bezichtigingen zelf volgen wel de zes maanden. Hoe lang een open of afgesloten lead blijft staan: zie de open vragen.
7. **Rollen** (ADR-006): elke medewerker zet fases en vult de kaart in; alleen de kantoorbeheerder beheert de fases.

**Gevolgen.**
- De database bevat voor leads ook e-mail en telefoon. Dat hoort in de verwerkersovereenkomst en vergroot wat bij de keuze uit de beslisnotitie (prod opzetten, dev legen) moet verhuizen.
- Zonder afdwinging kan een medewerker een lead op "Telefonisch benaderd" zetten ongeacht een beltoestemming. Of de toestemming die het kantoor heeft voldoet aan de Telecommunicatiewet (sinds 1-7-2026), is een vraag voor de jurist; de applicatie controleert het niet.
- `geenMailing` uit Realworks wordt in deze fase niet gebruikt, omdat de applicatie niet mailt. Bij een latere mailingfunctie blokkeert het wel.
- In logs alleen id's en aantallen (harde regel 2); de historie bevat id's van fase en gebruiker, geen vrije tekst.

## Datamodel (migratie 0015 en 0016)

| Tabel | Kolommen | Opmerking |
|---|---|---|
| `pijplijn_fase` | `tenant_id`, `naam`, `volgorde`, `soort` (`open`/`gewonnen`/`verloren`), `actief` | uniek op (`tenant_id`, `naam`); index op (`tenant_id`, `volgorde`) |
| `lead` | `tenant_id`, `bezichtiger_id` (uniek per tenant), `fase_id`, `eigenaar_medewerker_id`, `notitie`, `email`, `telefoon`, `website`, `linkedin_url`, `facebook_url`, `instagram_url`, `contact_opgehaald_op`, `aangemaakt_door`, `aangemaakt_op`, `gewijzigd_op` | index op (`tenant_id`, `fase_id`) |
| `lead_historie` | `tenant_id`, `lead_id`, `van_fase_id`, `naar_fase_id`, `door_gebruiker_id`, `op` | index op (`tenant_id`, `lead_id`, `op`) |

Alle drie met `tenant_id`, row-level security (`tenant_isolatie`, FORCE) en grants op `cockpit_app`. De migratie zet de vijf fases voor C&R. Bestaande gegevens veranderen niet; `vervangBezichtigingen` laat bezichtigers met een lead staan.

## Domeinlogica (`packages/domain/src/bezichtigers`, tests eerst)

- Fases: valideren (naam, soort), volgorde wijzigen, mag een fase weg of alleen uit.
- Lead: aanmaken met een fase, verplaatsen (levert een historieregel), afgesloten of open.
- Bord: leads per fase in de volgorde van de fases; uitgezette fases met leads blijven zichtbaar.
- Social media-links: alleen `https`, en het domein moet bij het platform passen (linkedin.com, facebook.com, instagram.com).
- Welke bezichtigers de zesmaandenregel overleven.

## Schermen

1. **Instellingen → Pijplijn** (kantoorbeheerder): fases toevoegen, hernoemen, soort kiezen, volgorde wijzigen, uitzetten.
2. **Lead-kaart** (`/leads/[id]`, voor elke bezichtiger): naam, fase kiezen, eigenaar, notitie, contactgegevens, social media-links, de bezichtigingen als tijdlijn en de historie van de fase. Een bezichtiger zonder fase staat op "Nog niet in de pijplijn".
3. **Overzicht Leads**: een kolom Fase, een filter op fase en een link naar de kaart.
4. **Pijplijnbord** (`/leads/pijplijn`): een kolom per fase met de leads als kaartjes (naam, laatste bezichtiging, woning, eigenaar).

Alles met de bestaande componenten en tokens uit BRAND.md.

## Contactgegevens ophalen

- Bij het aanmaken van een lead zet het portaal een bericht met alleen id's op de queue `bezichtigers-sync`; de job `sync-bezichtigers` haalt e-mail, telefoon en website van die ene relatie op. De kaart toont tot dan "Contactgegevens worden opgehaald".
- De dagelijkse sync en de knop Synchroniseren verversen de contactgegevens van alle leads.
- De eerste keer wordt in de uitkomst geteld (zonder waarden) of relaties velden voor social media hebben; zo ja, dan worden die overgenomen.

## Opsplitsing in PR's

| PR | Inhoud | Commit |
|---|---|---|
| A | ADR-020, migratie 0015 (`pijplijn_fase`), domeinregels fases, scherm Instellingen → Pijplijn | `feat: pijplijnfases per kantoor met beheerscherm (#54)` |
| B | Migratie 0016 (`lead`, `lead_historie`), domeinregels lead, lead-kaart, kolom en filter Fase, sync spaart bezichtigers met een lead | `feat: lead-kaart met fase, eigenaar en historie (#54)` |
| C | Pijplijnbord | `feat: pijplijnbord per fase (#54)` |
| D | Contactgegevens uit Realworks (client, job, bericht), social media-links | `feat: contactgegevens en social media-links op de lead-kaart (#54)` |

## Harde regels die spelen

1 (elke nieuwe tabel `tenant_id`, queries via `metTenant`), 2 (logs en historie zonder persoonsgegevens), 4 (alleen lezen via `packages/realworks`), 7 (tests eerst), 9 (huisstijl), 10 (ADR-020).

## Open vragen

| Vraag | Wie |
|---|---|
| Hoe lang blijft een lead staan: open zonder wijziging, en na Gewonnen of Verloren? Tot er een antwoord is: zolang de lead bestaat, en een medewerker kan een lead uit de pijplijn halen. | C&R, jurist |
| Voldoet de toestemming van het kantoor voor telefonisch benaderen aan de Telecommunicatiewet (expliciete beltoestemming sinds 1-7-2026)? | jurist |
| Is toestemming nodig voor het gebruik van contactgegevens in advertentiedoelgroepen, en hoe legt het kantoor die vast? | jurist |
| Heeft de Relatie-API velden voor social media, en hoe heten ze? | blijkt bij PR D; anders Realworks |
| Moet een lead ook aan een woning hangen (de woning van de bezichtiging), of alleen aan de persoon? Voorstel: alleen aan de persoon. | Tim, C&R |
