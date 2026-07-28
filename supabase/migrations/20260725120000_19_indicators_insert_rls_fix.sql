-- Fix indicators_insert RLS policy: it only checked project_id, while its
-- sibling select/update/delete policies (added in migration 16) also allow
-- organisation_id-scoped access. This silently blocked every pre-award
-- indicator insert (proposal_id set, project_id still null, per the
-- Logframe Studio data contract in docs/07-Grant-Studio/
-- Grant-Studio-Specification-v1.0.md §6.1) since project_id IN (...) is
-- never true for a null project_id. Brings insert in line with the
-- organisation_id check budgets_insert already uses for the same
-- pre-award/post-award shape.

drop policy if exists indicators_insert on public.indicators;
create policy indicators_insert on public.indicators for INSERT to authenticated with check (
  (project_id IN (
    SELECT projects.id FROM projects WHERE (projects.created_by = (SELECT auth.uid()))
  ))
  OR (organisation_id IN (
    SELECT organisation_members.organisation_id FROM organisation_members
    WHERE (organisation_members.user_id = (SELECT auth.uid()))
  ))
);
