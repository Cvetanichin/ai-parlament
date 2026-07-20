# CODING_STANDARDS.md

## 1. TypeScript

- `strict: true` in `tsconfig.json`. No `any` — use `unknown` and narrow, or define a proper type.
- No magic strings for module keys, workflow keys, status enums, or category values. Define them as `const` unions in `types.ts` and reuse everywhere (`PromptModuleId`, `WorkflowStatus`, etc.). If a value appears in a `check` constraint in `DATABASE.md`, it should appear as a typed union in `types.ts` — keep these in sync manually until a codegen step exists.
- No duplicated logic. If the same shape of code appears in two Edge Function files, extract it into `helpers.ts`.
- Prefer composition over inheritance — this codebase has no class hierarchies by design; prompt modules compose via data (`workflow_steps`), not via TypeScript subclassing.
- Every exported function has a typed signature — no inferred `any` return types slipping through.

## 2. File responsibility (do not blur these)

| File | Owns | Must not contain |
|---|---|---|
| `index.ts` | HTTP request/response handling, top-level orchestration loop | Prompt text, schemas, business rules |
| `types.ts` | Shared type definitions | Logic |
| `schemas.ts` | `STEP_SCHEMAS` bootstrap fallback | Anything not also mirrored in DB seed data |
| `openai.ts` | `callOpenAIResponses` and only that | Step-specific logic |
| `routing.ts` | Calls to `resolve_workflow_for_run` RPC, formats result | Hardcoded routing rules |
| `context.ts` | Context asset fetch/injection | Prompt text |
| `validation.ts` | Semantic guards (Layer 3) | Schema definitions (those live in `schemas.ts`/DB) |
| `helpers.ts` | `buildModelInput`, `safeParseJson`, shared utilities | Anything with a more specific home above |
| `logger.ts` | `RUN_LOGGER` integration, `record_run_step`/`finalize_task_run` calls | Business logic |

## 3. Naming

- Module IDs: `SCREAMING_SNAKE_CASE`, matching `prompt_modules.module_id` exactly.
- Workflow IDs: `SCREAMING_SNAKE_CASE`, matching `workflows.workflow_id`.
- Schema names: `lower_snake_case_v{n}`, matching `PROMPT_ENGINE.md` §2.
- TypeScript functions/variables: standard `camelCase`.

## 4. Commits

Prefer incremental commits over one large commit per phase. Every commit must compile and, where tests exist, pass them. A commit that adds one module's schema + seed row + test is a complete, reviewable unit — don't bundle three unrelated modules into one commit because they happen to be in the same phase.

## 5. What "production quality" means here

No `TODO`. No mock implementations left behind after a task is marked done. No pseudo-code. If a task can't be completed fully within scope, it stays `in_progress` / not merged — it does not get merged as a partial stub with a comment promising to finish it later.
