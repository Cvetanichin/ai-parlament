# PROMPT_ENGINE.md

How the system enforces schema-bound output from OpenAI. This document is the direct implementation spec from the architecture conversation and should be treated as close to copy-paste ready.

## 1. The core rule

Every orchestration step sends: the step prompt, a named JSON Schema, and `strict: true`. The runner rejects anything that doesn't conform. This is stronger than generic `json_object` mode, which only guarantees valid JSON — not conformance to a specific shape.

**Must be strict (control plane, always):** `INTAKE_NORMALIZER`, `INTENT_CLASSIFIER`, `WORKFLOW_ROUTER`, `CONTEXT_FILTER`, `TASK_PLANNER`, `VALIDATOR_GENERIC`, `VALIDATOR_INDICATORS`, `VALIDATOR_MVP_REALISM`, `RUN_LOGGER`.

**Usually strict:** `FORMATTER_JSON`, `SPECIALIST_PROMPT_ENGINEERING`, `SPECIALIST_PRODUCT_MVP` (when outputting schema/build specs), `SPECIALIST_ME_FRAMEWORK` (when outputting indicator matrices as structured records).

**Stays prose:** `FORMATTER_DONOR_READY`, some `SPECIALIST_GRANT_CONCEPT` runs, some `SPECIALIST_RESEARCH_SYNTHESIS` runs.

Rollout order: tighten the control plane first (Phase 1), then selected specialists (Phase 2+). Do not force donor-narrative prose into strict JSON — wrong place to start.

## 2. Schema strategy

One schema per step type, named and versioned (`intake_normalizer_v1`, `intent_classifier_v1`, etc.), not one universal schema. This gives versioning, easier debugging, and safer migrations.

## 3. Reference schemas (control plane)

These are the actual schemas to seed into `prompt_modules.output_schema_json` and mirror in `schemas.ts` as bootstrap fallback.

**`intake_normalizer_v1`**
```json
{
  "name": "intake_normalizer_v1",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "user_goal": { "type": "string" },
      "requested_deliverable": { "type": "string" },
      "domain": { "type": "array", "items": { "type": "string" } },
      "task_signals": { "type": "array", "items": { "type": "string" } },
      "explicit_constraints": { "type": "array", "items": { "type": "string" } },
      "implied_constraints": { "type": "array", "items": { "type": "string" } },
      "source_materials_present": { "type": "boolean" },
      "preferred_output_format": { "type": ["string", "null"] },
      "urgency_if_any": { "type": ["string", "null"] },
      "ambiguity_level": { "type": "string", "enum": ["low", "medium", "high"] },
      "likely_complexity": { "type": "string", "enum": ["low", "medium", "high"] },
      "external_context_needed": { "type": "boolean" },
      "notes": { "type": "string" }
    },
    "required": ["user_goal","requested_deliverable","domain","task_signals","explicit_constraints","implied_constraints","source_materials_present","preferred_output_format","urgency_if_any","ambiguity_level","likely_complexity","external_context_needed","notes"]
  }
}
```

**`intent_classifier_v1`**
```json
{
  "name": "intent_classifier_v1",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "primary_task_type": { "type": "string", "enum": ["writing","analysis","summarization","planning","ideation","evaluation","transformation","research","coding","product_design","workflow_design"] },
      "secondary_task_type": { "type": ["string", "null"] },
      "domain": { "type": "string", "enum": ["NGO_project_design","monitoring_and_evaluation","advocacy","grant_development","research_and_reporting","operations","product_and_mvp","prompt_engineering","general"] },
      "complexity": { "type": "string", "enum": ["low", "medium", "high"] },
      "execution_pattern": { "type": "string", "enum": ["direct_response","sequential_chain","branch_and_merge","planner_plus_workers"] },
      "risk_flags": { "type": "array", "items": { "type": "string", "enum": ["vague_request","missing_inputs","high_stakes","multi-document","conflicting_constraints","formatting_sensitive","evidence_sensitive","none"] } },
      "rationale": { "type": "string" }
    },
    "required": ["primary_task_type","secondary_task_type","domain","complexity","execution_pattern","risk_flags","rationale"]
  }
}
```

**`workflow_router_v1`, `task_planner_v1`, `validator_generic_v1`, `run_logger_v1`** — full definitions in the source conversation (`chat convers.rtf`); migrate identically. `task_planner_v1`'s `substeps` array is the schema `validatePlannerOutput` (§7 below) checks against.

## 4. Runner implementation

**Schema registry** (`schemas.ts`) — bootstrap fallback only, per `PROJECT.md` Golden Rule 2:

```ts
export const STEP_SCHEMAS: Record<string, unknown> = {
  INTAKE_NORMALIZER: { name: "intake_normalizer_v1", strict: true, schema: { /* as above */ } },
  INTENT_CLASSIFIER: { name: "intent_classifier_v1", strict: true, schema: { /* as above */ } },
  // ...remaining control-plane modules
};
```

**OpenAI Responses API wrapper** (`openai.ts`):

```ts
async function callOpenAIResponses(args: {
  model: string;
  input: string;
  schemaConfig?: unknown;
}): Promise<string> {
  const body: Record<string, unknown> = { model: args.model, input: args.input };

  if (args.schemaConfig) {
    body.text = { format: { type: "json_schema", json_schema: args.schemaConfig } };
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (typeof data.output_text === "string" && data.output_text.length > 0) return data.output_text;
  if (Array.isArray(data.output)) {
    const textParts: string[] = [];
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (content?.type === "output_text" && typeof content?.text === "string") textParts.push(content.text);
        }
      }
    }
    if (textParts.length > 0) return textParts.join("\n");
  }
  return JSON.stringify(data);
}
```

**Schema resolution** (database-first, hardcoded fallback — see `PROJECT.md` Golden Rule 2):

```ts
const schemaConfig =
  args.module.strict_output_enabled
    ? (args.module.output_schema_json ?? STEP_SCHEMAS[args.module.module_id] ?? null)
    : null;
```

## 5. Step runner

```ts
async function runPromptStep(args: {
  stepName: string;
  module: PromptModule;
  task: string;
  context: Record<string, Json>;
  expectJson: boolean;
  globalControl: PromptModule;
}): Promise<unknown> {
  const inputText = buildModelInput(args);
  const schemaConfig = args.expectJson
    ? (args.module.output_schema_json ?? STEP_SCHEMAS[args.module.module_id] ?? null)
    : null;

  const response = await callOpenAIResponses({ model: ORCHESTRATION_MODEL, input: inputText, schemaConfig });
  if (!args.expectJson) return response;

  const parsed = safeParseJson(response);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Structured output parsing failed for ${args.module.module_id}`);
  }
  return parsed;
}
```

No silent fallback parsing for strict steps — a step that fails to parse throws, and the run's `status` becomes `failed`. This replaces the pre-v1 runner's weak point of accepting fallback parsing on control-plane steps.

## 6. Three-layer validation

1. **Model-side schema enforcement** — OpenAI Structured Outputs, `strict: true` (§1–5 above).
2. **App-side parse check** — `safeParseJson` confirms the response is actually a parseable object (`runPromptStep`, §5).
3. **Semantic validation** — schema-valid does not mean logically good. A classifier can return a syntactically valid enum value while still picking the wrong domain. Layer 3 catches this class of error — see §7.

## 7. Semantic guards (`validation.ts`)

```ts
function validateRoutingDecision(obj: Record<string, unknown>, allowedWorkflowKeys: string[]): void {
  const selected = String(obj.selected_workflow ?? "");
  if (!allowedWorkflowKeys.includes(selected)) {
    throw new Error(`Invalid selected_workflow: ${selected}`);
  }
}

function validatePlannerOutput(obj: Record<string, unknown>): void {
  const substeps = obj.substeps;
  if (!Array.isArray(substeps) || substeps.length === 0) {
    throw new Error("Planner returned no substeps");
  }
  for (let i = 0; i < substeps.length; i++) {
    const step = substeps[i] as Record<string, unknown>;
    if (step.step_number !== i + 1) {
      throw new Error("Planner substeps must be sequential");
    }
  }
}

function validateAssessment(obj: Record<string, unknown>): void {
  const allowed = ["strong", "acceptable_with_revisions", "weak"];
  const value = String(obj.overall_assessment ?? "");
  if (!allowed.includes(value)) {
    throw new Error(`Invalid assessment: ${value}`);
  }
}
```

Additional guards to add during Phase 1 implementation (not yet in the source conversation, required by this spec): do module keys referenced in planner substeps actually exist in `prompt_modules`? If `needs_formatter = false` on a router decision, are formatter fields null? These follow the same pattern as the three guards above — throw on violation, don't warn-and-continue on a control-plane step.

## 8. Do not do (explicitly out of scope for v1)

- Do not over-design giant nested schemas for every prose formatter.
- Do not enforce strict JSON on everything — `FORMATTER_DONOR_READY` and prose-first specialist runs stay text.
- Do not store huge arbitrary outputs inside deeply nested schema objects — if a module's output doesn't fit cleanly in a flat-ish schema, that's a signal that module needs decomposing, not a bigger schema.
