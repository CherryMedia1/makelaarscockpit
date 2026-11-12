# Beslisnotitie: echte klantdata in dev

Datum: 2026-11-12 · Issue #39 · Beslisser: Tim · Onderbouwing: [inventarisatie-klantdata-dev.md](inventarisatie-klantdata-dev.md)

## De vraag

Dev (`rg-cockpit-dev-neu`) bevat de echte gegevens van C&R, omdat de pilot daar draait en er geen prod-omgeving is. Twee opties:

- **A. Dev zonder echte data.** De pilot verhuist naar een nieuwe prod-omgeving. Dev krijgt verzonnen of gepseudonimiseerde data.
- **B. Dev als volwaardige omgeving.** De data blijft waar ze is, en dev krijgt dezelfde beveiliging als prod.

## Aanbeveling

**Optie A.** Zet een prod-omgeving op voor de pilot en maak dev daarna leeg.

De reden is dat optie B het probleem niet oplost maar verplaatst. Een omgeving met echte klantdata waar elke push naar `main` direct heen gaat en migraties uitvoert, is een productieomgeving zonder testomgeving ervoor. Wie optie B serieus uitvoert, heeft daarna alsnog een tweede omgeving nodig om veilig te kunnen ontwikkelen, en komt dus op hetzelfde uit als A, met de namen omgedraaid. A doet dat in één keer en houdt de namen kloppend met de regels die er al zijn (regel 6 over prod, ADR-017 over de rol in dev).

Wat daarbij meeweegt uit de inventarisatie:

- De service principal van GitHub Actions heeft Contributor en User Access Administrator op de resourcegroep met de data.
- De repo is publiek, en de workflow deployt automatisch naar de omgeving met de data.
- Ontwikkelgereedschap (toolbox, Claude Code, handmatige jobs) werkt in dezelfde omgeving als de klantdata.

De aanbeveling hangt af van twee dingen die ik niet kan beoordelen: de juridische vragen onderaan, en of de kosten van een tweede omgeving voor jou acceptabel zijn. Zegt de jurist dat de huidige situatie niet mag voortduren, dan is er naast A een noodmaatregel nodig voor de tussentijd (zie "Tussentijd").

## Vergelijking

| | A. Dev zonder echte data, pilot in prod | B. Dev als volwaardige omgeving |
|---|---|---|
| **Infra** | Nieuwe resourcegroep `rg-cockpit-prod-neu` uit dezelfde Bicep (`env=prod` bestaat al als waarde). Nieuw NAT-IP laten whitelisten bij Realworks. Eigen Key Vault, tokens opnieuw opslaan. Workflow voor prod met handmatige goedkeuring. Dev: data wissen, sync uit of naar een testbron | Dev aanscherpen tot prod-niveau: private endpoints of netwerkregels voor storage, Key Vault en Service Bus; storage-sleutels uit (#37); toolbox en handmatige jobs beperken; deploy alleen na goedkeuring. Daarna bestaat er geen omgeving meer om vrij in te ontwikkelen |
| **Kosten** | Vaste kosten van een tweede omgeving, ruwe schatting € 70 tot € 110 per maand (NAT Gateway ongeveer € 28, Postgres B2s, Service Bus Standard, opslag). Dev kan daartegenover vaker in de zuinige stand | Geen tweede omgeving, wel private endpoints (enkele euro's per stuk per maand). Komt er later toch een testomgeving bij, dan vervalt het voordeel |
| **Rol `cockpit-dev-operator`** | Kan blijven of ruimer worden zodra dev leeg is; ADR-017 voorziet dat, met een nieuwe ADR. Claude Code krijgt geen toegang tot prod | Blijft minimaal zoals nu, voor altijd. Lezen van logs en starten van jobs blijven uitgesloten. Ontwikkelen met Claude Code tegen de omgeving blijft beperkt tot status en herstarten |
| **ADR-015 (bewaren en opschonen)** | Geldt in prod. In dev niet meer nodig voor echte data, wel als te testen functie. De eenmalige opruiming van dev moet volgens ADR-015 volledig zijn, inclusief `raw-realworks`, `import`, back-ups en soft-deleted blobs | Geldt in dev en moet daar aantoonbaar werken: melding als het opschonen niet draait, en een bewaartermijn voor `raw-realworks` en `import` |
| **Testen** | Vrij testen in dev met verzonnen data; migraties en nieuwe jobs eerst in dev, daarna in prod. Nadeel: dev lijkt minder op de werkelijkheid, en er is een testbron voor Realworks nodig | Testen gebeurt op echte data: realistisch, maar een fout in een migratie of job raakt direct de klant. Fouten in de intake of sync zijn niet vooraf te vangen |
| **Werk om er te komen** | Groter eenmalig: prod opzetten, C&R verhuizen, dev legen, testdata maken | Kleiner eenmalig, maar blijvend trager ontwikkelen |

De bedragen zijn schattingen op basis van de bekende NAT-prijs in `dev.bicepparam` en de gekozen SKU's. Ik heb geen toegang tot de facturen; reken het na in de Azure-prijscalculator voordat je erop beslist.

## Wat in beide opties moet gebeuren

Deze punten volgen uit de inventarisatie en staan los van de keuze:

1. **Bewaartermijn voor `raw-realworks` en `import`.** Nu groeit `raw-realworks` elke dag en blijven Excel-bestanden staan. Dat vraagt een besluit (ADR) en een lifecycle-regel.
2. **Melding als het opschonen niet draait.** Het opschonen is een stap in de sync; als de sync mislukt, merkt niemand dat ADR-015 stilstaat.
3. **Storage-sleutels uit** (#37) en `gebruiker-toevoegen.sh` omzetten naar inloggen met Entra.
4. **Rechten van de GitHub Actions-service principal** bekijken voor de omgeving waar de klantdata staat.

## Optie A in stappen

Ter indicatie; het echte plan volgt na je besluit, in een eigen issue.

1. ADR voor de scheiding dev/prod en voor de bewaartermijnen.
2. Prod opzetten met Bicep, via een workflow met goedkeuring. Het NAT-IP van prod laten whitelisten bij Realworks.
3. Besluiten wat er van dev meegaat: opnieuw synchroniseren en importeren in prod (schoon, maar handmatige invoer van C&R gaat verloren) of de database overzetten.
4. C&R verhuizen: tokens in de Key Vault van prod, gebruikers aanmaken, nieuw portaaladres doorgeven.
5. Dev legen: sync-schema uit, database en containers leeg, tokens van C&R uit de Key Vault van dev. Daarna de inventarisscripts opnieuw draaien als bewijs.
6. Testdata voor dev: de bestaande fixtures uitbreiden met een seed voor objecten, verkopen en agenda.

Open punt bij stap 6: het is niet bekend of Realworks een test-API of testkantoor biedt (in het runbook staat dat nog als "invullen"). Zonder testbron kan de sync in dev alleen tegen opgenomen of nagemaakte antwoorden draaien.

## Tussentijd

Tot het besluit is uitgevoerd, blijft dev de omgeving met de klantdata. Wat je zonder ontwerpwijziging al kunt doen: de punten 1 tot en met 4 hierboven, en geen nieuwe gereedschappen of personen toegang geven tot dev.

## Open vragen voor Tim of een jurist

Deze vragen beantwoord ik niet. Ze bepalen mede hoe snel er gehandeld moet worden.

1. **Verwerkersovereenkomst met C&R.** Is die er, en is hij getekend? Dekt hij de huidige situatie: verwerking in een omgeving die "dev" heet, met de beveiliging zoals in de inventarisatie beschreven?
2. **Bewaartermijnen.** ADR-015 zegt dat de bewaartermijnen in de verwerkersovereenkomst staan. Staan ze er, en gelden ze ook voor de ruwe Realworks-kopieën, de Excel-bestanden en de back-ups?
3. **Subverwerkers en locaties.** Zijn Microsoft Azure in North Europe en Foundry in Sweden Central (ADR-014) als subverwerker en locatie afgesproken? Wat bewaart Microsoft van prompts en antwoorden, en past dat bij de afspraken?
4. **Ontwikkelgereedschap.** De service principal van Claude Code had tot #36 Contributor op de omgeving met klantdata. Moet dat achteraf beoordeeld of vastgelegd worden?
5. **Publieke repo en brede rechten.** Is er, gezien de publieke repo en de rechten van de GitHub Actions-service principal, aanleiding voor een beoordeling als mogelijk beveiligingsincident? Dat is een juridische en feitelijke toets die ik niet kan doen.
6. **Echte data gebruiken om te testen.** Mag dat volgens de afspraken met C&R, en zo ja onder welke voorwaarden? Dit raakt optie B direct.
7. **Pseudonimiseren.** Als dev gepseudonimiseerde kopieën van echte data krijgt, blijft dat verwerking van persoonsgegevens? Zo ja, dan lost het voor dev weinig op en is verzonnen data de veiligere keuze.
8. **Betrokkenen die geen klant werden.** `waardebepaling` bevat adressen van mensen die een waardebepaling kregen en niet verkochten. Welke termijn geldt daarvoor?
9. **Voorwaarden van Realworks.** Stellen de ontwikkelaarsvoorwaarden eisen aan waar en hoe lang gegevens uit de API worden opgeslagen?
10. **Echte woningteksten in de Codespace.** `docs/plannen/Woningteksten/` staat buiten Azure in een GitHub Codespace. Valt dat onder de afspraken?

## Na het besluit

- Nieuwe ADR in `docs/adr` met de gekozen optie (sjabloon `000-template.md`).
- ADR-017 herzien als de rol `cockpit-dev-operator` verandert.
- CLAUDE.md aanvullen met een regel over echte data in dev, zodat die keuze niet opnieuw impliciet wordt.
