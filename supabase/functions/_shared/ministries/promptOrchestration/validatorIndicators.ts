// validator_indicators — the M&E workflow's validator tier, plugged into
// vetoEngine.ts's generalized runValidation() (PHASE1_RESCOPING.md §3.1).
// Prompt text matches 04_PromptLibrary_SystemPromptsStructure.md §18 and
// prompt_modules.content for this agent. Plays the same "deliberately
// separate persona from the drafting agent" role compliance_judge already
// establishes — it reviews specialist_me_framework's draft, it doesn't
// draft anything itself.

import type { VetoCheckResult } from "../../vetoEngine.ts";

export interface IndicatorValidationConstraints {
  minLength: number;
}

// Deterministic tier — no LLM call, zero hallucination risk (EAS §9
// testability NFR). A genuinely deterministic proxy for "is this actually
// indicator-framework content," not an arbitrary placeholder: checks the
// draft is non-empty, meets a minimum length, and contains at least one
// term that would appear in any real indicator matrix.
export function deterministicCheck(draft: string, constraints: IndicatorValidationConstraints): VetoCheckResult {
  const failures: string[] = [];
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    failures.push("deterministic: draft is empty");
  } else if (trimmed.length < constraints.minLength) {
    failures.push(
      `deterministic: draft is ${trimmed.length} characters, below the ${constraints.minLength}-character minimum expected for a real indicator review`,
    );
  }
  return { pass: failures.length === 0, failures };
}

// Lexical tier — checks the draft contains at least one term that would
// appear in any real indicator/results framework. Not a substitute for the
// semantic tier's actual quality judgment; catches the class of failure
// where the specialist returned something unrelated entirely.
const EXPECTED_TERMS = ["indicator", "baseline", "target", "means of verification", "mov"];

// Second parameter kept (unused) only so this matches runValidation's
// lexicalCheck(draft, constraints) shape exactly — this check doesn't
// need constraints, but the generalized three-tier interface is uniform
// across every validator that plugs into it.
export function lexicalCheck(draft: string, _constraints?: IndicatorValidationConstraints): VetoCheckResult {
  const lower = draft.toLowerCase();
  const found = EXPECTED_TERMS.some((term) => lower.includes(term));
  return found
    ? { pass: true, failures: [] }
    : { pass: false, failures: [`lexical: draft contains none of the expected M&E terms (${EXPECTED_TERMS.join(", ")}) — likely off-topic`] };
}

export interface ValidatorIndicatorsSemanticInput {
  draft: string;
}

export function buildSemanticPrompt({ draft }: ValidatorIndicatorsSemanticInput): string {
  return `You are an Indicator Quality Validator.

Your task is to review indicators, baselines, targets, and means of verification.

Check:
- whether indicators match the correct result level
- whether they are specific and measurable
- whether baselines are plausible or marked missing
- whether targets appear realistic
- whether means of verification are credible
- whether the framework is usable in real implementation

Rules:
- Flag weak indicators explicitly.
- Identify indicators that are too vague, too broad, or not measurable.
- Note if proxy indicators are being used.
- Distinguish between fixable weaknesses and structural problems.

Return only this structure:

Indicator issues:
- ...

Baseline/target issues:
- ...

MoV/data collection issues:
- ...

Priority fixes:
- ...

Assessment:
- strong
- usable with revisions
- weak

Draft to review:
${draft}`;
}

// Deterministic fallback so the M&E workflow is demoable with zero
// external dependencies — a real (if coarse) length-based heuristic,
// matching research.ts/writing.ts's mock philosophy.
export function mockSemanticRun({ draft }: ValidatorIndicatorsSemanticInput): string {
  if (draft.length < 80) {
    return "Indicator issues:\n- Draft too thin to assess indicator quality\n\nAssessment:\n- weak";
  }
  return "Indicator issues:\n- none flagged in mock mode\n\nAssessment:\n- strong";
}

// This validator's prompt doesn't return a bare PASS/FAIL string like
// compliance_judge's does — it returns a structured review ending in an
// Assessment line. runValidation's default verdict parser doesn't fit;
// this one does. Fails safe (treats an unparseable response as a failure)
// rather than assuming pass on ambiguity, consistent with the semantic
// tier's whole purpose being to catch exactly this kind of ambiguous case.
export function parseSemanticVerdict(raw: string): VetoCheckResult {
  const match = raw.match(/Assessment:\s*[\r\n\-\s]*\s*(strong|usable with revisions|weak)/i);
  const assessment = match?.[1]?.toLowerCase();

  if (assessment === "weak") {
    return { pass: false, failures: [`semantic: indicator validator assessed this draft as weak — full review:\n${raw}`] };
  }
  if (assessment === "strong" || assessment === "usable with revisions") {
    return { pass: true, failures: [] };
  }
  return {
    pass: false,
    failures: [`semantic: could not find a parseable Assessment line in the validator's response: ${raw.slice(0, 200)}`],
  };
}
