# ADR-006 Toegang en rollen: alleen kantoormedewerkers loggen in
Datum: 2026-09-30 · Status: geaccepteerd
## Context
MakelaarsCockPit verwerkt persoonsgegevens van klanten van makelaarskantoren (relaties, leads, transacties). Het kantoor is verwerkingsverantwoordelijke, MakelaarsCockPit is verwerker. Hoe minder mensen buiten het kantoor zelfstandig bij de data kunnen, hoe helderder de verwerkersovereenkomst. Tegelijk moet de platformbeheerder (Tim) tijdens de pilot met C&R kunnen zien wat er gebouwd wordt.
## Beslissing
1. **Alleen medewerkers van het kantoor hebben een eigen account** in het portaal van dat kantoor (tenant). Elk account hoort bij precies één tenant.
2. **De platformbeheerder heeft geen staande toegang tot kantoordata.** Meekijken kan alleen samen met een kantoormedewerker: de medewerker start een meekijksessie (of deelt het scherm); de sessie is tijdelijk, zichtbaar voor de medewerker en wordt gelogd (wie, wanneer, welke tenant; geen persoonsgegevens in het log).
3. **Uitzondering voor de pilot met C&R:** Tim krijgt een gewoon account in de C&R-tenant, als ware hij medewerker, met instemming van C&R. Dit account vervalt zodra de pilot overgaat in regulier gebruik; de einddatum wordt bij de tenant vastgelegd.
4. Rollen binnen een kantoor in de eerste versie: **medewerker** (lezen, eigen invoer) en **kantoorbeheerder** (ook gebruikers beheren, doelstellingen en financiële invoer van anderen). Verfijning volgt als de praktijk erom vraagt.
## Gevolgen
- Technisch beheer (deploys, migraties, logs) gebeurt zonder inzage in kantoordata: logs bevatten id's, geen namen of adressen (harde regel in CLAUDE.md).
- De inlogoplossing moet tenant-gebonden accounts en een tijdelijke, gelogde meekijksessie ondersteunen. Keuze van de techniek volgt in het issue "Inlog en rollen".
- De pilot-uitzondering staat in de verwerkersovereenkomst met C&R of een bijlage daarbij.
- Support aan kantoren gaat standaard via scherm delen of een meekijksessie, niet via een beheerdersaccount.
