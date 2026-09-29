# Handleiding: Realworks instellen voor MakelaarsCockPit

Wat er in Realworks nog moet gebeuren, waar het staat, en wie het doet. Stand: 2026-09-29. Vaste gegevens: Developer ID `8d3ffc0d-825c-42e9-a65a-bebb3e4a142c`, vast IP van Azure `134.149.33.214`.

Er zijn twee plekken:
- **Jouw developer-portal** (developers.realworks.nl): tokens, IP-whitelist per token, voorwaarden, documentatie van de API's met "Try it out".
- **De API-manager in het Realworks CRM van C&R**: welke API's zijn afgenomen, jouw Developer ID, de vrijgave (inzageniveaus) en soms ook IP-adressen. Alleen C&R kan hier iets wijzigen.

## 1. IP-whitelist corrigeren (jij, developer-portal, 5 minuten)

Bij **elk** token (Wonen, Relaties, Taken, Agenda én het development-token) → IP's:

| Wat | Waarde | Actie |
|---|---|---|
| Azure dev | `134.149.33.214/32` | moet erin staan; controleer dat het **/32** is en niet /3 (dat is een bereik van honderden miljoenen adressen) |
| laptop-adressen (92.64.187.178, 143.177.116.81, 141.144.193.178) | | verwijderen; werken gaat voortaan via de toolbox vanaf het Azure-IP |

Omgeving: "Productie". Omschrijving: "Azure dev".

## 2. Tokens (jij, developer-portal)

- Het **development-token** werkt voor alle vier de API's van de C&R-koppeling en geeft echte data. Dit is voor fase 1 het token dat we gebruiken (tenant `dev` in Key Vault).
- Het Wonen-token van C&R uit de portal van 22 september geeft sinds 29 september 401. Waarschijnlijk is het opnieuw gegenereerd. Zolang het development-token werkt, hoef je hier niets mee; wil je de tokens per API wel actueel houden, zet ze dan opnieuw in Key Vault met `infra/scripts/realworks-token-opslaan.sh cr wonen` (en relaties, taken, agenda).
- Alle tokens die tot nu toe zijn gebruikt, zijn in een chat geplakt. Genereer ze op een rustig moment opnieuw en zet ze met het script in Key Vault zonder ze ergens te plakken. Het script vraagt het token onzichtbaar.

## 3. Paden van Taken en Agenda opzoeken (jij, developer-portal, 5 minuten)

Portal → APIs → **Taken** → open een endpoint → "Try it out". Noteer het pad (bijvoorbeeld `/taken/v1/...`) en de methode. Zelfde voor **Agenda**. Alle logische gokken (`/taken/v1`, `/taken/v3/taken`, `/agenda/v1`, `/agenda/v3/afspraken`) geven 404, dus het pad wijkt af. Plak beide paden in de chat, dan test ik ze en zet ik ze in het runbook.

## 4. Schrijfmogelijkheden inventariseren (jij, developer-portal, 30 minuten)

Voor stap 4.6 en `docs/adr/005-realworks-schrijfstrategie.md`. Per API het endpoint-overzicht openen en per rij van de tabel in de ADR noteren: staat er naast GET ook POST, PUT of PATCH, en welke velden vraagt die? Niets uitvoeren, alleen kijken. Wat ontbreekt, vraag je dezelfde dag aan Realworks: "Zijn er (partner)endpoints voor het aanmaken van taken, afspraken en objecten, of staan die op de roadmap?"

## 5. Bij C&R (Realworks-beheerder van C&R, 15 minuten met gedeeld scherm)

CRM → Marketplace / API-manager, per afgenomen API:

| Instelling | Gewenst | Status |
|---|---|---|
| Afgenomen API's | Wonen, Relaties, Taken, Agenda | gedaan (tokens bestaan) |
| Developer ID | `8d3ffc0d-825c-42e9-a65a-bebb3e4a142c` | gedaan |
| Vrijgave Wonen | basisgegevens + objectgegevens + transactiegegevens + relatiegegevens | staat (objecten komen door) |
| Vrijgave Relaties | niveau Plus | **controleren**: de lijst is nog leeg |
| Vrijgave Taken en Agenda | 365 dagen terug, 90 dagen vooruit, inzageniveau "Iedereen" | **controleren** zodra de paden bekend zijn |
| IP-adressen (als dat veld bij C&R staat) | `134.149.33.214/32` | controleren |
| Afdelingscode(s) | vragen aan Realworks welke gelden voor C&R | **open**; daarna in Key Vault: `realworks-token-opslaan.sh` vraagt erom, of handmatig als `tenant-cr-realworks-afdeling` |

## 6. Webhook (jij, developer-portal, pas in week 2)

Nog **niet** registreren: er draait nog geen endpoint, en na 25 mislukte pogingen zet Realworks de webhook uit. Gegevens staan klaar in `docs/runbooks/realworks-koppeling.md`:
- Doel-URL: `https://func-cockpit-dev-neu.azurewebsites.net/api/webhooks/cr/wonen`
- Object type: Wonen · Update type: Object update · Naam: `cockpit-dev-wonen`
- E-mail: een gedeelde mailbox, niet je persoonlijke.

## Controle na afloop

Vanuit de repo: `infra/scripts/toolbox.sh` en in de shell `rw dev /wonen/v3/objecten?aantal=1` (verwacht 200 met data), `rw dev /relaties/v1?aantal=1` (verwacht 200, met data zodra de vrijgave Relaties goed staat) en de nieuwe paden voor Taken en Agenda.
