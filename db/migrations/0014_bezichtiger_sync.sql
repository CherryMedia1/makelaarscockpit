-- Bezichtigersleads: synchroniseren op verzoek vanuit het portaal (issue #51, ADR-019). Eén rij per aangevraagde run:
-- wie, wanneer, de status en de uitkomst in aantallen. Geen namen of relatie-id's.
create table bezichtiger_sync (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  aangevraagd_door uuid references gebruiker (id),
  aangevraagd_op timestamptz not null default now(),
  status text not null default 'wachtrij' check (status in ('wachtrij', 'bezig', 'klaar', 'mislukt')),
  gestart_op timestamptz,
  klaar_op timestamptz,
  bezichtigingen integer,
  bezichtigers integer,
  namen_opgehaald integer,
  -- Namen die deze run niet meer kon ophalen (tijdsbudget of limiet van Realworks); die volgen bij de volgende run.
  namen_open integer,
  -- Alleen een technische code, bijvoorbeeld 'realworks-429'; nooit inhoud.
  foutcode text
);
create index bezichtiger_sync_tenant_aangevraagd on bezichtiger_sync (tenant_id, aangevraagd_op desc);

alter table bezichtiger_sync enable row level security;
alter table bezichtiger_sync force row level security;
create policy tenant_isolatie on bezichtiger_sync
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on bezichtiger_sync to cockpit_app;
