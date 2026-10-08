-- Waardebepalingen (dashboard 2, issue #9): agendapunten van het type Waardebepaling uit Realworks, met de uitkomst als eigen invoer.
create table waardebepaling (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_agenda_id bigint,
  datum date not null,
  -- De locatie zoals Realworks die levert ("postcode  plaats straat huisnummer") en de uitgesplitste delen.
  locatie text,
  adres text,
  postcode text,
  plaats text,
  projectcode text,
  medewerker_id uuid references medewerker (id),
  makelaar_naam text not null default 'Onbekend',
  relatie_id bigint,
  agenda_status text,
  status text not null default 'in_afwachting'
    check (status in ('in_afwachting', 'orienterend', 'gewonnen', 'verloren', 'blijft_wonen', 'uit_verkoop', 'zelf_verkocht', 'andere_makelaar')),
  -- Wie de status bepaalde: de koppeling (automatisch gewonnen), een medewerker, of de Excel-import.
  status_bron text not null default 'automatisch' check (status_bron in ('automatisch', 'handmatig', 'import')),
  verloren_aan text,
  binnengehaald_via text,
  object_id uuid references object (id),
  herkomst text not null check (herkomst in ('koppeling', 'import', 'handmatig')),
  import_bron text,
  import_rij integer,
  realworks_gewijzigd_op timestamptz,
  gewijzigd_door uuid references gebruiker (id),
  gewijzigd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, realworks_agenda_id),
  unique (tenant_id, import_bron, import_rij)
);
create index waardebepaling_tenant_datum on waardebepaling (tenant_id, datum);

alter table waardebepaling enable row level security;
alter table waardebepaling force row level security;
create policy tenant_isolatie on waardebepaling
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on waardebepaling to cockpit_app;
