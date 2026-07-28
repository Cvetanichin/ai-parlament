-- ADR-0014 follow-up: organisation_members_insert_bootstrap's WITH CHECK
-- did `not exists (select 1 from organisation_members om2 where ...)` — a
-- subquery against the very table the policy is defined on. Postgres has
-- to apply organisation_members' own RLS policies to evaluate that
-- subquery, which requires re-evaluating this same INSERT policy's WITH
-- CHECK again, and so on: "infinite recursion detected in policy for
-- relation organisation_members" (42P17), only surfaced once the RLS
-- bootstrap flow was actually exercised live (local dev — the hosted
-- project's email-confirmation requirement had prevented this path from
-- ever running end-to-end before now).
--
-- Fix: move the "zero existing members" check into a SECURITY DEFINER
-- function. Such a function runs as its owner (bypassing the caller's RLS
-- context for its own internal query), breaking the recursive dependency
-- while keeping the exact same security boundary this ADR decided on.

create or replace function public.organisation_has_no_members(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.organisation_members
    where organisation_id = check_org_id
  );
$$;

revoke all on function public.organisation_has_no_members(uuid) from public;
grant execute on function public.organisation_has_no_members(uuid) to authenticated;

drop policy if exists "organisation_members_insert_bootstrap" on public.organisation_members;
create policy "organisation_members_insert_bootstrap" on public.organisation_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and public.organisation_has_no_members(organisation_id)
  );
