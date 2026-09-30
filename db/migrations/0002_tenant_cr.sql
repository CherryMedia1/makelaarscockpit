-- Eerste tenant: C&R Makelaars (pilot). De codes komen uit de Realworks-API (ADR-005); het zijn geen geheimen.
-- Deze migratie draait als eigenaar buiten de applicatierol; het RLS-beleid op `tenant` staat alleen select toe aan cockpit_app.
alter table tenant no force row level security;
insert into tenant (sleutel, naam, realworks_afdelingscode, realworks_bedrijfscode, pilot_toegang_tot)
values ('cr', 'C&R Makelaars', '935773', '935585', date '2027-03-31')
on conflict (sleutel) do nothing;
alter table tenant force row level security;
