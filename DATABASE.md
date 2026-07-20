# DATABASE.md

Source of truth for schema. This is a direct translation of the validated Airtable data model (`04_PromptLibrary_SystemPromptsStructure.md` §"Exact Airtable field-by-field setup sheet") into Postgres, with the `strict_output_enabled` governance column added per the structured-outputs decision (`chat convers.rtf`, `PROMPT_ENGINE.md`). Do not redesign this schema without a new ADR (see `PROJECT.md` §6).

## 1. Table overview

| Table | Primary key | Purpose |
|---|---|---|
| `prompt_modules` | `module_id` | Prompt registry — the authoritative store of every prompt and its schemas |
| `workflows` | `workflow_id` | Reusable orchestration pipelines |
| `workflow_steps` | `step_id` | Ordered execution steps within a workflow |
| `context_assets` | `context_id` | Reusable context packs (preferences, templates, donor rules, etc.) |
| `routing_rules` | `rule_id` | Classifier-to-workflow mapping, evaluated by priority |
| `output_formats` | `format_id` | Delivery format definitions |
| `validators` | `validator_id` | Validator registry and severity thresholds |
| `projects` | `project_id` | Project-level memory |
| `users` | `user_id` | User preferences and active project linkage |
| `task_runs` | `run_id` | One row per task execution |
| `run_steps` | `run_step_id` | One row per executed step within a run |

## 2. DDL

```sql
-- 001_init_schema.sql

create table prompt_modules (
  module_id                text primary key,
  name                      text not null,
  category                  text not null check (category in ('core','specialist','validator','formatter','utility')),
  domain                    text[] not null default '{}',
  description               text,
  prompt_text               text not null,
  input_schema_json         jsonb,
  output_schema_json        jsonb,
  default_output_type       text not null check (default_output_type in ('text','table','json','memo','doc_ready','spec')),
  version                   text not null default 'v1',
  status                    text not null default 'draft' check (status in ('draft','active','deprecated')),
  tags                      text[] not null default '{}',
  requires_context          boolean not null default false,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table workflows (
  workflow_id               text primary key,
  workflow_name             text not null,
  description               text,
  execution_pattern         text not null check (execution_pattern in ('direct_response','sequential_chain','branch_and_merge','planner_plus_workers')),
  primary_domain            text,
  trigger_keywords          text[] not null default '{}',
  default_specialist        text references prompt_modules(module_id),
  default_validator         text references prompt_modules(module_id),
  default_formatter         text references prompt_modules(module_id),
  active                    boolean not null default true,
  notes                     text,
  created_at                timestamptz not null default now()
);

create table workflow_steps (
  step_id                   text primary key,
  workflow_id               text not null references workflows(workflow_id) on delete cascade,
  step_order                integer not null,
  step_name                 text not null,
  step_role                 text not null check (step_role in ('core','planner','specialist','validator','formatter','logger')),
  module_id                 text not null references prompt_modules(module_id),
  required                  boolean not null default true,
  conditional_logic         text,
  input_mapping_json        jsonb,
  output_key                text not null,
  notes                     text,
  unique (workflow_id, step_order)
);

create table context_assets (
  context_id                text primary key,
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

create table routing_rules (
  rule_id                   text primary key,
  rule_name                 text not null,
  priority                  integer not null default 100,
  match_logic_json          jsonb not null,
  selected_workflow         text not null references workflows(workflow_id),
  specialist_override       text references prompt_modules(module_id),
  validator_override        text references prompt_modules(module_id),
  formatter_override        text references prompt_modules(module_id),
  active                    boolean not null default true,
  notes                     text
);

create table output_formats (
  format_id                 text primary key,
  name                      text not null,
  format_type               text not null check (format_type in ('memo','table','json','spec','doc_ready','slide_outline')),
  description               text,
  formatter_module          text references prompt_modules(module_id),
  output_schema_json        jsonb,
  notes                     text
);

create table validators (
  validator_id              text primary key,
  name                      text not null,
  validator_module          text references prompt_modules(module_id),
  focus_area                text[] not null default '{}',
  severity_threshold        text not null default 'medium' check (severity_threshold in ('low','medium','high')),
  notes                     text
);

create table projects (
  project_id                text primary key,
  project_name              text not null,
  domain                    text,
  description               text,
  default_context_assets    text[] not null default '{}',  -- array of context_id
  notes                     text,
  created_at                timestamptz not null default now()
);

create table users (
  user_id                   uuid primary key references auth.users(id),
  name                      text,
  email                     text,
  preferences_json          jsonb,
  active_project            text references projects(project_id),
  notes                     text
);

create table task_runs (
  run_id                    uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  user_input                text not null,
  normalized_input_json     jsonb,
  classification_json       jsonb,
  workflow_id               text references workflows(workflow_id),
  project_id                text references projects(project_id),
  user_id                   uuid references users(user_id),
  selected_context_json     jsonb,
  status                    text not null default 'queued' check (status in ('queued','running','completed','failed','needs_review')),
  final_output              text,
  final_output_json         jsonb,
  quality_assessment        text check (quality_assessment in ('strong','acceptable_with_revisions','weak')),
  notes                     text
);

create table run_steps (
  run_step_id               uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references task_runs(run_id) on delete cascade,
  step_order                integer not null,
  step_name                 text not null,
  module_id                 text references prompt_modules(module_id),
  input_json                jsonb,
  output_json               jsonb,
  status                    text not null check (status in ('completed','failed','skipped')),
  duration_ms               integer,
  error_message             text,
  notes                     text,
  created_at                timestamptz not null default now()
);
```

```sql
-- 003_add_strict_output_schema.sql

alter table prompt_modules
  add column if not exists strict_output_enabled boolean not null default false;

update prompt_modules
set strict_output_enabled = true
where module_id in (
  'INTAKE_NORMALIZER','INTENT_CLASSIFIER','WORKFLOW_ROUTER','CONTEXT_FILTER',
  'TASK_PLANNER','VALIDATOR_GENERIC','VALIDATOR_INDICATORS','VALIDATOR_MVP_REALISM',
  'RUN_LOGGER','FORMATTER_JSON'
);
```

## 3. Relationship map

| From | Field | To | On |
|---|---|---|---|
| `workflows` | `default_specialist` / `default_validator` / `default_formatter` | `prompt_modules` | `module_id` |
| `workflow_steps` | `workflow_id` | `workflows` | `workflow_id` |
| `workflow_steps` | `module_id` | `prompt_modules` | `module_id` |
| `routing_rules` | `selected_workflow` | `workflows` | `workflow_id` |
| `routing_rules` | `*_override` | `prompt_modules` | `module_id` |
| `output_formats` | `formatter_module` | `prompt_modules` | `module_id` |
| `validators` | `validator_module` | `prompt_modules` | `module_id` |
| `users` | `active_project` | `projects` | `project_id` |
| `task_runs` | `workflow_id` / `project_id` / `user_id` | respective tables | — |
| `run_steps` | `run_id` | `task_runs` | `run_id` (cascade delete) |
| `run_steps` | `module_id` | `prompt_modules` | `module_id` |

## 4. Notes on the Airtable → Postgres translation

- Airtable "Linked record" fields became Postgres foreign keys. `Multiple select` fields became `text[]`. Fields stored as "Long text (JSON as text)" in Airtable became native `jsonb` — this is strictly better in Postgres and should not be reverted to text.
- `projects.default_context_assets` stays as a `text[]` array rather than a join table for v1 — acceptable because it's low-cardinality and rarely queried from the other direction. Revisit only if context-asset-to-project queries become a bottleneck.
- `users.user_id` is bound to `auth.users(id)` (Supabase Auth), not a freestanding UUID — this is a deliberate deviation from the Airtable model, required by the security model (`SECURITY_MODEL.md`).
- Row Level Security is **not** defined in this migration — see `SECURITY_MODEL.md` and `ADR/011-security.md` for the RLS policy set, applied in a dedicated migration.

## 5. Seed data

`002_seed_core_modules.sql` inserts the 12 v1 module rows (see `PROMPT_MODULES.md` for prompt text sourced from the existing prompt library) and the 4 v1 workflow definitions with their `workflow_steps`. Claude Code must populate `prompt_text` from the existing prompt library documents verbatim — do not paraphrase or "improve" prompt wording during migration; wording changes are a Phase 2+ prompt-engineering task, not a schema migration task.
