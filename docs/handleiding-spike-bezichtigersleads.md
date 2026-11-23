# Handleiding: spike bezichtigersleads uitvoeren

Wat je zelf moet doen om stap 0 van "Bezichtigersleads" af te ronden, waar het staat en wat je terugplakt. Stand: 2026-11-09. De uitkomsten komen in `docs/spike-bezichtigersleads-realworks.md`. Totale tijd: ongeveer 45 minuten, waarvan 15 in de toolbox.

**Eén regel voor alles hieronder:** plak in de chat alleen veldnamen, afspraaksoorten, statussen en aantallen. Geen namen, e-mailadressen, telefoonnummers, adressen of id's van klanten. In de portal zie je bij Try it out wel echte gegevens; die blijven op je scherm.

## 1. Voorbereiden (devcontainer, 5 minuten)

| Stap | Commando | Klaar als |
|---|---|---|
| Inloggen bij Azure | in **Azure Cloud Shell** (portal.azure.com, `>_`, Bash), niet in de Codespace: daar draait `az` als service principal met alleen leesrechten (ADR-017). `az account set -s cockpit-dev` | `az account show --query name -o tsv` geeft `cockpit-dev` |
| Dev aanzetten (NAT Gateway, nodig voor het vaste IP) | `infra/scripts/dev-aan.sh` | script meldt klaar |
| Toolbox openen | `infra/scripts/toolbox.sh` | je zit in een `bash`-shell in de container |

Blokkeert Entra de apparaatcode (AADSTS530035, security defaults), doe stap 1 en 2 dan in **Azure Cloud Shell** (portal.azure.com, het `>_`-icoon, Bash). Daar ben je al ingelogd: `az account set -s cockpit-dev`, `gh auth login`, `gh repo clone CherryMedia1/makelaarscockpit`, `cd makelaarscockpit`, dan `bash infra/scripts/dev-aan.sh` en `bash infra/scripts/toolbox.sh`.

Open de toolbox maar één keer en doe alles in die ene sessie. Te veel losse sessies geeft 429 van Azure.

## 2. Agenda en relatie bekijken (toolbox, 10 minuten)

1. Open `docs/spike-bezichtigersleads-realworks.md`, kopje "Ronde 2" (ronde 1 is op 2026-11-09 gedaan).
2. Kopieer het hele codeblok (van `az account show` tot en met `unset RW_AGENDA RW_REL`) en plak het in de toolbox-shell.
3. Het script leest de hele agenda (ongeveer 126 pagina's, een tot twee minuten) en daarna één relatie. Gebruik hier **niet** `rw`: dat toont het begin van het ruwe antwoord, met persoonsgegevens.

Wat je ziet en waar je op let:

| Regel | Waar je op let |
|---|---|
| `types:` | welke afspraaksoorten bezichtigingen zijn (1e, 2e, …) |
| `agendapunten per type:` | hoeveel bezichtigingen er zijn |
| `met projectcode:` | zo dicht mogelijk bij het aantal bezichtigingen: dan weten we het object |
| `relatie-types (aantal per punt):` | **de kernvraag.** Staat `Id van de gekoppelde relatie` erin, en hoe vaak per punt (1, 2, …)? |
| `veldpaden bezichtiging:` | velden die bij waardebepalingen niet voorkwamen, zoals een bron |
| `veldpaden relatie:` en de regels eronder | of er velden zijn voor marketing, mailing, vrijgave of toestemming, met hun waarde (alleen korte waarden of ja/nee) |

**Stopcriterium:** staat `Id van de gekoppelde relatie` bij (vrijwel) geen enkele bezichtiging, meld dat dan meteen. Dan moet het ontwerp anders en heeft de rest van deze handleiding geen haast.

Geeft het script een fout, plak dan alleen de laatste regel (de foutsoort en de HTTP-code), niet de hele uitvoer.

Typ daarna `exit`. Het script `toolbox.sh` zet de container dan zelf weer uit.

## 3. Developer-portal (developers.realworks.nl, ingelogd, 15 minuten)

| Waar | Wat je bekijkt | Wat je noteert |
|---|---|---|
| APIs → Agenda → endpoint voor één agendapunt (`/agenda/v3/afdeling/{afdelingscode}/agenda/{agendaId}`) | Try it out met het id van een bezichtiging uit je eigen agenda in het CRM | geeft het detail velden die de lijst niet heeft? Alleen de veldnamen |
| APIs → Relaties → `GET /relaties/v1/{relatieId}` → schema of responsevoorbeeld | velden rond marketing, mailing, nieuwsbrief, vrijgave | veldnaam en mogelijke waarden |
| APIs → Relaties → `PUT /relaties/v1` → request-schema | staan dezelfde velden erin? | ja/nee per veld. **Niets uitvoeren** |
| Webhooks | lijst van object types (Wonen, Agenda, Relaties, …) en update types | de volledige lijst; let op een signaal als "koppeling of vrijgave ingetrokken" |

## 4. API-manager in het Realworks CRM van C&R (5 minuten)

Alleen bekijken, niets wijzigen.

| Instelling | Wat de repo verwacht | Noteer |
|---|---|---|
| Vrijgave Agenda, dagen terug | 365 volgens de handleiding; de opdracht gaat uit van 730 | de werkelijke waarde |
| Vrijgave Relaties, niveau | Plus | de werkelijke waarde, en wat er bij Basis en Plus staat over marketingvrijgave |

## 5. Move.nl-planner (CRM, 5 minuten)

Zoek in de agenda van C&R een bezichtiging die een koper via Move/Funda heeft geboekt (als je die herkent):
- welke afspraaksoort heeft die?
- staat de koper eraan gekoppeld als relatie, en is die relatie nieuw aangemaakt?
- is ergens te zien dat de afspraak uit de planner komt ("Geplaatst door", een bron of een notitie)?

Weet je het niet zeker, dan gaat de vraag mee in de mail van stap 6.

## 6. Vragen aan Realworks (mail, 5 minuten)

Stuur vanuit de gedeelde mailbox naar je Realworks-contactpersoon of de partnersupport:

> Onderwerp: Vragen Agenda- en Relatie-API (Developer ID 8d3ffc0d-825c-42e9-a65a-bebb3e4a142c)
>
> Wij bouwen voor makelaarskantoor C&R (afdelingscode 935773) een koppeling op de Agenda- en Relatie-API. We hebben vier vragen:
> 1. Komen bezichtigingen uit de Move.nl-bezichtigingsplanner als agendapunt in de Agenda API, met welk agendatype, en met de koper als gekoppelde relatie (bestaand of nieuw aangemaakt)?
> 2. Kan een agendapunt van een bezichtiging meer dan één gekoppelde relatie hebben, bijvoorbeeld partners?
> 3. Zijn de marketingvrijgave en de mailingvoorkeur van een relatie leesbaar via de Relatie API, vanaf welk vrijgaveniveau, en zijn ze schrijfbaar via PUT /relaties/v1?
> 4. Welke webhooks zijn er voor Agenda en Relaties, en is er een signaal wanneer een kantoor de koppeling of de vrijgave intrekt?

## 7. Afsluiten

- `infra/scripts/dev-uit.sh` als je vandaag verder niets in dev doet.
- Plak in de chat:

```
Toolbox
- types (bezichtigingen):
- aantal bezichtigingen / met projectcode:
- relatie-types per punt:
- nieuwe veldpaden bezichtiging:
- velden relatie marketing/mailing/vrijgave (+ waarden):
Portal
- extra velden in agendadetail:
- marketingvelden in GET relatie / in PUT relatie:
- webhooks (object types, update types):
API-manager
- Agenda dagen terug:
- Relaties niveau:
Move.nl
- agendatype / relatie gekoppeld / bron zichtbaar:
Realworks-mail verstuurd op:
Issuenummer:
```

Daarna vul ik de tabellen in de spike in. Als de koppeling er is, schrijf ik het plan `docs/plannen/bezichtigersleads.md`.
