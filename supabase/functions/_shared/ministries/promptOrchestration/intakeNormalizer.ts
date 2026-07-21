// intake_normalizer — control-plane agent, always runs first (before a
// workflow_instance even exists — PHASE1_RESCOPING.md §5.2). Strict
// Structured Output (ADR-0012); prompt text verbatim from
// apps/prompt-orchestration-platform/docs/04_PromptLibrary_SystemPromptsStructure.md
// §3, matching prompt_modules.content for this agent (migration
// 18_prompt_orchestration_seed.sql) — mirrors the existing
// research.ts/writing.ts convention of the code file being the executed
// template and the DB row documenting it (Parliament Core spec §3.8).

export interface IntakeNormalizerInput {
  globalControl: string;
  userInput: string;
}

export interface IntakeNormalizerOutput {
  user_goal: string;
  requested_deliverable: string;
  domain: string[];
  task_signals: string[];
  explicit_constraints: string[];
  implied_constraints: string[];
  source_materials_present: boolean;
  preferred_output_format: string | null;
  urgency_if_any: string | null;
  ambiguity_level: "low" | "medium" | "high";
  likely_complexity: "low" | "medium" | "high";
  external_context_needed: boolean;
  notes: string;
}

export function buildPrompt({ globalControl, userInput }: IntakeNormalizerInput): string {
  return `${globalControl}

---

You are the Intake Normalizer in a prompt orchestration system.

Your task is to convert the raw request into a structured intake object.

Extract and normalize:
- user_goal
- requested_deliverable
- domain
- task_signals
- explicit_constraints
- implied_constraints
- source_materials_present
- preferred_output_format
- urgency_if_any
- ambiguity_level
- likely_complexity
- whether external context or files seem necessary

Rules:
- Do not solve the task.
- Do not rewrite the request beyond normalization.
- Preserve the user's intent exactly.
- If something is not stated, mark it as null or inferred.
- Separate explicit statements from inferred interpretations.

Raw request:
${userInput}`;
}

// Structured-mode fallback (no API key / call failure) — deterministic,
// zero external dependencies, mirrors the shape generateStructured expects.
export function mockStructured({ userInput }: IntakeNormalizerInput): IntakeNormalizerOutput {
  return {
    user_goal: userInput.slice(0, 200),
    requested_deliverable: "unspecified — mock mode, no live model call made",
    domain: [],
    task_signals: [],
    explicit_constraints: [],
    implied_constraints: [],
    source_materials_present: false,
    preferred_output_format: null,
    urgency_if_any: null,
    ambiguity_level: "medium",
    likely_complexity: "medium",
    external_context_needed: false,
    notes: "mock mode — no live model call made",
  };
}
