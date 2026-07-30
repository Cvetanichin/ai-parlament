-- Security advisor finding (surfaced by the newly-connected read-only
-- Supabase MCP server): migration 21's blanket
-- `grant execute on all functions in schema public to anon, authenticated,
-- service_role` was too broad. It exposed SECURITY DEFINER functions --
-- bootstrap_own_organisation(), handle_new_user(), and the pre-existing
-- apply_embedding_batch() -- as anon-callable RPCs
-- (/rest/v1/rpc/<function_name>), none of which should be reachable by an
-- unauthenticated caller in this app. Checked exploitability: none of the
-- three are currently exploitable (bootstrap_own_organisation hits a
-- NOT NULL constraint on organisations.name when auth.uid() is null;
-- handle_new_user references the trigger-only NEW variable and Postgres
-- rejects a direct call outright) -- but both are relying on incidental
-- protection, not an actual access-control boundary. This app has no
-- legitimate use for anon executing any custom function directly (every
-- .rpc() call in the client only ever runs post-login, never anon) --
-- table-level anon grants from migration 21 are untouched here and remain
-- correctly gated by RLS, which has no equivalent for function EXECUTE.

revoke execute on all functions in schema public from anon;

-- Also stop granting anon execute on any function created after this
-- migration -- undoes the anon half of migration 21's
-- `alter default privileges ... grant execute on functions to anon, ...`
-- default privilege entry. authenticated/service_role keep their default
-- grant; only anon's is removed.
alter default privileges in schema public revoke execute on functions from anon;
