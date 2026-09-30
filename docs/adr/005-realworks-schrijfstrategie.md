# ADR-005 Realworks-schrijfstrategie: wat kunnen we lezen en schrijven
Datum: 2026-09-29 · Status: voorgesteld (tabel nog in te vullen vanuit de portal)
## Context
Fase 2 en 3 hangen af van wat de Realworks-API's toestaan om te schrijven (leads, relaties, kenmerken, taken, afspraken, objectvelden). Deze tabel is de uitkomst van stap 4.6 van de week 1-handleiding: per endpoint of GET werkt, of er POST/PUT/PATCH bestaat, en wat er getest is. Testen van schrijven alleen met een afgesproken testwaarde (bijv. kenmerk "COCKPIT-TEST") die C&R daarna verwijdert, of tegen een testkantoor.

Getest vanaf het vaste IP 134.149.33.214 via de toolbox met de tokens per API (tenant `cr`). Veldstructuur van Wonen-objecten: `packages/realworks/examples/wonen-object-velden.md`.

| API | Endpoint (methode + pad) | GET werkt? | POST/PUT aanwezig? | Getest resultaat | Welke velden | Opmerking |
|---|---|---|---|---|---|---|
| Wonen | GET `/wonen/v3/objecten` (lijst) | ja | _portal_ | 200, echte objecten; `aantal` en `pagina` als queryparameters | 14 secties, ~190 velden | `?actief=true` filtert |
| Wonen | objectdetail | pad onbekend | _portal_ | 404 op `/wonen/v3/objecten/{id}` | | pad uit portal nodig |
| Wonen | leads (import) | | _portal_ | | | behandelend medewerker meegeven mogelijk? |
| Wonen | zoekopdrachten (import) | | _portal_ | | | |
| Wonen | statistieken (import) | | _portal_ | | | |
| Relaties | GET `/relaties/v1` (lijst), `/relaties/v1/{relatieId}?bedrijfscode=` | ja | _portal_ | 200 met data sinds 30-09 | adresgegevens e.a. | detail vereist bedrijfscode (afdelingscode 935773) |
| Makelaars | GET `/makelaars/v1` | ja | _portal_ | 200, kantoorgegevens | | zit in elk token |
| Relaties | relatie aanmaken | | _portal_ | | | |
| Relaties | kenmerken (schrijven) | | _portal_ | | | |
| Relaties | nieuwsbriefvoorkeur | | _portal_ | | | |
| Taken | taken (lijst) | pad onbekend | _portal_ | 404 op `/taken/v1`, `/taken/v3/taken` | | pad uit portal nodig |
| Taken | taak aanmaken/wijzigen | | _portal_ | | | |
| Agenda | afspraken (lijst) | pad onbekend | _portal_ | 404 op `/agenda/v1`, `/agenda/v3/afspraken` | | pad uit portal nodig |
| Agenda | afspraak aanmaken | | _portal_ | | | |
| Objecten | object aanmaken / velden wijzigen | | _portal_ | | | cruciaal voor fase 2 |

_portal_ = af te lezen in developers.realworks.nl → APIs → endpoint-overzicht (alleen kijken, niets uitvoeren).

Vraag aan Realworks (nog te versturen): "Zijn er (partner)endpoints voor het aanmaken van taken, afspraken en objecten, of staan die op de roadmap?" Antwoord: _nog niet ontvangen_.
## Beslissing
Nog niet genomen; volgt zodra de tabel is ingevuld. Werkhypothese: alles wat Realworks niet laat schrijven, blijft in MakelaarsCockPit zelf (eigen tabellen met tenant_id) met een verwijzing naar het Realworks-object.
## Gevolgen
Bepaalt het ontwerp van fase 2 (documenten en gesprekken naar Realworks) en fase 3 (workflow-automatisering). Tot de tabel is ingevuld, bouwt fase 1 alleen op GET.
