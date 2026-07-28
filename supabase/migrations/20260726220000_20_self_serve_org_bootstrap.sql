-- ADR-0014: self-serve organisation bootstrap on first sign-up.
-- organisations/organisation_members previously had select-only policies;
-- a brand-new signup had no path to an organisation at all (migration 01's
-- backfill only ever covered pre-existing users). See the ADR for why the
-- zero-members check on the members policy is the real security boundary,
-- not the role='owner' check alone.

create policy "organisations_insert" on public.organisations for insert
  to authenticated with check (true);

create policy "organisation_members_insert_bootstrap" on public.organisation_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and not exists (
      select 1 from public.organisation_members om2
      where om2.organisation_id = organisation_members.organisation_id
    )
  );
