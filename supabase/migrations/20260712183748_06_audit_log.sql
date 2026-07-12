create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  actor_type text not null check (actor_type in ('agent','human','system')),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  agent_run_id uuid references public.agent_runs(id),
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
create policy "audit_events_select" on public.audit_events for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "audit_events_insert" on public.audit_events for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.compliance_findings from authenticated;
revoke update, delete on public.workflow_instance_history from authenticated;
-- agent_runs deliberately NOT revoked — spec §14 open item, security-definer
-- status-transition function not yet designed; revoking would break the
-- real edge functions' live UPDATE calling convention.
