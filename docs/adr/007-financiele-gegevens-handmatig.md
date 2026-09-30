# ADR-007 Financiële gegevens per woning: handmatige invoer in het portaal
Datum: 2026-09-30 · Status: geaccepteerd
## Context
De Excel "Lijst verkochte woningen" van C&R bevat per verkochte woning: verdeling tussen makelaars (%), afgesproken courtage, opstartnota, courtage en omzet (incl. en excl. btw), en de status van de nota. Realworks levert via de Wonen-API wel verkoopprijs, transactiedatum, transportdatum, status en gekoppelde makelaar, maar geen courtage, opstartnota, omzet of verdeling (ADR-005). Daarnaast wil C&R per woning de gemaakte kosten zien (fotograaf, videograaf, advertenties, enzovoort).
## Beslissing
1. **Courtage, opstartnota, verdeling tussen makelaars en notastatus worden in het portaal ingevoerd** door medewerkers van het kantoor, per woning. Omzet en bedragen exclusief btw worden daaruit berekend, met dezelfde rekenregels als de Excel (courtage = verkoopprijs × afgesproken courtage; omzet = (opstartnota + courtage) × aandeel makelaar; ex btw = bedrag / 1,21).
2. **Kosten per woning** worden als losse regels vastgelegd (soort, leverancier, bedrag, datum), zodat per woning een overzicht van opbrengst en kosten ontstaat.
3. **De bestaande Excel wordt eenmalig ingelezen** als historie, zodat jaar-op-jaar-vergelijkingen vanaf dag één kloppen. Ingelezen regels worden waar mogelijk gekoppeld aan het Realworks-object op adres.
4. Alles wat Realworks wél levert, komt automatisch uit de synchronisatie en is in het portaal niet bewerkbaar.
## Gevolgen
- Eigen tabellen (met `tenant_id`) voor financiële invoer, kostenregels en doelstellingen; Realworks blijft de bron voor objectgegevens.
- De rekenregels horen in `packages/domain` met tests vóór de implementatie.
- Later kan een boekhoudkoppeling (Exact, Basecone) de handmatige invoer van kosten en notastatus vervangen; het datamodel houdt daarom per regel de herkomst bij (handmatig, import, koppeling).
- Historische import bevat persoonsgegevens (adressen); het bronbestand blijft buiten git (`input/`).
