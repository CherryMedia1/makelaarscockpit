-- Inventarisatie van de database in dev (issue #39): per tabel en per tenant het aantal rijen en de oudste en nieuwste
-- aanmaakdatum. Alleen lezen, geen kolominhoud: geen namen, e-mailadressen, adressen of transcripttekst (harde regel 2).
-- De uitvoer bevat tabelnamen, tenant-id's, aantallen en tijdstippen.
--
-- VERBINDEN
-- Postgres in dev is Entra-only: er bestaat geen beheerderswachtwoord. De firewall laat alleen het vaste NAT-IP toe
-- (regel allow-nat-gateway), dus rechtstreeks vanuit Cloud Shell kom je er niet in. Gebruik de toolbox-container: die
-- gaat via het NAT-IP naar buiten en logt in als de managed identity id-cockpit-dev-neu.
--
--   In Cloud Shell, als jezelf:
--     az account set -s cockpit-dev
--     bash infra/scripts/toolbox.sh
--   In de shell van de toolbox:
--     tdnf install -y postgresql          # psql zit niet in het image; pakketnaam niet getest, zie README
--     az login --identity --client-id "$AZURE_CLIENT_ID" --output none
--     export PGHOST=psql-cockpit-dev-neu.postgres.database.azure.com PGDATABASE=cockpit PGUSER=id-cockpit-dev-neu PGSSLMODE=require
--     export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--     curl -fsSL https://raw.githubusercontent.com/CherryMedia1/makelaarscockpit/main/infra/scripts/inventaris-dev.sql | psql -X -f -
--   Het token is ongeveer een uur geldig en verdwijnt met de container. Kopieer de uitvoer en typ exit.
--
-- WELKE ROL
-- De eigenaar van de tabellen: id-cockpit-dev-neu (de rol waarmee de migratie-job draait). Waarom:
--   - de tenant-tabel is alleen voor de eigenaar volledig leesbaar (migratie 0003); cockpit_app ziet één tenant;
--   - inlog_token heeft geen beleid voor cockpit_app (migratie 0005); alleen de eigenaar ziet rijen;
--   - je eigen Entra-beheerdersaccount is geen eigenaar en heeft naar verwachting geen SELECT op de tabellen.
-- BYPASSRLS is niet nodig en RLS gaat niet uit: het script zet per tenant app.tenant_id (zoals metTenant in
-- packages/db) en telt binnen het beleid, met daarnaast een eigen filter op tenant_id. Elke tenant_id verwijst met een
-- foreign key naar tenant, dus alle tenants langslopen dekt alle rijen.
--
-- Vereist psql (\gexec). Stopt bij de eerste fout; er wordt niets gewijzigd (read only, rollback aan het eind).

\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

\echo
\echo == 0. Controle: rol en transactie ==
select current_user as rol,
       current_setting('transaction_read_only') as alleen_lezen,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls,
       (select count(*) from pg_tables where schemaname = 'public' and tableowner = current_user) as tabellen_van_deze_rol,
       (select count(*) from pg_tables where schemaname = 'public') as tabellen_totaal;

\echo
\echo == 1. Tabellen in public die dit script niet telt (verwacht: alleen schema_migraties) ==
select c.relname as tabel,
       c.relrowsecurity as rls,
       c.relforcerowsecurity as rls_force,
       exists (
         select from information_schema.columns k
          where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'tenant_id'
       ) as heeft_tenant_id
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind in ('r', 'p')
   and c.relname not in (
     'tenant', 'medewerker', 'object', 'verkoop', 'verkoop_verdeling', 'kostenregel', 'doelstelling', 'gebruiker',
     'inlog_token', 'waardebepaling', 'agendapunt', 'woning', 'woning_stap', 'tenant_module', 'intake_dossier',
     'intake_bron', 'intake_veld', 'intake_verbruik', 'intake_schrijfprofiel', 'intake_schrijfvoorbeeld',
     'intake_woningtekst', 'intake_woningtekst_versie'
   )
 order by 1;

\echo
\echo == 1b. RLS per tabel: aan, FORCE (geldt ook voor de eigenaar), aantal beleidsregels, eigenaar is de ingelogde rol ==
\echo Verwacht zonder FORCE: tenant, gebruiker, inlog_token (bewust, migraties 0003 en 0005) en schema_migraties (geen RLS).
select c.relname as tabel,
       c.relrowsecurity as rls,
       c.relforcerowsecurity as rls_force,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as beleid,
       pg_get_userbyid(c.relowner) = current_user as eigenaar_is_deze_rol
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by c.relforcerowsecurity, c.relname;

\echo
\echo == 2. Tenants (de tabel zelf heeft geen tenant_id; het id is de tenant) ==
select 'tenant' as tabel, id as tenant_id, 1 as aantal, aangemaakt_op as oudste, aangemaakt_op as nieuwste
  from tenant
 order by aangemaakt_op;

\echo
\echo == 3. Per tenant: aantal rijen, oudste en nieuwste per tabel ==
\echo Datumkolom is aangemaakt_op, tenzij vermeld. doelstelling heeft geen datumkolom.
-- Per tenant twee opdrachten: eerst de tenant-context, dan de telling. \gexec voert ze op volgorde uit.
select opdracht
  from (
    select t.id, 1 as volgorde,
           format('select set_config(''app.tenant_id'', %L, true) as tenant_in_context', t.id) as opdracht
      from tenant t
    union all
    select t.id, 2,
           $telling$
select tabel, tenant_id, aantal, oudste, nieuwste, datumkolom
  from (
    select 'medewerker' as tabel, current_setting('app.tenant_id')::uuid as tenant_id, count(*) as aantal, min(aangemaakt_op) as oudste, max(aangemaakt_op) as nieuwste, 'aangemaakt_op' as datumkolom
      from medewerker where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'object', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from object where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'verkoop', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from verkoop where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'verkoop_verdeling', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from verkoop_verdeling where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'kostenregel', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from kostenregel where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'doelstelling', current_setting('app.tenant_id')::uuid, count(*), null::timestamptz, null::timestamptz, '(geen)'
      from doelstelling where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'gebruiker', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from gebruiker where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'inlog_token', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from inlog_token where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'waardebepaling', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from waardebepaling where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'agendapunt', current_setting('app.tenant_id')::uuid, count(*), min(gesynchroniseerd_op), max(gesynchroniseerd_op), 'gesynchroniseerd_op'
      from agendapunt where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'woning', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from woning where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'woning_stap', current_setting('app.tenant_id')::uuid, count(*), min(gewijzigd_op), max(gewijzigd_op), 'gewijzigd_op'
      from woning_stap where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'tenant_module', current_setting('app.tenant_id')::uuid, count(*), min(aan_sinds), max(aan_sinds), 'aan_sinds'
      from tenant_module where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_dossier', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_dossier where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_bron', current_setting('app.tenant_id')::uuid, count(*), min(ontvangen_op), max(ontvangen_op), 'ontvangen_op'
      from intake_bron where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_veld', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_veld where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_verbruik', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_verbruik where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_schrijfprofiel', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_schrijfprofiel where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_schrijfvoorbeeld', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_schrijfvoorbeeld where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_woningtekst', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_woningtekst where tenant_id = current_setting('app.tenant_id')::uuid
    union all
    select 'intake_woningtekst_versie', current_setting('app.tenant_id')::uuid, count(*), min(aangemaakt_op), max(aangemaakt_op), 'aangemaakt_op'
      from intake_woningtekst_versie where tenant_id = current_setting('app.tenant_id')::uuid
  ) telling
 order by tabel
           $telling$
      from tenant t
  ) opdrachten
 order by id, volgorde
\gexec

rollback;
