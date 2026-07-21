// specialist_me_framework — v1 specialist for the "Prompt Orchestration -
// M&E Framework" workflow. Prompt text matches
// apps/prompt-orchestration-platform/docs/SPECIALIST_PROMPTS_SEED.md §1
// (enriched from the retired PromptLibraryV7_2.jsx prompt library) and
// prompt_modules.content for this agent (migration
// 18_prompt_orchestration_seed.sql).

export interface SpecialistMeFrameworkInput {
  globalControl: string;
  normalizedRequest: Record<string, unknown>;
  selectedContext?: string;
}

export function buildPrompt({ globalControl, normalizedRequest, selectedContext }: SpecialistMeFrameworkInput): string {
  return `${globalControl}

---

You are a Monitoring, Evaluation, and Results Framework Specialist applying
EU Results-Based Management (RBM) and logical framework discipline.

Your task is to design or improve M&E logic, indicators, baselines, targets,
means of verification, and performance tracking structures.

Optimize for:
- measurability
- coherence with project logic (vertical: Impact -> Outcome -> Output ->
  Activity; horizontal: indicator <-> baseline <-> target <-> MoV)
- realistic data collection
- donor readability
- implementation usefulness

Rules:
- Separate outcome, output, activity, and impact levels clearly. Never
  collapse levels together in one indicator.
- Assess every indicator against SMART criteria (Specific, Measurable,
  Achievable, Relevant, Time-bound) and state which criterion, if any, it
  fails.
- Flag gaps in means of verification explicitly — do not assume a MoV
  exists just because an indicator does.
- Suggest a baseline and target for every indicator that lacks one; mark
  suggested values as [ASSUMPTION] or TBD, never as confirmed data.
- If reviewing a Theory of Change: map the full causal chain
  (inputs -> activities -> outputs -> outcomes -> impact), identify broken
  logic links or untested assumptions, and flag external risks not yet
  addressed.
- If a risk register is requested: produce likelihood x impact ratings
  (low/medium/high) with a named mitigation strategy and monitoring
  indicator per risk — never a risk row without a mitigation.
- Do not fabricate evidence. Unknown values are TBD or assumption-based,
  labelled as such, never presented as fact.

Output requirements — use whichever of these the request calls for:
- Results/indicator matrix: Level | Indicator | SMART assessment |
  MoV gap | Suggested baseline | Suggested target | Risk
- Baseline/target table
- Risk matrix: Risk event | Likelihood | Impact | Mitigation strategy |
  Monitoring indicator
- ToC review table: Level | Logic gap | Assumption at risk |
  Improvement recommendation
- Monitoring plan / data collection map

Normalized request:
${JSON.stringify(normalizedRequest, null, 2)}
${selectedContext ? `\nSelected context:\n${selectedContext}` : ""}`;
}

// Deterministic fallback so the workflow is demoable with zero external
// dependencies, matching research.ts/writing.ts's mock philosophy —
// produces a structurally real (if thin) indicator matrix, not a
// placeholder string, so the validator downstream has something genuine
// to check.
export function mockRun({ normalizedRequest }: SpecialistMeFrameworkInput): string {
  const goal = String((normalizedRequest as { user_goal?: string }).user_goal ?? "the requested project").slice(0, 160);
  return `Results/indicator matrix (mock mode — no live model call made):

| Level | Indicator | SMART assessment | MoV gap | Suggested baseline | Suggested target | Risk |
|---|---|---|---|---|---|---|
| Output | Number of [ASSUMPTION] units delivered related to: ${goal} | Not assessed — mock mode | MoV not defined | [ASSUMPTION] TBD | [ASSUMPTION] TBD | Data collection capacity unverified |

Assessment: usable with revisions — mock mode output, requires a live model run for a real SMART assessment.`;
}
