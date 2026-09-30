# packages/realworks

Realworks API-client; alle Realworks-calls lopen via dit package.

- `src/index.ts`: ophalen van Wonen-objecten (met paginering) en medewerkers, en de vertaling naar onze gegevens. Header: `Authorization: rwauth {token}`.
- `examples/wonen-object-velden.md`: de veldstructuur van een Wonen-object (alleen veldnamen).
- Tests gebruiken verzonnen antwoorden in de echte vorm en roepen Realworks niet aan. De volledige endpoint-catalogus staat in `docs/adr/005-realworks-schrijfstrategie.md`.
