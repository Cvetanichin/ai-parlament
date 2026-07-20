-- Prompt Orchestration Platform schema, per ADR-0011/0012 and
-- apps/prompt-orchestration-platform/docs/PHASE1_RESCOPING.md §1-2.
-- Additive only: extends the real, live ai_agents/prompt_modules/projects/
-- profiles tables per the same pattern ADR-0007 already established for
-- Parliament Core itself; adds 5 new tables for concepts with no existing
-- equivalent.

-- Additive columns on the existing Agent Version table (prompt_modules).
alter table public.prompt_modules add column if not exists category text
  check (category in ('core','specialist','validator','formatter','utility'));
alter table public.prompt_modules add column if not exists domain text[] not null default '{}';
alter table public.prompt_modules add column if not exists input_schema_json jsonb;
alter table public.prompt_modules add column if not exists output_schema_json jsonb;
alter table public.prompt_modules add column if not exists strict_output_enabled boolean not null default false;
alter table public.prompt_modules add column if not exists default_output_type text
  check (default_output_type in ('text','table','json','memo','doc_ready','spec'));
alter table public.prompt_modules add column if not exists tags text[] not null default '{}';
alter table public.prompt_modules add column if not exists requires_context boolean not null default false;

-- Additive columns on the real Project / Profile entities (ADR-0011 §2) --
-- POP's own "projects"/"users" tables are not created; these are reused.
alter table public.projects add column if not exists default_context_assets uuid[] not null default '{}';
alter table public.profiles add column if not exists preferences_json jsonb;
alter table public.profiles add column if not exists active_project uuid references public.projects(id);

-- context_assets: reusable context packs (style guides, donor requirements,
-- templates, and GLOBAL_CONTROL itself). Truly shared/global data, same
-- shape as ai_agents/prompt_modules/workflow_definitions (none of which
-- carry an organisation_id either) -- consistent with the confirmed v1
-- scope of a single Organisation (Product Vision spec §2).
create table public.context_assets (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  context_type              text not null check (context_type in (
                              'user_preferences','project_context','template','schema',
                              'style_guide','donor_requirements','domain_rules',
                              'example_output','uploaded_document_summary')),
  domain                    text[] not null default '{}',
  content                   text,
  content_json              jsonb,
  source_reference          text,
  active                    boolean not null default true,
  notes                     text,
  created_at                timestamptz not null default now()
);
alter table public.context_assets enable row level security;
create policy "context_assets_select" on public.context_assets for select
  to authenticated using (true);

-- routing_rules: classifier-output-to-workflow mapping, evaluated by
-- priority. The deterministic counterpart to WORKFLOW_ROUTER (dropped as
-- an LLM call per PHASE1_RESCOPING.md §5.2).
create table public.routing_rules (
  id                              uuid primary key default gen_random_uuid(),
  rule_name                       text not null,
  priority                        integer not null default 100,
  match_logic_json                jsonb not null,
  selected_workflow_definition_id uuid not null references public.workflow_definitions(id),
  specialist_override_agent_id    uuid references public.ai_agents(id),
  validator_override_agent_id     uuid references public.ai_agents(id),
  formatter_override_agent_id     uuid references public.ai_agents(id),
  active                          boolean not null default true,
  notes                           text
);
alter table public.routing_rules enable row level security;
create policy "routing_rules_select" on public.routing_rules for select
  to authenticated using (true);

-- output_formats: delivery format definitions.
create table public.output_formats (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  format_type               text not null check (format_type in ('memo','table','json','spec','doc_ready','slide_outline')),
  description               text,
  formatter_agent_id        uuid references public.ai_agents(id),
  output_schema_json        jsonb,
  notes                     text
);
alter table public.output_formats enable row level security;
create policy "output_formats_select" on public.output_formats for select
  to authenticated using (true);

-- validators: validator registry and severity thresholds (distinct from
-- compliance_findings, which is a result table, not a registry).
create table public.validators (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  validator_agent_id        uuid references public.ai_agents(id),
  focus_area                text[] not null default '{}',
  severity_threshold        text not null default 'medium' check (severity_threshold in ('low','medium','high')),
  notes                     text
);
alter table public.validators enable row level security;
create policy "validators_select" on public.validators for select
  to authenticated using (true);

-- prompt_orchestration_runs: satellite content table for POP's
-- orchestration runs, keyed 1:1 to a workflow_instances row -- holds the
-- raw user_input/normalized/classification/final-output content that the
-- deliberately domain-agnostic workflow_instances table has nowhere to
-- put. Organisation-scoped like workflow_instances/tasks/agent_runs
-- (actual execution data, not shared reference data).
create table public.prompt_orchestration_runs (
  id                        uuid primary key default gen_random_uuid(),
  workflow_instance_id      uuid not null references public.workflow_instances(id) on delete cascade,
  organisation_id           uuid not null references public.organisations(id),
  user_input                text not null,
  normalized_input_json     jsonb,
  classification_json       jsonb,
  selected_context_json     jsonb,
  final_output              text,
  final_output_json         jsonb,
  quality_assessment        text check (quality_assessment in ('strong','acceptable_with_revisions','weak')),
  created_at                timestamptz not null default now()
);
alter table public.prompt_orchestration_runs enable row level security;
create policy "prompt_orchestration_runs_select" on public.prompt_orchestration_runs for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "prompt_orchestration_runs_insert" on public.prompt_orchestration_runs for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
