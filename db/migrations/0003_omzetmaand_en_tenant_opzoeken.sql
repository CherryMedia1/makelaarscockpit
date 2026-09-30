-- 1. De Excel van C&R telt omzet in de maand van passeren (kolom "Maand passeren"), los van de exacte passeerdatum.
--    omzet_maand is de eerste dag van die maand; leeg = nog niet bekend.
alter table verkoop add column omzet_maand date check (omzet_maand is null or extract(day from omzet_maand) = 1);
create index verkoop_tenant_omzet_maand on verkoop (tenant_id, omzet_maand);

-- 2. De platformcode moet een tenant op sleutel kunnen opzoeken vóórdat de tenant-context is gezet.
--    Zonder FORCE mag de eigenaar (de inlogrol) de tabel lezen; de applicatierol cockpit_app blijft beperkt tot de eigen tenant.
alter table tenant no force row level security;
