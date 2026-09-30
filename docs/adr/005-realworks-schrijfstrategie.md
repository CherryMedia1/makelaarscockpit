# ADR-005 Realworks-schrijfstrategie: wat kunnen we lezen en schrijven
Datum: 2026-09-30 · Status: voorgesteld (catalogus compleet; besluit ter bevestiging door Tim)
## Context
Fase 2 en 3 hangen af van wat de Realworks-API's toestaan om te schrijven. Dit is de uitkomst van stap 4.6 van de week 1-handleiding. De catalogus komt uit de developer-portal (30-09-2026); alle GET-paden zijn getest vanaf het vaste IP 134.149.33.214 via de toolbox met de tokens van C&R (tenant `cr`). Schrijfoperaties (POST/PUT) zijn **niet** uitgevoerd.

Twee codes: **afdelingscode 935773** (in paden en als `afdelingscode`-parameter) en **bedrijfscode 935585** (parameter `bedrijfscode` bij Relaties; alle medewerkers en kenmerken hangen hieraan).

### Lezen (GET)

| API | Pad | Getest | Opmerking |
|---|---|---|---|
| Wonen | `/wonen/v3/objecten` | 200, data | `aantal`, `pagina`, `actief`; 14 secties, ~190 velden (`packages/realworks/examples/wonen-object-velden.md`) |
| Wonen | `/wonen/v3/objecten/{afdelingscode}/{objectcode}` | nog te testen | detail van één woning |
| Wonen | `/wonen/v3/objecten/lijstVanZaken/{afdelingscode}/{objectcode}` | nog te testen | |
| Wonen | `/wonen/v3/objecten/vragenlijst[/model2019\|/model2023]/{afdelingscode}/{objectcode}` | nog te testen | |
| Wonen | `/wonen/v3/zoekopdracht/locaties?afdelingscode=` | 200, data | plaatsen met id's |
| Relaties | `/relaties/v1` | 200, data | zoeken door relaties |
| Relaties | `/relaties/v1/{relatieId}?bedrijfscode=` | 200, data | |
| Relaties | `/relaties/v1/medewerker` | 200, 17 medewerkers | bron van `medewerkerId` voor Taken en Agenda |
| Relaties | `/relaties/v1/kenmerken?bedrijfscode=` | 200, data | kenmerken met `id`, `groep`, `omschrijving` |
| Relaties | `/relaties/v1/{bedrijf\|contactpersoon\|medewerker\|particulier}/{afdelingscode}/{relatiecode}` | nog te testen | detail per relatiesoort |
| Taken | `/taken/v3/statussen/{afdelingscode}`, `/taken/v3/types/{afdelingscode}` | 200, data | referentiedata |
| Taken | `/taken/v3/medewerker/{medewerkerId}` | 200 (lege lijst voor geteste medewerker) | **geen lijst voor de hele afdeling**: taken ophalen gaat per medewerker |
| Taken | `/taken/v3/afdeling/{afdelingscode}/taak/{taakId}` | route bestaat | |
| Agenda | `/agenda/v3/afdeling/{afdelingscode}` | 200, 12.655 agendapunten | paginering via `paginering.volgende` (cursor `vanaf=`), 100 per pagina |
| Agenda | `/agenda/v3/medewerker/{medewerkerId}` | 200, data | |
| Agenda | `/agenda/v3/afdeling/{afdelingscode}/agenda/{agendaId}` | nog te testen | |
| Agenda | `/agenda/v3/statussen/{afdelingscode}`, `/agenda/v3/types/{afdelingscode}` | 200, data | referentiedata |
| Makelaars | `/makelaars/v1` | 200, data | kantoorgegevens; zit in elk token |
| BOG | `/bog/v3/objecten`, `/bog/v3/objecten/{afdelingscode}/{objectcode}` | niet getest | API niet afgenomen door C&R |
| Aankoop | `/aankoop/v3/objecten/{afdelingscode}` | niet getest | API niet afgenomen door C&R |

### Schrijven (POST/PUT), niet uitgevoerd

| API | Methode en pad | Wat het doet | Bruikbaar voor |
|---|---|---|---|
| Relaties | POST `/relaties/v1` | relatie toevoegen | fase 2: nieuwe contacten uit gesprekken |
| Relaties | PUT `/relaties/v1` | relatie wijzigen | fase 2: gegevens bijwerken |
| Relaties | PUT `/relaties/v1/afdelingen/{afdelingscode}/{bedrijven\|contactpersonen\|medewerkers\|personen}/{relatieId}/kenmerken/{kenmerkId}` | kenmerk toevoegen | fase 3: segmentatie en workflow-status |
| Taken | POST `/taken/v3` | nieuwe taak | fase 3: taken uit workflows |
| Taken | PUT `/taken/v3/{taakId}` | taak wijzigen | fase 3: status bijwerken |
| Taken | POST `/taken/v3/relaties` | relatie toevoegen voor taken | |
| Agenda | POST `/agenda/v3` | nieuw agendapunt | fase 3: afspraken inplannen |
| Agenda | PUT `/agenda/v3/{agendaId}` | agendapunt wijzigen | |
| Agenda | POST `/agenda/v3/relaties` | relatie toevoegen voor agenda | |
| Wonen | POST `/wonen/v3/response` | response (lead) op een woning insturen | fase 2: leads |
| Wonen | POST `/wonen/v3/relaties` | relatie toevoegen voor wonen | |
| Wonen | POST `/wonen/v3/zoekopdracht` | zoekopdracht insturen | fase 2: zoekprofielen |
| BOG | POST `/bog/v3/response`, POST `/bog/v3/relaties` | idem voor BOG | niet afgenomen |

### Wat ontbreekt
- **Geen** endpoint om een object (woning) aan te maken of objectvelden te wijzigen. Wonen-objecten zijn alleen-lezen.
- **Geen** endpoint om documenten of bestanden bij een object of relatie te plaatsen.
- **Geen** endpoint om taken voor de hele afdeling in één keer op te halen (wel per medewerker).
- Geen DELETE-operaties.

Vraag aan Realworks (nog te versturen): "Zijn er (partner)endpoints voor het aanmaken of wijzigen van objecten en het toevoegen van documenten, of staan die op de roadmap?" Antwoord: _nog niet ontvangen_.
## Beslissing
Voorstel:
1. **Fase 1 (dashboards)** gebruikt uitsluitend GET. Synchronisatie: Wonen en Relaties via lijst plus `tijdstipLaatsteWijziging`, Agenda via de afdelingslijst met cursor, Taken per medewerker (lijst uit `/relaties/v1/medewerker`).
2. **Fase 2 en 3 schrijven alleen via de endpoints hierboven**: relaties, kenmerken, taken, agendapunten, responses en zoekopdrachten. Objectgegevens blijven in Realworks de waarheid en worden daar handmatig beheerd.
3. **Documenten en gespreksverslagen** blijven in MakelaarsCockPit (Blob-container `documents`, eigen tabellen met `tenant_id`), met een verwijzing naar het Realworks-object of de relatie. In Realworks verschijnt hooguit een taak of agendapunt met een link.
4. Schrijven wordt eerst getest met een herkenbare testwaarde (kenmerk of taak "COCKPIT-TEST") die daarna wordt verwijderd, en staat in dev achter een schakelaar per tenant.
## Gevolgen
- Het datamodel in `packages/domain` heeft twee sleutels per tenant nodig: afdelingscode en bedrijfscode.
- De sync voor Taken vraagt N calls (één per medewerker); bij 17 medewerkers is dat geen probleem.
- "Documenten naar Realworks" uit de oorspronkelijke fase 2-omschrijving is via de API niet mogelijk; de scope van fase 2 wordt: gegevens uit documenten en gesprekken vastleggen als relatie, kenmerk, taak, agendapunt of response.
- Als Realworks alsnog object- of documentendpoints biedt, komt er een vervolg-ADR.
