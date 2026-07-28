-- Code review finding on PR #14: the client-side bootstrap (two separate
-- inserts from useAuth.tsx) has no protection against two concurrent
-- executions for the same user creating two separate organisations — e.g.
-- opening the app in two tabs right after signup. The zero-members RLS
-- check (migration 22) only stops inserting into an org someone else
-- already owns; it does nothing to stop the same user's own two racing
-- attempts from each creating a brand-new org.
--
-- Fix: replace the two client-writable inserts with a single atomic,
-- SECURITY DEFINER RPC that serializes concurrent calls for the same user
-- via a transaction-scoped advisory lock, keyed on their user id. This is
-- the "do the bootstrap entirely server-side" alternative ADR-0014 already
-- flagged as more robust — implemented now that a real race was found.
-- The two insert policies from migration 20/22 are no longer needed: all
-- writes go through this function instead, so they're dropped, tightening
-- the security posture (no client-writable path into organisations/
-- organisation_members outside this one atomic operation).

create or replace function public.bootstrap_own_organisation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org_id uuid;
  new_org_id uuid;
  caller_email text;
begin
  -- Serialize concurrent calls for the same user across tabs/connections —
  -- held until the end of this transaction, released automatically.
  perform pg_advisory_xact_lock(hashtext('bootstrap_own_organisation'), hashtext((select auth.uid())::text));

  select organisation_id into existing_org_id
  from public.organisation_members
  where user_id = (select auth.uid())
  limit 1;

  if existing_org_id is not null then
    return existing_org_id;
  end if;

  select email into caller_email from auth.users where id = (select auth.uid());

  insert into public.organisations (name)
  values (coalesce(caller_email, (select auth.uid())::text) || '''s Organisation')
  returning id into new_org_id;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (new_org_id, (select auth.uid()), 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.bootstrap_own_organisation() from public;
grant execute on function public.bootstrap_own_organisation() to authenticated;

drop policy if exists "organisations_insert" on public.organisations;
drop policy if exists "organisation_members_insert_bootstrap" on public.organisation_members;

-- organisation_has_no_members (migration 22) was only ever used by the
-- policy just dropped above — no longer needed.
drop function if exists public.organisation_has_no_members(uuid);
