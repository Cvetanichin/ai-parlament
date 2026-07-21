-- Ministry Library completion, part 1 (EAS §3.2): registers the 3 of the 4
-- previously-missing v1 ministries that have a concrete spec deliverable —
-- Fundraising (Opportunity Intelligence), Finance & Administration (Budget
-- Studio drafting), Procurement (subcontract/vendor-selection rationale).
-- No new tables/columns: all three read/write tables that already exist
-- (opportunities, budgets, partners), matching this codebase's "reuse
-- existing schema over adding columns" pattern.
--
-- Development Ministry is deliberately NOT seeded here — ADR-0011 proposes
-- a minimal contract for it, not yet approved. Seeding an ai_agents row
-- with no real Ministry Adapter behind it would be worse than leaving it
-- absent (an apparently-registered Agent that silently does nothing).

insert into public.ai_agents (slug, name, edge_function, description, allowed_tools)
values
  ('fundraising_ministry', 'Fundraising Ministry', 'opportunity-ingest-run', 'Opportunity Intelligence — drafts advisory strategic narrative + risk/relevance scoring for an ingested Opportunity (Grant Studio §2.2, advisory only).', '{}'),
  ('finance_admin_ministry', 'Finance & Administration Ministry', 'budget-narrative-draft-run', 'Budget Studio — drafts the budget justification narrative a human refines (Grant Studio §7). Holds no cost-eligibility ceiling itself.', '{}'),
  ('procurement_ministry', 'Procurement Ministry', 'procurement-decision-draft-run', 'Drafts a subcontract/vendor-selection decision rationale for human review before it is recorded via partner-amendment-run (Grant Studio §4.3).', '{}')
on conflict (slug) do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Fundraising Ministry v1', 'Assess a funding opportunity and draft advisory strategic narrative + risk/relevance scoring for Research to cross-check. See supabase/functions/_shared/ministries/fundraising.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'fundraising_ministry'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Finance & Administration Ministry v1', 'Draft a budget justification narrative against line items + indirect cost rate, deferring all eligibility/ceiling questions to the Regulatory Knowledge Layer. See supabase/functions/_shared/ministries/financeAdministration.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'finance_admin_ministry'
on conflict do nothing;

insert into public.prompt_modules (agent_id, name, content, version, status, approval_state, model_provider, model_name)
select id, 'Procurement Ministry v1', 'Draft a subcontract/vendor-selection rationale against applicable thresholds for human review. See supabase/functions/_shared/ministries/procurement.ts for the actual template.', 1, 'active', 'approved', 'anthropic', 'claude-sonnet-4-6'
from public.ai_agents where slug = 'procurement_ministry'
on conflict do nothing;
