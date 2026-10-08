-- Verkopen uit de Realworks-koppeling (ADR-010).
-- 1. Een Wonen-object verwijst naar de gekoppelde makelaar met de relatiecode van de medewerker, niet met het id.
alter table medewerker add column relatiecode text;
create index medewerker_tenant_relatiecode on medewerker (tenant_id, relatiecode);

-- 2. Per object hoogstens één verkoop uit de koppeling; bijwerken gaat via deze sleutel.
create unique index verkoop_tenant_object_koppeling on verkoop (tenant_id, object_id) where herkomst = 'koppeling';

-- 3. Een verkoop onder voorbehoud telt mee (zoals in de Excel bij "Maand verkocht"), maar is herkenbaar.
alter table verkoop add column onder_voorbehoud boolean not null default false;

-- 4. Vanaf welke transactiedatum verkopen uit Realworks komen; eerdere verkopen staan in de Excel-historie.
alter table tenant add column koppeling_verkopen_vanaf date;
update tenant set koppeling_verkopen_vanaf = date '2026-10-01' where sleutel = 'cr';
