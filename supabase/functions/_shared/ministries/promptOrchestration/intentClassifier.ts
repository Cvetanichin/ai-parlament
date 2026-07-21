// intent_classifier — control-plane agent, runs after intake_normalizer
// and before workflow selection (PHASE1_RESCOPING.md §5.2). Its structured
// output feeds the deterministic routing function
// (promptOrchestrationRouting.ts) — never the source of routing authority
// itself; WORKFLOW_ROUTER's separate, non-authoritative LLM call was
// dropped entirely (§5.2), not just left unregistered. Strict Structured
// Output (ADR-0012); prompt text verbatim from
// 04_PromptLibrary_SystemPromptsStructure.md §4.

const DOMAINS = [
  "NGO_project_design",
  "monitoring_and_evaluation",
  "advocacy",
  "grant_development",
  "research_and_reporting",
  "operations",
  "product_and_mvp",
  "prompt_engineering",
  "general",
] as const;

export interface IntentClassifierInput {
  globalControl: string;
  normalizedInput: Record<string, unknown>;
}

export interface IntentClassifierOutput {
  primary_task_type: string;
  secondary_task_type: string | null;
  domain: (typeof DOMAINS)[number];
  complexity: "low" | "medium" | "high";
  execution_pattern: "direct_response" | "sequential_chain" | "branch_and_merge" | "planner_plus_workers";
  risk_flags: string[];
  rationale: string;
}

export function buildPrompt({ globalControl, normalizedInput }: IntentClassifierInput): string {
  return `${globalControl}

---

You are the Intent Classifier in a prompt orchestration workflow.

Your job is to classify the request, not to solve it.

Classify the request across the following dimensions:

1. Primary task type:
- writing
- analysis
- summarization
- planning
- ideation
- evaluation
- transformation
- research
- coding
- product_design
- workflow_design

2. Secondary task type if relevant

3. Domain:
- NGO_project_design
- monitoring_and_evaluation
- advocacy
- grant_development
- research_and_reporting
- operations
- product_and_mvp
- prompt_engineering
- general

4. Complexity:
- low
- medium
- high

5. Execution pattern:
- direct_response
- sequential_chain
- branch_and_merge
- planner_plus_workers

6. Risk flags:
- vague_request
- missing_inputs
- high_stakes
- multi-document
- conflicting_constraints
- formatting_sensitive
- evidence_sensitive
- none

Normalized intake:
${JSON.stringify(normalizedInput, null, 2)}`;
}

// Structured-mode fallback — a real (if coarse) heuristic over the
// normalized intake's own domain guess, not an arbitrary constant, so mock
// mode still exercises the routing path meaningfully.
export function mockStructured({ normalizedInput }: IntentClassifierInput): IntentClassifierOutput {
  const guessed = (normalizedInput.domain as string[] | undefined)?.[0];
  const domain = (DOMAINS as readonly string[]).includes(guessed ?? "") ? (guessed as (typeof DOMAINS)[number]) : "general";
  return {
    primary_task_type: "analysis",
    secondary_task_type: null,
    domain,
    complexity: "medium",
    execution_pattern: "sequential_chain",
    risk_flags: [],
    rationale: "mock mode — no live model call made; domain carried over from the normalized intake's own guess",
  };
}
