-- Inlog en rollen (issue #5, ADR-006, ADR-009).

-- De Microsoft-organisatie (Entra-tenant) van het kantoor: een Microsoft-inlog wordt alleen geaccepteerd vanuit deze organisatie.
-- Het id is een openbaar kenmerk van het e-maildomein, geen geheim.
alter table tenant add column microsoft_tenant_id uuid;
update tenant set microsoft_tenant_id = '333a6102-ae56-410f-8765-b441892e5836' where sleutel = 'cr';

create table gebruiker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  -- Eén account hoort bij precies één kantoor (ADR-006), dus het adres is over alle kantoren uniek.
  email text not null unique check (email = lower(email)),
  naam text,
  rol text not null check (rol in ('medewerker', 'kantoorbeheerder')),
  actief boolean not null default true,
  -- Laatste dag met toegang voor tijdelijke accounts, zoals de pilot-toegang van de platformbeheerder.
  toegang_tot date,
  -- Afwijkende Microsoft-organisatie voor deze gebruiker; leeg = die van het kantoor.
  microsoft_tenant_id uuid,
  laatste_inlog timestamptz,
  aangemaakt_op timestamptz not null default now()
);
create index gebruiker_tenant on gebruiker (tenant_id);

-- Eenmalige inloglinks. Alleen de hash van het token wordt bewaard.
create table inlog_token (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  gebruiker_id uuid not null references gebruiker (id) on delete cascade,
  token_hash text not null unique,
  verloopt_op timestamptz not null,
  gebruikt_op timestamptz,
  aangemaakt_op timestamptz not null default now()
);
create index inlog_token_gebruiker on inlog_token (tenant_id, gebruiker_id, aangemaakt_op);

-- Row-level security zonder FORCE: de platformcode (inlogrol, eigenaar) zoekt bij het inloggen een gebruiker op e-mailadres,
-- vóórdat er een tenant-context is. De applicatierol ziet alleen gebruikers van de eigen tenant en helemaal geen tokens.
alter table gebruiker enable row level security;
create policy tenant_isolatie on gebruiker
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on gebruiker to cockpit_app;

alter table inlog_token enable row level security;
