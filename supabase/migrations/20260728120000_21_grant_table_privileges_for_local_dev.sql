-- Local-dev-only gap fix, not an architecture change: the hosted Supabase
-- platform auto-grants table privileges to anon/authenticated/service_role
-- on every table created via a migration, behind the scenes, as a control-
-- plane convenience. Plain `supabase start` against local/self-hosted
-- Postgres does not replicate that behind-the-scenes grant, so every table
-- this repo's migrations created was left with no privileges for those
-- roles at all locally — RLS policies exist and are correct, but Postgres
-- never gets far enough to evaluate them without the underlying GRANT.
-- Applying this to the hosted project too is a harmless no-op (privileges
-- already exist there) — done for parity between local and remote.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Ensure the same grants apply automatically to any table/sequence/function
-- a future migration adds, without needing to repeat this migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
