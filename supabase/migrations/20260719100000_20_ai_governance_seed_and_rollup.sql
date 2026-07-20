-- AI Governance spec §2.2: "Initial Entries (Template-Level, per EAS §7.4's
-- Named List)." vendor_model uses the spec's own generic-but-accurate
-- phrasing (every ministry in this codebase routes through the LLM
-- Gateway, never a direct provider call) -- data_sources/monitoring_kpis
-- are deliberately left at their '{}' default, per the spec's own
-- instruction not to fabricate vendor/KPI detail that hasn't actually been
-- decided ("this table states the required entries and their risk tier,
-- not fabricated... detail not yet decided").
insert into public.ai_app_register (organisation_id, application_or_ministry, purpose, vendor_model, risk_tier, oversight_matrix_ref, review_cadence)
values
  (null, 'Grant Studio — Proposal Builder', 'Drafts donor-facing proposal sections (Concept Note / Full Application).', 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)', 'high_risk_equivalent', '§3, Polish/Submission Gate rows', 'quarterly'),
  (null, 'Writing Ministry', 'Narrative drafting for donor-facing content, feeding Proposal Builder and Reporting Studio.', 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)', 'high_risk_equivalent', '§3, Polish Gate row', 'quarterly'),
  (null, 'M&E — narrative generation', 'Monitoring & Evaluation narrative synthesis (me-agent) over indicator/activity/risk data.', 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)', 'high_risk_equivalent', '§3, Reporting row', 'quarterly'),
  (null, 'Reporting Studio', 'Post-award donor progress reports (interim/final narrative).', 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)', 'high_risk_equivalent', '§3, Reporting row', 'quarterly'),
  (null, 'Fundraising — Opportunity Intelligence', 'Media/opportunity monitoring and tagging; internal use only until a Proposal is built from it.', 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)', 'limited', '§3, Strategic Decision Gate row', 'quarterly')
on conflict do nothing;

-- Observability & Cost Service §1.2/§1.3: cost_rollups is "recomputed on a
-- schedule... never the source of truth for an individual invocation's
-- cost, only the aggregate view." This function IS the recompute logic
-- (pg_cron scheduling itself is an infrastructure/ops concern,
-- docs/15-Infrastructure/, not decided here) -- callable via
-- supabase.rpc() from a service-role Edge Function, same SECURITY DEFINER
-- pattern as apply_embedding_batch/match_knowledge_documents. source =
-- 'production' only, per this spec's own stated purpose: "Playground/
-- Replay/Benchmarking runs tag 'house_of_parliament' so they're excluded
-- from per-proposal/per-ministry production cost rollups."
create or replace function public.recompute_cost_rollup(
  p_organisation_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_period_start date,
  p_period_end date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_cost numeric;
  v_total_invocations integer;
  v_confidence jsonb;
  v_id uuid;
  v_scope_column text;
begin
  if p_scope_type not in ('ministry', 'proposal', 'project', 'user') then
    raise exception 'recompute_cost_rollup: unknown scope_type %', p_scope_type using errcode = '22023';
  end if;

  -- 'ministry' scopes by agent_id, 'user' by triggered_by, 'project' by
  -- project_id -- agent_runs carries no direct proposal/workflow-instance
  -- link at all (runGovernanceLoop's invokeAgent call passes only
  -- {brief, constraints, errorLog} as input_data, confirmed against
  -- workflowEngine.ts). The one real link that exists is via
  -- audit_events: runGovernanceLoop always writes a 'veto_result' row with
  -- agent_run_id set and target_type='workflow_instance', so 'proposal'
  -- rolls up agent_runs -> audit_events (by agent_run_id) ->
  -- workflow_instances (by target_id, target_type='proposal_section') ->
  -- proposal_sections.proposal_id -- not a column that doesn't exist on
  -- agent_runs.
  if p_scope_type = 'ministry' then
    select coalesce(sum(token_cost), 0), count(*)
      into v_total_cost, v_total_invocations
      from public.agent_runs
     where organisation_id = p_organisation_id
       and source = 'production'
       and agent_id = p_scope_id
       and created_at::date between p_period_start and p_period_end;
  elsif p_scope_type = 'user' then
    select coalesce(sum(token_cost), 0), count(*)
      into v_total_cost, v_total_invocations
      from public.agent_runs
     where organisation_id = p_organisation_id
       and source = 'production'
       and triggered_by = p_scope_id
       and created_at::date between p_period_start and p_period_end;
  elsif p_scope_type = 'project' then
    select coalesce(sum(token_cost), 0), count(*)
      into v_total_cost, v_total_invocations
      from public.agent_runs
     where organisation_id = p_organisation_id
       and source = 'production'
       and project_id = p_scope_id
       and created_at::date between p_period_start and p_period_end;
  else -- proposal
    select coalesce(sum(ar.token_cost), 0), count(*)
      into v_total_cost, v_total_invocations
      from public.agent_runs ar
      join public.audit_events ae on ae.agent_run_id = ar.id and ae.action = 'veto_result' and ae.target_type = 'workflow_instance'
      join public.workflow_instances wi on wi.id = ae.target_id and wi.target_type = 'proposal_section'
      join public.proposal_sections ps on ps.id = wi.target_id
     where ar.organisation_id = p_organisation_id
       and ar.source = 'production'
       and ps.proposal_id = p_scope_id
       and ar.created_at::date between p_period_start and p_period_end;
  end if;

  v_confidence := '{}'::jsonb; -- Parliament Core §2.3.2's confidence value lives in workflow_instance_history/audit_events, not agent_runs itself -- populating this distribution is a follow-up once that join is worth the cost, not fabricated here.

  insert into public.cost_rollups (organisation_id, scope_type, scope_id, period_start, period_end, total_token_cost, total_invocations, confidence_distribution)
  values (p_organisation_id, p_scope_type, p_scope_id, p_period_start, p_period_end, v_total_cost, v_total_invocations, v_confidence)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.recompute_cost_rollup(uuid, text, uuid, date, date) from public;
revoke all on function public.recompute_cost_rollup(uuid, text, uuid, date, date) from anon, authenticated;
grant execute on function public.recompute_cost_rollup(uuid, text, uuid, date, date) to service_role;
