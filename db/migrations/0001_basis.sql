-- Basis voor dashboard 1 (issue #3): tenants, medewerkers, Wonen-objecten, verkopen met verdeling, kosten en doelstellingen.
-- Elke tabel behalve `tenant` zelf heeft tenant_id met row-level security (harde regel in CLAUDE.md).

-- De applicatie voert queries uit als deze rol (SET LOCAL ROLE), zodat RLS altijd geldt:
-- de inlogrol is eigenaar van de tabellen en zou het beleid anders omzeilen.
do $$
begin
  if not exists (select from pg_roles where rolname = 'cockpit_app') then
    create role cockpit_app nologin;
  end if;
  -- De inlogrol moet naar cockpit_app kunnen wisselen (SET ROLE), zonder de rechten ervan te erven.
  execute format('grant cockpit_app to %I with set true, inherit false', current_user);
end $$;

create table tenant (
  id uuid primary key default gen_random_uuid(),
  sleutel text not null unique check (sleutel ~ '^[a-z0-9-]{2,32}$'),
  naam text not null,
  realworks_afdelingscode text,
  realworks_bedrijfscode text,
  -- ADR-006: tijdelijke toegang van de platformbeheerder tijdens de pilot; leeg = geen pilot-toegang.
  pilot_toegang_tot date,
  aangemaakt_op timestamptz not null default now()
);

create table medewerker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_id bigint,
  weergavenaam text not null,
  roepnaam text,
  tussenvoegsel text,
  achternaam text,
  actief boolean not null default true,
  realworks_gewijzigd_op timestamptz,
  gesynchroniseerd_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, realworks_id)
);

create table object (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  realworks_id bigint not null,
  objectcode text,
  afdelingscode text,
  straat text,
  huisnummer text,
  huisnummertoevoeging text,
  postcode text,
  plaats text,
  status text,
  actief boolean,
  vraagprijs numeric(14, 2),
  transactieprijs numeric(14, 2),
  transactiedatum date,
  transportdatum date,
  publicatiedatum date,
  gekoppelde_makelaar_code text,
  realworks_gewijzigd_op timestamptz,
  gesynchroniseerd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, realworks_id)
);
create index object_tenant_transactiedatum on object (tenant_id, transactiedatum);

-- Eén verkoop of andere omzetregel (koop, taxatie, verhuur, ...). Gegevens die Realworks niet levert
-- (courtage, opstartnota, notastatus) worden hier ingevoerd of uit de Excel-historie geïmporteerd (ADR-007).
create table verkoop (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  object_id uuid references object (id),
  soort text not null check (soort in ('koop', 'split', 'nieuwbouw', 'taxatie', 'huur', 'overig')),
  adres text,
  verkoopdatum date,
  passeerdatum date,
  verkoopprijs numeric(14, 2) check (verkoopprijs >= 0),
  courtage_soort text check (courtage_soort in ('percentage', 'vast')),
  courtage_fractie numeric(8, 6) check (courtage_fractie >= 0 and courtage_fractie < 1),
  courtage_bedrag numeric(14, 2) check (courtage_bedrag >= 0),
  opstartnota numeric(14, 2) not null default 0 check (opstartnota >= 0),
  nota_verstuurd boolean not null default false,
  herkomst text not null check (herkomst in ('handmatig', 'import', 'koppeling')),
  import_bron text,
  import_rij integer,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op timestamptz not null default now(),
  check (
    (courtage_soort is null and courtage_fractie is null and courtage_bedrag is null)
    or (courtage_soort = 'percentage' and courtage_fractie is not null and courtage_bedrag is null)
    or (courtage_soort = 'vast' and courtage_bedrag is not null and courtage_fractie is null)
  ),
  unique (tenant_id, import_bron, import_rij)
);
create index verkoop_tenant_verkoopdatum on verkoop (tenant_id, verkoopdatum);
create index verkoop_tenant_object on verkoop (tenant_id, object_id);

-- Aandeel per makelaar in een verkoop: 1 bij een eigen verkoop, bijvoorbeeld 0,5 en 0,5 bij een gedeelde.
create table verkoop_verdeling (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  verkoop_id uuid not null references verkoop (id) on delete cascade,
  medewerker_id uuid references medewerker (id),
  makelaar_naam text not null,
  aandeel numeric(5, 4) not null check (aandeel > 0 and aandeel <= 1),
  aangemaakt_op timestamptz not null default now()
);
create index verkoop_verdeling_tenant_verkoop on verkoop_verdeling (tenant_id, verkoop_id);

create table kostenregel (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  verkoop_id uuid references verkoop (id) on delete cascade,
  object_id uuid references object (id),
  soort text not null check (soort in ('fotograaf', 'videograaf', 'advertentie', 'styling', 'energielabel', 'overig')),
  leverancier text,
  omschrijving text,
  bedrag numeric(14, 2) not null check (bedrag >= 0),
  datum date not null,
  herkomst text not null check (herkomst in ('handmatig', 'import', 'koppeling')),
  aangemaakt_op timestamptz not null default now(),
  check (verkoop_id is not null or object_id is not null)
);
create index kostenregel_tenant_verkoop on kostenregel (tenant_id, verkoop_id);

create table doelstelling (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  jaar integer not null check (jaar between 2000 and 2100),
  maand integer not null check (maand between 1 and 12),
  soort text not null check (soort in ('omzet_ex_btw', 'aantal_verkocht')),
  waarde numeric(14, 2) not null check (waarde >= 0),
  unique (tenant_id, jaar, maand, soort)
);

-- Row-level security: een rij is alleen zichtbaar en schrijfbaar binnen de tenant uit de sessie-instelling app.tenant_id.
-- FORCE zorgt dat het beleid ook voor de eigenaar van de tabel geldt.
do $$
declare
  t text;
begin
  foreach t in array array['medewerker', 'object', 'verkoop', 'verkoop_verdeling', 'kostenregel', 'doelstelling'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    execute format('grant select, insert, update, delete on %I to cockpit_app', t);
  end loop;
end $$;

-- De tenant-tabel zelf: de applicatierol ziet alleen de eigen tenant.
alter table tenant enable row level security;
alter table tenant force row level security;
create policy eigen_tenant on tenant for select using (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select on tenant to cockpit_app;
