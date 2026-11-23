-- Pijplijn voor bezichtigersleads (issue #54, ADR-020): een bezichtiger wordt een lead zodra een medewerker een fase
-- kiest. Hoogstens één lead per bezichtiger; de lead hangt aan de persoon, niet aan een woning.
create table lead (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  -- Zolang de lead bestaat, blijft de bezichtiger staan (ook na de zes maanden van ADR-019).
  bezichtiger_id uuid not null references bezichtiger (id),
  fase_id uuid not null references pijplijn_fase (id),
  eigenaar_medewerker_id uuid references medewerker (id),
  notitie text check (char_length(notitie) <= 2000),
  -- Contactgegevens uit Realworks en links naar social media; worden in een volgende stap gevuld.
  email text,
  telefoon text,
  website text,
  linkedin_url text,
  facebook_url text,
  instagram_url text,
  contact_opgehaald_op timestamptz,
  aangemaakt_door uuid references gebruiker (id),
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_op timestamptz not null default now(),
  unique (tenant_id, bezichtiger_id)
);
create index lead_tenant_fase on lead (tenant_id, fase_id);

-- Elke wijziging van fase: van, naar, wie en wanneer. Geen vrije tekst.
create table lead_historie (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  lead_id uuid not null references lead (id) on delete cascade,
  van_fase_id uuid references pijplijn_fase (id),
  naar_fase_id uuid not null references pijplijn_fase (id),
  door_gebruiker_id uuid references gebruiker (id),
  op timestamptz not null default now()
);
create index lead_historie_tenant_lead on lead_historie (tenant_id, lead_id, op desc);

do $$
declare
  t text;
begin
  foreach t in array array['lead', 'lead_historie'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolatie on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    execute format('grant select, insert, update, delete on %I to cockpit_app', t);
  end loop;
end $$;
