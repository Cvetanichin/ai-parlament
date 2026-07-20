-- House of Parliament spec §2: platform operators "may not belong to any
-- CSO Organisation at all." Their gated actions (prompt approval/rollback,
-- institutional memory curation, Vote of No Confidence threshold changes)
-- are genuinely platform-level, not organisation-scoped -- ai_agents and
-- prompt_modules carry no organisation_id at all, and institutional-tier
-- memory_entries deliberately fix organisation_id to null (Platform
-- Services spec §3.1). audit_events.organisation_id was NOT NULL, which
-- would either force a fabricated organisation onto these events or, worse,
-- silently drop the audit trail for exactly the operator actions that most
-- need one (EAS principle 8, auditable by construction). Relaxed to
-- nullable -- every existing org-scoped write already supplies a real
-- organisation_id and is unaffected; only genuinely platform-level events
-- use the new null case.
alter table public.audit_events alter column organisation_id drop not null;

-- The existing organisation-scoped select policy already reads correctly
-- for org-scoped rows (organisation_id in (...)); platform-level (null
-- organisation_id) rows are visible only to platform operators, mirroring
-- House of Parliament spec §2's access model.
create policy "audit_events_select_platform_operator" on public.audit_events for select
  to authenticated using (
    organisation_id is null and exists (
      select 1 from public.profiles where id = (select auth.uid()) and is_platform_operator = true
    )
  );
