-- Intake-module, fase A (ADR-013, ADR-015): betaalde modules per tenant, een dossier per woning, bronnen, profielvelden
-- en tokenverbruik. Elke tabel heeft een eigen tenant_id met row-level security, ook de kindtabellen van het dossier.

-- 1. Betaalde modules per tenant. De applicatie leest alleen; aan- en uitzetten gaat via een migratie of beheer.
create table tenant_module (
  tenant_id uuid not null references tenant (id),
  module text not null check (module in ('intake')),
  aan_sinds timestamptz not null default now(),
  primary key (tenant_id, module)
);

-- 2. Een intakedossier per woning op het bord (ADR-012). Adres en object komen van de woning.
create table intake_dossier (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  woning_id uuid not null references woning (id),
  status text not null default 'open' check (status in ('open', 'opgeschoond')),
  aangemaakt_door uuid references gebruiker (id),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, woning_id)
);

-- 3. Elke input. Zonder dossier = een opname die nog gekoppeld moet worden (inbox). Het bestand staat in Blob-container
--    `intake` onder {tenant}/{dossier}/; na opschonen (ADR-015) is blob_pad leeg en de status `verwijderd`.
create table intake_bron (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  dossier_id uuid references intake_dossier (id) on delete cascade,
  type text not null check (type in ('plaud_transcript', 'plaud_note', 'gespreksverslag_pdf', 'checklist_form', 'checklist_pdf', 'meetrapport', 'bag', 'ep_online')),
  extern_id text,
  bestandsnaam text,
  inhoudstype text,
  blob_pad text,
  verwerkstatus text not null default 'nieuw' check (verwerkstatus in ('nieuw', 'bezig', 'verwerkt', 'mislukt', 'verwijderd')),
  -- Alleen een foutcode of technische melding, nooit inhoud uit de bron.
  verwerkfout text,
  toegevoegd_door uuid references gebruiker (id),
  ontvangen_op timestamptz not null default now(),
  verwerkt_op timestamptz,
  unique (tenant_id, type, extern_id)
);
create index intake_bron_dossier on intake_bron (tenant_id, dossier_id);

-- 4. Eén waarde in het woningprofiel. Meerdere rijen per pad kunnen naast elkaar bestaan (een per bron);
--    hooguit één is bevestigd. bron_id leeg = handmatig ingevoerd of gecorrigeerd door een medewerker.
create table intake_veld (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  dossier_id uuid not null references intake_dossier (id) on delete cascade,
  pad text not null,
  waarde jsonb not null,
  bron_id uuid references intake_bron (id) on delete set null,
  -- { citaat, tijdstempel, pagina }; het citaat verdwijnt bij opschonen na verkoop.
  bewijs jsonb,
  zekerheid numeric(3, 2) check (zekerheid between 0 and 1),
  status text not null check (status in ('voorstel', 'bevestigd', 'conflict', 'afgewezen')),
  bevestigd_door uuid references gebruiker (id),
  bevestigd_op timestamptz,
  gewijzigd_door uuid references gebruiker (id),
  gewijzigd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now()
);
create index intake_veld_dossier_pad on intake_veld (tenant_id, dossier_id, pad);
create unique index intake_veld_een_bevestigd on intake_veld (dossier_id, pad) where status = 'bevestigd';

-- 5. Tokenverbruik per stap, voor de kostenbewaking (plan §9). Blijft bewaard na opschonen.
create table intake_verbruik (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  dossier_id uuid references intake_dossier (id) on delete cascade,
  stap text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  kosten_eur numeric(10, 4) not null check (kosten_eur >= 0),
  aangemaakt_op timestamptz not null default now()
);
create index intake_verbruik_dossier on intake_verbruik (tenant_id, dossier_id);

do $$
declare
  t text;
begin
  foreach t in array array['tenant_module', 'intake_dossier', 'intake_bron', 'intake_veld', 'intake_verbruik'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  end loop;
end $$;
grant select on tenant_module to cockpit_app;
grant select, insert, update, delete on intake_dossier, intake_bron, intake_veld, intake_verbruik to cockpit_app;

-- C&R is launching customer van de module.
alter table tenant_module no force row level security;
insert into tenant_module (tenant_id, module) select id, 'intake' from tenant where sleutel = 'cr';
alter table tenant_module force row level security;
