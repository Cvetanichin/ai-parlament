# PROJECT.md

**Read this file before every task. It is not optional context — it is the contract.**

---

## 1. Project Identity

**Name:** Prompt Orchestration Platform (working name — confirm before public naming)
**Owner:** Cvetanichin
**Purpose:** A database-driven AI workflow engine that routes a consulting request through classification, context assembly, planning, a domain specialist prompt, validation, and formatting — returning a donor-ready, donor-defensible, or build-ready deliverable. It replaces ad hoc ChatGPT prompting with a governed, versioned, auditable prompt system.

**Primary users:** Cvetanichin consultants (internally, v1) working across civil society, human rights, digital rights, M&E, grant development, advocacy, and product strategy for CSOs, NGOs, foundations, and donor-funded programmes.

**Non-goals for v1:** public multi-tenant SaaS, autonomous multi-agent execution without human review, real-time collaboration. These are Phase 4+ candidates (see ADR-015) — do not build toward them prematurely.

---

## 2. Stack (locked)

| Layer | Technology | Notes |
|---|---|---|
| Database | Postgres via Supabase | Source of truth for modules, schemas, workflows, runs |
| Backend logic | Supabase Edge Functions (Deno, TypeScript) | Orchestration only — no business rules |
| AI provider | OpenAI Responses API | Structured Outputs (`json_schema`, `strict: true`) for control-plane and most specialist steps |
| Frontend | React + Tailwind | Internal tool first; consumer-facing later if validated |
| Auth | Supabase Auth | Row-level security scoped by user/project |
| Hosting | Supabase (managed) + Vercel (frontend) | See DEPLOYMENT.md |

This stack was arrived at by explicit supersession: an earlier Airtable + Make no-code MVP (documented in `04_PromptLibrary_SystemPromptsStructure.md`) proved the data model and prompt architecture. That data model is preserved in `DATABASE.md`, translated into Postgres. **Airtable is not a fallback — do not reintroduce it without a new ADR.**

---

## 3. Architecture (one line)

```
Database (modules, schemas, workflows) → Edge Function → Workflow Engine → Prompt Modules → Validator → Formatter → Run Logger
```

Full detail: `ARCHITECTURE.md`. Full module registry: `PROMPT_MODULES.md`.

---

## 4. Golden Rules (non-negotiable)

1. **Prompt modules live in the database.** Never hardcode a prompt string in application code. `prompt_modules.prompt_text` is the only authoritative source.
2. **Schemas live in the database.** `prompt_modules.output_schema_json` is preferred over any hardcoded `STEP_SCHEMAS` object. Hardcoded schemas (`schemas.ts`) exist only as a fallback/bootstrap and must stay in sync — see ADR-006.
3. **Edge Functions never contain business rules.** Routing logic, validation thresholds, and domain judgment belong in the database (`routing_rules`, `validators` tables) or in prompt text — not in TypeScript conditionals.
4. **Edge Functions orchestrate only.** Their job is: fetch module → build input → call OpenAI → validate → persist → return. Nothing else.
5. **Every prompt module has:** an `input_schema_json` (may be null), an `output_schema_json`, a `version`, and a `status` (`draft` / `active` / `deprecated`).
6. **Every workflow is database-driven.** No workflow's step sequence is hardcoded in TypeScript. `workflow_steps` defines order and role.
7. **Everything must be replaceable without a code deploy.** Changing a prompt, a schema, or a routing rule is a database write, not a pull request. If you find yourself editing code to change what is effectively a business decision, stop and move that decision into the database.

---

## 5. Coding Style (summary — full detail in `CODING_STANDARDS.md`)

- Strict TypeScript. No `any`.
- No duplicated logic — extract shared helpers.
- No magic strings — module keys, workflow keys, and status enums are typed constants.
- Use Supabase RPC for multi-table writes that must be atomic; use direct table reads for simple queries.
- Prefer composition over inheritance.
- Validate inputs. Validate outputs. Both, always — see `PROMPT_ENGINE.md` §6 (three-layer validation).
- Every new feature requires tests (`TESTING_STRATEGY.md`).

---

## 6. What Claude Code Is and Is Not Allowed to Do

Claude Code is the **lead implementation engineer**, not the architect. The architecture in this documentation set already exists and has been decided. Claude Code's job is to implement it exactly, phase by phase, per `IMPLEMENTATION_PLAN.md`.

**Not allowed, ever, without a new ADR and explicit sign-off:**
- Simplify the system by removing modules or collapsing the pipeline.
- Merge components because they "look similar" (e.g. merging `VALIDATOR_INDICATORS` into `VALIDATOR_GENERIC`).
- Redesign the database schema.
- Replace Supabase with another backend.
- Introduce a framework, ORM, or state-management library not already in the stack.
- Leave `TODO` placeholders, mock implementations, or pseudo-code in a merged file.
- Modify files unrelated to the current task.

**Required on every task:**
- Read `PROJECT.md`, `BUILD_SPEC.md`, `IMPLEMENTATION_PLAN.md`, and the relevant ADR(s) first.
- Read existing code before writing new code — this repo has partial prior work; reconcile against it (see `IMPLEMENTATION_PLAN.md` Phase 0).
- If information is missing: (1) search the repo, (2) search `docs/`, (3) search the ADRs, (4) only then ask for clarification.
- Produce complete files, typed code, tests, and a short summary of what changed and why.
- Every change must compile and pass existing tests before being called done.

---

## 7. Document Map

| Document | Answers |
|---|---|
| `PROJECT.md` (this file) | Who is this for, what's the stack, what are the rules |
| `BUILD_SPEC.md` | What exactly to build — the master contract |
| `ARCHITECTURE.md` | How the layers fit together |
| `DATABASE.md` | Exact schema, DDL, relationships |
| `RPC_REFERENCE.md` | Every Postgres RPC function and its contract |
| `EDGE_FUNCTIONS.md` | Every Edge Function endpoint and its contract |
| `WORKFLOW_ENGINE.md` | How a task moves through the pipeline |
| `PROMPT_MODULES.md` | The 22-module registry and 4 workflow packs |
| `PROMPT_ENGINE.md` | Structured Outputs strategy, schema versioning |
| `CONTEXT_SYSTEM.md` | How context is selected and injected |
| `OUTPUT_FORMATS.md` | Formatter contracts |
| `VERSIONING.md` | How modules, schemas, and workflows are versioned |
| `CODING_STANDARDS.md` | TypeScript conventions |
| `ERROR_HANDLING.md` | Error taxonomy and handling rules |
| `TESTING_STRATEGY.md` | What must be tested and how |
| `SECURITY_MODEL.md` | Auth, RLS, secrets |
| `DEPLOYMENT.md` | How this ships |
| `IMPLEMENTATION_PLAN.md` | The phased checklist — start here for "what do I build next" |
| `ADR/001-015` | Why each major decision was made |

---

## 8. Assumptions Flagged for Owner Review

These were inferred to make this documentation set usable today. Confirm or correct before Phase 1 sign-off:

- **Project name** is a placeholder — confirm before it appears in user-facing copy.
- **Single-tenant, internal-first** is assumed. If external client access is needed sooner than Phase 4, RLS design in `SECURITY_MODEL.md` changes materially — flag now, not after build.
- **OpenAI** is assumed as the sole model provider for v1. No multi-provider abstraction is built (see ADR-010) — revisit only if cost or availability forces it.
