-- Bezichtigersleads, eerste plak (issue #48, ADR-019): bezichtigingen uit de Realworks-agenda en de naam van de
-- bezichtiger, voor een alleen-lezen leadoverzicht. Geen notities, geen contactgegevens, geen toestemmingen.

-- 1. De module per tenant (ADR-013).
alter table tenant_module drop constraint tenant_module_module_check;
alter table tenant_module add constraint tenant_module_module_check check (module in ('intake', 'bezichtigers'));

-- 2. De bezichtiger: een relatie uit Realworks met minstens één bezichtiging. Alleen de naam wordt bewaard; die komt
--    uit de Relatie-API. naam_opgehaald_op is gevuld zodra het is geprobeerd, ook als de relatie niet meer bestaat.
create table bezichtiger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_relatie_id bigint not null,
  naam text,
  naam_opgehaald_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, realworks_relatie_id)
);

-- 3. Een bezichtiging: een agendapunt met een gekoppelde klant. De sync vervangt de stand bij elke run; wat Realworks
--    niet meer levert (geannuleerd, of ouder dan de vrijgegeven periode) verdwijnt hier ook.
create table bezichtiging (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_id bigint not null,
  bezichtiger_id uuid not null references bezichtiger (id) on delete cascade,
  agendatype text not null,
  status text,
  -- Nederlandse tijd, zoals Realworks het levert.
  tijdstip timestamp not null,
  projectcode text,
  projecttype text,
  locatie text,
  medewerker_realworks_id bigint,
  gesynchroniseerd_op timestamptz not null default now(),
  unique (tenant_id, realworks_id)
);
create index bezichtiging_tenant_bezichtiger on bezichtiging (tenant_id, bezichtiger_id);
create index bezichtiging_tenant_tijdstip on bezichtiging (tenant_id, tijdstip desc);

do $$
declare
  t text;
begin
  foreach t in array array['bezichtiger', 'bezichtiging'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    execute format('grant select, insert, update, delete on %I to cockpit_app', t);
  end loop;
end $$;

-- C&R is de eerste klant van de module.
alter table tenant_module no force row level security;
insert into tenant_module (tenant_id, module) select id, 'bezichtigers' from tenant where sleutel = 'cr';
alter table tenant_module force row level security;
