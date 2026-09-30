# Handleiding: Realworks instellen voor MakelaarsCockPit

Wat er in Realworks nog moet gebeuren, waar het staat, en wie het doet. Stand: 2026-09-29. Vaste gegevens: Developer ID `8d3ffc0d-825c-42e9-a65a-bebb3e4a142c`, vast IP van Azure `134.149.33.214`.

Er zijn twee plekken:
- **Jouw developer-portal** (developers.realworks.nl): tokens, IP-whitelist per token, voorwaarden, documentatie van de API's met "Try it out".
- **De API-manager in het Realworks CRM van C&R**: welke API's zijn afgenomen, jouw Developer ID, de vrijgave (inzageniveaus) en soms ook IP-adressen. Sinds 2026-09-30 heb je hier een eigen inlog, dus hoofdstuk 5 kun je zelf doen. Wijzig alleen de API-instellingen van de MakelaarsCockPit-koppeling; laat koppelingen van andere leveranciers (website, Funda, enzovoort) ongemoeid.

## 1. IP-whitelist corrigeren (jij, developer-portal, 5 minuten)

Bij **elk** token (Wonen, Relaties, Taken, Agenda én het development-token) → IP's:

| Wat | Waarde | Actie |
|---|---|---|
| Azure dev | `134.149.33.214/32` | moet erin staan; controleer dat het **/32** is en niet /3 (dat is een bereik van honderden miljoenen adressen) |
| laptop-adressen (92.64.187.178, 143.177.116.81, 141.144.193.178) | | verwijderen; werken gaat voortaan via de toolbox vanaf het Azure-IP |

Omgeving: "Productie". Omschrijving: "Azure dev".

## 2. Tokens (jij, developer-portal)

- Het dashboard toont vier tokens, elk met een eigen bereik: (1) Makelaars/Wonen/Zoekopdracht, (2) Kenmerken/Makelaars/Relaties, (3) Makelaars/Taken, (4) Makelaars/Agenda. Ze staan per API in Key Vault onder tenant `cr`; zie het runbook. Er is geen apart development-token: wat we zo noemden was token 1.
- Alle tokens die tot nu toe zijn gebruikt, zijn in een chat geplakt. Genereer ze op een rustig moment opnieuw en zet ze met het script in Key Vault zonder ze ergens te plakken. Het script vraagt het token onzichtbaar.

## 3. Paden van Taken en Agenda opzoeken (jij, developer-portal, 5 minuten)

Portal → APIs → **Taken** → open een endpoint → "Try it out". Noteer het pad (bijvoorbeeld `/taken/v1/...`) en de methode. Zelfde voor **Agenda**. Alle logische gokken (`/taken/v1`, `/taken/v3/taken`, `/agenda/v1`, `/agenda/v3/afspraken`) geven 404, dus het pad wijkt af. Plak beide paden in de chat, dan test ik ze en zet ik ze in het runbook.

## 4. Schrijfmogelijkheden inventariseren (jij, developer-portal, 30 minuten)

Voor stap 4.6 en `docs/adr/005-realworks-schrijfstrategie.md`. Per API het endpoint-overzicht openen en per rij van de tabel in de ADR noteren: staat er naast GET ook POST, PUT of PATCH, en welke velden vraagt die? Niets uitvoeren, alleen kijken. Wat ontbreekt, vraag je dezelfde dag aan Realworks: "Zijn er (partner)endpoints voor het aanmaken van taken, afspraken en objecten, of staan die op de roadmap?"

## 5. In het Realworks CRM van C&R (jij, met je eigen inlog, 15 minuten)

CRM → Marketplace / API-manager, per afgenomen API:

| Instelling | Gewenst | Status |
|---|---|---|
| Afgenomen API's | Wonen, Relaties, Taken, Agenda | gedaan (tokens bestaan) |
| Developer ID | `8d3ffc0d-825c-42e9-a65a-bebb3e4a142c` | gedaan |
| Vrijgave Wonen | basisgegevens + objectgegevens + transactiegegevens + relatiegegevens | staat (objecten komen door) |
| Vrijgave Relaties | niveau Plus | gedaan op 30-09 (data komt door) |
| Vrijgave Taken en Agenda | 365 dagen terug, 90 dagen vooruit, inzageniveau "Iedereen" | **controleren** zodra de paden bekend zijn |
| IP-adressen (als dat veld bij C&R staat) | `134.149.33.214/32` | controleren |
| Afdelingscode | `935773` | gedaan; staat in Key Vault als `tenant-cr-realworks-afdeling` en is de `bedrijfscode`-parameter in de API |

Werkwijze: wijzig één instelling, zeg in de chat wat je hebt gewijzigd, en laat de bijbehorende call testen vanaf de toolbox. Zo zie je per stap of het effect heeft.

## 6. Webhook (jij, developer-portal, pas in week 2)

Nog **niet** registreren: er draait nog geen endpoint, en na 25 mislukte pogingen zet Realworks de webhook uit. Gegevens staan klaar in `docs/runbooks/realworks-koppeling.md`:
- Doel-URL: `https://func-cockpit-dev-neu.azurewebsites.net/api/webhooks/cr/wonen`
- Object type: Wonen · Update type: Object update · Naam: `cockpit-dev-wonen`
- E-mail: een gedeelde mailbox, niet je persoonlijke.

## Controle na afloop

Vanuit de repo: `infra/scripts/toolbox.sh` en in de shell `rw multi cr /wonen/v3/objecten?aantal=1 /relaties/v1?aantal=1 /makelaars/v1` (alle drie 200 met data), aangevuld met de nieuwe paden voor Taken en Agenda.
