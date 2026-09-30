# Runbook: inloggen en gebruikers

Bijgewerkt: 2026-09-30. Ontwerp: ADR-006 (wie mag erin) en ADR-009 (hoe).

## Portaal (dev)

https://ca-web-cockpit-dev-neu.icyocean-bdadb440.northeurope.azurecontainerapps.io

Inloggen kan op twee manieren: "Inloggen met Microsoft" of een inloglink per e-mail (15 minuten geldig, één keer te gebruiken). Alleen toegevoegde gebruikers komen erin.

## Een gebruiker toevoegen of wijzigen

Dev moet aan staan (`infra/scripts/dev-aan.sh`).

```
infra/scripts/gebruiker-toevoegen.sh <tenant> <e-mailadres> <medewerker|kantoorbeheerder> ["Naam"] [toegang-tot JJJJ-MM-DD] [microsoft-organisatie-id]
```

Voorbeeld voor een medewerker van C&R: `infra/scripts/gebruiker-toevoegen.sh cr naam@crmakelaars.nl medewerker "Voornaam Achternaam"`

- `toegang-tot` alleen voor tijdelijke accounts (pilot-toegang, ADR-006).
- `microsoft-organisatie-id` alleen als het account uit een andere Microsoft-organisatie komt dan het kantoor.
- Hetzelfde adres opnieuw opgeven werkt de gebruiker bij. Een gebruiker intrekken: nu nog via de database (`actief = false`); komt in het gebruikersbeheer van het portaal.

## Microsoft-inlog

| Wat | Waarde |
|---|---|
| App-registratie | "MakelaarsCockpit portaal (dev)", multi-tenant |
| Client-id | `c02cd9cd-ee39-450e-9412-80128547b043` (ook in Key Vault: `web-microsoft-client-id`) |
| Client-secret | Key Vault `web-microsoft-client-secret`, geldig tot 30-09-2027 |
| Microsoft-organisatie C&R | `333a6102-ae56-410f-8765-b441892e5836` (kolom `tenant.microsoft_tenant_id`) |

Krijgt een medewerker bij Microsoft de melding dat een beheerder toestemming moet geven, stuur dan de Microsoft-beheerder van het kantoor deze link (de app vraagt alleen naam en e-mailadres):
`https://login.microsoftonline.com/333a6102-ae56-410f-8765-b441892e5836/adminconsent?client_id=c02cd9cd-ee39-450e-9412-80128547b043`

## E-mail

Afzender: `DoNotReply@d69e22c8-4498-4658-b75d-d96d85ae7690.azurecomm.net` (door Azure beheerd domein). Komt de mail niet aan: kijk in de map ongewenste e-mail. Een eigen afzenderdomein volgt bij productie.

## Als inloggen niet lukt

| Melding | Oorzaak |
|---|---|
| "Dit account heeft geen toegang" | niet toegevoegd, gedeactiveerd, einddatum verstreken, of Microsoft-account uit een andere organisatie dan bij het kantoor is vastgelegd |
| "Deze inloglink werkt niet meer" | ouder dan 15 minuten of al gebruikt |
| "Inloggen lukt nu even niet" | e-maildienst of database onbereikbaar; staat dev aan? |

In de log van het portaal (Log Analytics, tabel `ContainerAppConsoleLogs`, enkele minuten vertraging) staan redenen en gebruiker-id's, nooit adressen: `ContainerAppConsoleLogs | where ContainerAppName == 'ca-web-cockpit-dev-neu' | where Log has_any ('inloglink', 'ingelogd', 'geweigerd')`.
