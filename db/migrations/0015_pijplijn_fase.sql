-- Pijplijn voor bezichtigersleads (issue #54, ADR-020): de fases per kantoor. De kantoorbeheerder beheert ze in het
-- portaal; bij de onboarding van een kantoor wordt de eerste set vastgelegd.
create table pijplijn_fase (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id),
  naam text not null check (char_length(naam) between 1 and 40),
  volgorde integer not null,
  -- Lopend, of een eindfase. Wat gewonnen inhoudt, bepaalt het kantoor zelf.
  soort text not null default 'open' check (soort in ('open', 'gewonnen', 'verloren')),
  actief boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);
create unique index pijplijn_fase_tenant_naam on pijplijn_fase (tenant_id, lower(naam));
create index pijplijn_fase_tenant_volgorde on pijplijn_fase (tenant_id, volgorde);

alter table pijplijn_fase enable row level security;
alter table pijplijn_fase force row level security;
create policy tenant_isolatie on pijplijn_fase
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on pijplijn_fase to cockpit_app;

-- De fases waarmee C&R test (Tim, 2026-11-23).
alter table pijplijn_fase no force row level security;
insert into pijplijn_fase (tenant_id, naam, volgorde, soort)
select t.id, f.naam, f.volgorde, f.soort
  from tenant t
 cross join (values ('Social media marketing', 1, 'open'), ('Telefonisch benaderd', 2, 'open'), ('Voorstel gestuurd', 3, 'open'), ('Gewonnen', 4, 'gewonnen'), ('Verloren', 5, 'verloren')) as f(naam, volgorde, soort)
 where t.sleutel = 'cr';
alter table pijplijn_fase force row level security;
