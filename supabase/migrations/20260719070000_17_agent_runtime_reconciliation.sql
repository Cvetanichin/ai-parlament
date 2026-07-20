-- Project Operations spec §6 (Agent Runtime Reconciliation) + §7 (dual-path
-- governance). Source: the real, live me-agent/compliance-agent/
-- reporting-agent/proposal-agent Edge Functions, read directly from the
-- connected Intelligence Workspace codebase (figmaprojects,
-- supabase/functions/*) -- confirmed real source, not a description.

-- §7: "The reports row gains a submission_status field (internal_draft |
-- pending_human_review | approved_for_submission)... gated on that specific
-- use, not on every invocation" -- nullable, no default: only
-- interim_narrative/final_narrative reports headed for donor submission
-- ever get a value here; monthly_report/me_brief/compliance_review (the
-- three real, existing report_type values) never touch this column.
alter table public.reports add column if not exists submission_status text
  check (submission_status is null or submission_status in ('internal_draft', 'pending_human_review', 'approved_for_submission'));

-- §6: "insert the four current hardcoded prompts as version-1
-- prompt_modules rows, including registering proposal-agent in ai_agents
-- for the first time". Slugs match the real, live ai_agents.slug values
-- exactly (me-agent/compliance-agent/reporting-agent already exist as real
-- rows in production under these slugs, edge_function name = slug for all
-- four) -- ON CONFLICT DO NOTHING so this is a safe no-op against the real
-- table, matching the pattern 11_phase1_seed.sql already established for
-- research_ministry/writing_ministry/compliance_judge.
insert into public.ai_agents (slug, name, edge_function, description, allowed_tools)
values
  ('me-agent', 'M&E Ministry — Monthly Brief', 'me-agent', 'Monitoring & Evaluation intelligence brief against a Project''s indicators/activities/open risks. Internal fast path (Project Operations spec §7).', '{}'),
  ('compliance-agent', 'Compliance Ministry — Review', 'compliance-agent', 'Compliance/audit-readiness review against a Project''s documents, risks, activities, indicator data gaps. Internal fast path; donor-facing use additionally writes structured compliance_findings (Project Operations spec §7).', '{}'),
  ('reporting-agent', 'Reporting Ministry — Progress Report', 'reporting-agent', 'Donor progress report against a Project''s indicators/activities/risks/documents. Internal fast path for monthly_report; interim_narrative/final_narrative route through submission_status (Project Operations spec §7).', '{}'),
  ('proposal-agent', 'Proposal Ministry — Raw Passthrough', 'proposal-agent', 'Raw system+prompt passthrough, no project linkage. Newly registered here -- the real function never logged an agent_runs row (Project Operations spec §1.2); this closes that gap per §6.', '{}')
on conflict (slug) do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'M&E Ministry v1', 'Monthly M&E intelligence brief: project/period header, indicators (name/level/baseline/target/actual/unit/status), activities (title/status/responsible), open risks (title/risk_level/mitigation). Markdown sections: Executive Summary, Indicator Status, Activity Progress, Data Quality & Evidence Gaps, Key Risks, Recommended Actions. Under 600 words. See supabase/functions/_shared/ministries/projectIntelligence.ts for the actual template (ported near-verbatim from the real me-agent).', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'me-agent'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Compliance Ministry v1', 'Compliance/audit-readiness review: documents on file, risk register, activities, indicators with missing actuals. Markdown sections: Compliance Status Overview, Document Completeness, Data & Reporting Gaps, Risk Assessment, Audit Readiness, Required Actions -- plus an overall GREEN/AMBER/RED rating. See supabase/functions/_shared/ministries/projectIntelligence.ts for the actual template (ported near-verbatim from the real compliance-agent).', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'compliance-agent'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Reporting Ministry v1', 'Donor progress report: indicator/activity status summaries, completed/in-progress/delayed activities, open risks, document count. Markdown sections: Executive Summary, Progress Against Objectives, Activity Implementation, Results and Indicators, Challenges and Mitigations, Financial Overview, Next Steps, Annexes Required. See supabase/functions/_shared/ministries/projectIntelligence.ts for the actual template (ported near-verbatim from the real reporting-agent).', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'reporting-agent'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Proposal Ministry v1 — Passthrough', 'Raw system+prompt passthrough -- caller supplies both; no fixed template. See supabase/functions/_shared/ministries/projectIntelligence.ts.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'proposal-agent'
on conflict do nothing;
