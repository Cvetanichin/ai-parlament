-- Phase 1 seed data (Roadmap spec §3): the Governance Loop Workflow
-- Definition, and the three Agents (Research, Writing, Compliance Judge)
-- with their initial Prompt Versions. Agent registration/prompt versions
-- are also idempotently ensured at runtime by agentRuntime.ts's
-- ensureAgent/ensureActivePromptVersion, but seeding them here means the
-- system is usable immediately after migration, without a first-run step.

insert into public.workflow_definitions (name, version, states, transitions, vote_of_no_confidence_threshold, gates)
values (
  'Governance Loop',
  1,
  '["pending","running","awaiting_human","veto_failed","rewriting","escalated","completed","failed","cancelled"]'::jsonb,
  '[
    {"from":"pending","to":"running","trigger":"instance_created"},
    {"from":"running","to":"awaiting_human","trigger":"research_complete"},
    {"from":"running","to":"veto_failed","trigger":"veto_fail"},
    {"from":"veto_failed","to":"rewriting","trigger":"vote_of_no_confidence"},
    {"from":"rewriting","to":"running","trigger":"rewrite_dispatched"},
    {"from":"running","to":"escalated","trigger":"threshold_exhausted"},
    {"from":"escalated","to":"awaiting_human","trigger":"escalate_to_polish_gate"},
    {"from":"awaiting_human","to":"completed","trigger":"gate_approved"},
    {"from":"awaiting_human","to":"failed","trigger":"gate_rejected"}
  ]'::jsonb,
  2,
  '[
    {"atState":"awaiting_human","gateType":"go_no_go"},
    {"atState":"awaiting_human","gateType":"polish"}
  ]'::jsonb
)
on conflict (name, version) do nothing;

insert into public.ai_agents (slug, name, edge_function, description, allowed_tools)
values
  ('research_ministry', 'Research Ministry', 'workflow-research-run', 'Feasibility studies + donor guideline cross-check; produces the Go/No-Go Risk Matrix.', '{}'),
  ('writing_ministry', 'Writing Ministry', 'workflow-governance-run', 'Narrative Engine — drafts the Annex A narrative section.', '{}'),
  ('compliance_judge', 'Compliance Ministry — Semantic Judge', 'workflow-governance-run', 'Tripartite Veto Engine''s semantic tier — a deliberately separate persona from the drafting agent.', '{}')
on conflict (slug) do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Research Ministry v1', 'Cross-check project brief against donor guidelines; assess feasibility. See supabase/functions/_shared/ministries/research.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'research_ministry'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Writing Ministry v1', 'Draft the Annex A narrative section against brief + constraints, incorporating Vote of No Confidence error-log injection on retry. See supabase/functions/_shared/ministries/writing.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'writing_ministry'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Compliance Judge v1', 'Semantic judge — DIFFERENT role from the drafting agent. Scores whether a draft coherently and credibly addresses the project brief. See supabase/functions/_shared/vetoEngine.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'compliance_judge'
on conflict do nothing;
