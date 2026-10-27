-- Woningtekst-module (ADR-016, stap B2): schrijfprofielen en voorbeeldteksten per tenant, en per intakedossier een
-- woningtekst met al zijn versies. Elke tabel heeft een eigen tenant_id met row-level security.

-- 1. Schrijfprofiel per tenant, met versies; hoogstens één actief. Het profiel is één JSON-document volgens het schema in
--    packages/ai (src/tekst/schrijfprofiel.schema.json); de applicatie controleert het vóór het opslaan.
create table intake_schrijfprofiel (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  versie integer not null check (versie > 0),
  status text not null check (status in ('concept', 'actief', 'gearchiveerd')),
  naam text not null,
  profiel jsonb not null,
  aangemaakt_door uuid references gebruiker (id),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, versie)
);
create unique index intake_schrijfprofiel_een_actief on intake_schrijfprofiel (tenant_id) where status = 'actief';

-- 2. Voorbeeldteksten van het kantoor; twee per generatie, bij voorkeur van dezelfde woningcategorie. Nooit in de repo.
create table intake_schrijfvoorbeeld (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  titel text not null,
  woningcategorie text not null check (woningcategorie in ('appartement', 'eengezinswoning', 'vrijstaand')),
  tekst text not null,
  aangemaakt_door uuid references gebruiker (id),
  aangemaakt_op timestamptz not null default now()
);

-- 3. De woningtekst van een intakedossier: steekwoorden per vraag, status en welke versie is goedgekeurd.
create table intake_woningtekst (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  dossier_id uuid not null references intake_dossier (id) on delete cascade,
  profiel_id uuid not null references intake_schrijfprofiel (id),
  steekwoorden jsonb not null default '{}'::jsonb,
  -- Keuze van de medewerker; leeg = afgeleid uit het woningtype in het profiel.
  woningcategorie text check (woningcategorie in ('appartement', 'eengezinswoning', 'vrijstaand')),
  status text not null default 'concept' check (status in ('concept', 'bezig', 'geschreven', 'mislukt', 'goedgekeurd')),
  -- Alleen een foutcode, nooit inhoud.
  fout text,
  goedgekeurde_versie_id uuid,
  goedgekeurd_door uuid references gebruiker (id),
  goedgekeurd_op timestamptz,
  gewijzigd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now(),
  unique (tenant_id, dossier_id)
);

-- 4. Elke versie: door het model geschreven of door een medewerker bewerkt. Het verschil helpt later profielen bijstellen.
create table intake_woningtekst_versie (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  woningtekst_id uuid not null references intake_woningtekst (id) on delete cascade,
  bron text not null check (bron in ('model', 'medewerker')),
  profiel_id uuid not null references intake_schrijfprofiel (id),
  inhoud jsonb not null,
  tekst text not null,
  -- Momentopname van de feiten en steekwoorden die meegingen, voor de bronnencontrole en om later terug te lezen.
  feiten jsonb,
  controles jsonb not null default '[]'::jsonb,
  model text,
  prompt_versie text,
  prompt_hash text,
  aangemaakt_door uuid references gebruiker (id),
  aangemaakt_op timestamptz not null default now()
);
create index intake_woningtekst_versie_tekst on intake_woningtekst_versie (tenant_id, woningtekst_id, aangemaakt_op);
alter table intake_woningtekst
  add constraint intake_woningtekst_goedgekeurde_versie foreign key (goedgekeurde_versie_id) references intake_woningtekst_versie (id);

do $$
declare
  t text;
begin
  foreach t in array array['intake_schrijfprofiel', 'intake_schrijfvoorbeeld', 'intake_woningtekst', 'intake_woningtekst_versie'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    execute format('grant select, insert, update, delete on %I to cockpit_app', t);
  end loop;
end $$;
