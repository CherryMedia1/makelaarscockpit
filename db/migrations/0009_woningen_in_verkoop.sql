-- Woningen in verkoop (dashboard 3, issue #10, ADR-012).
-- 1. Signalen van het Wonen-object voor de checklist.
alter table object add column heeft_fotos boolean not null default false;
alter table object add column heeft_plattegrond boolean not null default false;
alter table object add column energieklasse text;
alter table object add column heeft_tekst boolean not null default false;

-- 2. Afspraken uit de Realworks-agenda die aan een woning hangen (verkoopgesprek, foto's, tekenafspraak, ...).
--    Geen bezichtigingen en geen notities: alleen type, moment, status en het project.
create table agendapunt (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_id bigint not null,
  agendatype text not null,
  status text,
  datum date not null,
  projectcode text,
  projecttype text,
  locatie text,
  medewerker_realworks_id bigint,
  gesynchroniseerd_op timestamptz not null default now(),
  unique (tenant_id, realworks_id)
);
create index agendapunt_tenant_project on agendapunt (tenant_id, projectcode);

-- 3. Een woning op het bord. De sync beheert deze rijen: een object uit Realworks, of een woning in voorbereiding die
--    alleen nog uit de agenda bekend is (object_id leeg). De projectcode is de objectcode in Realworks.
create table woning (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  projectcode text not null,
  object_id uuid references object (id),
  adres text,
  plaats text,
  vraagprijs numeric(14, 2),
  medewerker_id uuid references medewerker (id),
  makelaar_naam text not null default 'Onbekend',
  -- Eigen invoer: wie van de backoffice de woning begeleidt.
  backoffice_medewerker_id uuid references medewerker (id),
  backoffice_naam text,
  fase text not null check (fase in ('voorbereiding', 'in_verkoop', 'verkocht_ov', 'verkocht')),
  -- Door de sync gezet: staat de woning nu op het bord?
  zichtbaar boolean not null default true,
  gewijzigd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, projectcode)
);

-- 4. Handmatig gezette stappen. Wat Realworks zelf ziet, wordt niet opgeslagen maar bij het tonen afgeleid.
create table woning_stap (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  woning_id uuid not null references woning (id) on delete cascade,
  stap text not null,
  status text not null check (status in ('gepland', 'klaar', 'nvt')),
  datum date,
  herkomst text not null default 'handmatig' check (herkomst in ('handmatig', 'import')),
  gewijzigd_door uuid references gebruiker (id),
  gewijzigd_op timestamptz not null default now(),
  unique (tenant_id, woning_id, stap)
);

do $$
declare
  t text;
begin
  foreach t in array array['agendapunt', 'woning', 'woning_stap'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    execute format('grant select, insert, update, delete on %I to cockpit_app', t);
  end loop;
end $$;
