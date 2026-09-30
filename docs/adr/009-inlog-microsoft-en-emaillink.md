# ADR-009 Inloggen met Microsoft of een inloglink per e-mail
Datum: 2026-09-30 · Status: geaccepteerd
## Context
ADR-006 bepaalt dat alleen medewerkers van een kantoor een account hebben, gebonden aan precies één kantoor. C&R gebruikt Microsoft 365 (het domein staat bij Microsoft geregistreerd als organisatie), maar niet elk toekomstig kantoor doet dat. Tim koos daarom voor twee inlogmethoden vanaf het begin. De gangbare bibliotheek Auth.js is in de versie voor Next.js 16 nog een bèta; voor een inlog is dat ongewenst.
## Beslissing
1. **Twee methoden**: "Inloggen met Microsoft" (OpenID Connect, autorisatiecode met PKCE, één multi-tenant app-registratie) en een **inloglink per e-mail** (eenmalig, 15 minuten geldig) via Azure Communication Services.
2. **Alleen toegevoegde gebruikers**: tabel `gebruiker` met e-mailadres, kantoor, rol (`medewerker`, `kantoorbeheerder`), actief en een optionele einddatum. De beslisregel staat in `packages/domain/src/toegang` met tests.
3. **Microsoft-inlog is gebonden aan de organisatie van het kantoor**: het organisatie-id (`tid`) uit het token moet gelijk zijn aan dat van het kantoor (`tenant.microsoft_tenant_id`), of aan de afwijkende organisatie die bij de gebruiker is vastgelegd (pilot-account). Het e-mailadres uit een Microsoft-token is zonder die controle niet te vertrouwen: elke organisatie kan zelf adressen aan accounts hangen.
4. **Geen wachtwoorden bij ons.** Van een inloglink staat alleen de hash in de database; de link logt pas in na een klik op een knop, zodat een mailscanner hem niet verbruikt. Hoogstens vijf links per kwartier per gebruiker.
5. **Sessie**: versleutelde cookie (JWE, A256GCM) van acht uur, HttpOnly, Secure, SameSite=Lax. Bij elke pagina wordt in de database gecontroleerd of de gebruiker nog toegang heeft, zodat intrekken direct werkt. De tenant voor alle gegevens komt uit de sessie, nooit uit de URL of invoer.
6. **Eigen, kleine implementatie** met `jose` (versleuteling en tokencontrole) in plaats van een bèta-bibliotheek. De code staat in `apps/web/src/lib/inlog`.
7. **Geen meldingen die adressen prijsgeven**: een onbekend adres krijgt dezelfde bevestiging als een bekend adres. In de log staan gebruiker-id's en redenen, geen adressen of namen.
## Gevolgen
- Geheimen in Key Vault: `web-sessie-sleutel`, `web-microsoft-client-secret` (één jaar geldig, vóór 30-09-2027 vernieuwen) en `web-microsoft-client-id`.
- De Microsoft-beheerder van een kantoor moet de app mogelijk één keer goedkeuren als gebruikers dat in hun organisatie niet zelf mogen: `https://login.microsoftonline.com/<organisatie-id>/adminconsent?client_id=<client-id>`. De app vraagt alleen naam en e-mailadres.
- De afzender van de e-mail is voorlopig een door Azure beheerd domein (`DoNotReply@…azurecomm.net`); een eigen domein volgt bij de stap naar productie en verbetert de bezorging.
- Gebruikers toevoegen gaat voorlopig met `infra/scripts/gebruiker-toevoegen.sh`; beheer door de kantoorbeheerder in het portaal en de meekijksessie uit ADR-006 volgen.
- Het gedeelde pilot-wachtwoord is vervallen.
