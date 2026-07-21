// Opposition & Compliance — Tripartite Veto Engine.
// Ported from the real MVP's backend/agents/vetoEngine.js. Three
// independent checks; ANY failure vetoes the draft. Deterministic and
// lexical are plain code (zero hallucination risk, EAS §9 testability
// NFR) — only semantic touches an LLM, and it runs as its own registered
// Agent ("compliance_judge"), a deliberately separate persona and Agent
// Invocation from the drafting agent (EAS §3.2), so its audit trail is a
// real agent_runs row like any other invocation — not a bare LLM Gateway
// call that would bypass EAS principle 8 (auditable by construction).
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { invokeAgent } from "./agentRuntime.ts";

export interface VetoConstraints {
  characterLimit: number;
  requiredKeywords: string[];
}

export interface VetoCheckResult {
  pass: boolean;
  failures: string[];
}

export interface VetoResult {
  pass: boolean;
  checks: { deterministic: VetoCheckResult; lexical: VetoCheckResult; semantic: VetoCheckResult };
  failures: string[];
  semanticAgentRunId: string | null;
}

export function deterministicCheck(draft: string, constraints: VetoConstraints): VetoCheckResult {
  const failures: string[] = [];
  if (!draft || draft.trim().length === 0) {
    failures.push("deterministic: draft is empty");
  }
  if (draft.length > constraints.characterLimit) {
    failures.push(
      `deterministic: draft is ${draft.length} characters, exceeds the ${constraints.characterLimit}-character limit`,
    );
  }
  return { pass: failures.length === 0, failures };
}

export function lexicalCheck(draft: string, constraints: VetoConstraints): VetoCheckResult {
  const failures: string[] = [];
  const lowerDraft = draft.toLowerCase();
  for (const keyword of constraints.requiredKeywords) {
    if (!lowerDraft.includes(keyword.toLowerCase())) {
      failures.push(`missing_keyword:${keyword}`);
    }
  }
  return { pass: failures.length === 0, failures };
}

function buildSemanticPrompt(input: Record<string, unknown>): string {
  const { draft, brief } = input as { draft: string; brief: string };
  return `You are the Compliance Ministry's semantic judge — a DIFFERENT role from the drafting agent. Score whether this Annex A draft coherently and credibly addresses the project brief below. Respond with either "PASS" or "FAIL: <reason>".\n\nBrief: ${brief}\n\nDraft:\n${draft}`;
}

// Deterministic fallback judge — mirrors the real mockJudge exactly: flags
// drafts that are suspiciously short or truncated mid-sentence by the
// character-limit trim in the mock writer.
function mockSemanticRun(input: Record<string, unknown>): string {
  const { draft } = input as { draft: string };
  if (draft.length < 40) {
    return "FAIL: draft is too thin to credibly address the brief";
  }
  if (draft.trim().endsWith("…")) {
    return "FAIL: draft was truncated mid-sentence and reads as incomplete";
  }
  return "PASS";
}

export interface RunVetoParams {
  supabase: SupabaseClient;
  draft: string;
  constraints: VetoConstraints;
  brief: string;
  projectId: string;
  organisationId: string;
}

// Generalized three-tier validation — PHASE1_RESCOPING.md §3.1. Extracted
// from what was, until now, code hardcoded to the Writing Ministry's shape
// (a fixed VetoConstraints type, compliance_judge as the only possible
// semantic judge, and a PASS/FAIL-prefixed verdict format). Prompt
// Orchestration Platform's validators (validator_indicators first, then
// validator_generic/validator_mvp_realism) reuse this directly rather than
// duplicating the three-tier pattern in a parallel function — each supplies
// its own deterministic/lexical checks, its own semantic judge agent (a
// deliberately separate persona from the drafting specialist, same
// principle compliance_judge already establishes), and — since not every
// validator's prompt returns a bare PASS/FAIL string — its own verdict
// parser. runVeto below is a thin wrapper over this with the exact
// original arguments bound in, so runGovernanceLoop's call site and
// behaviour are unchanged.
export interface RunValidationParams<TConstraints> {
  supabase: SupabaseClient;
  draft: string;
  constraints: TConstraints;
  deterministicCheck: (draft: string, constraints: TConstraints) => VetoCheckResult;
  lexicalCheck: (draft: string, constraints: TConstraints) => VetoCheckResult;
  semanticJudgeAgentSlug: string;
  buildSemanticPrompt: (input: Record<string, unknown>) => string;
  semanticInput: Record<string, unknown>;
  mockSemanticRun: (input: Record<string, unknown>) => string;
  // Defaults to the original PASS/"FAIL: <reason>" convention — supply a
  // different parser when the judge's prompt doesn't return that exact
  // shape (e.g. validator_indicators' "Assessment: strong|usable with
  // revisions|weak" structure).
  parseSemanticVerdict?: (raw: string) => VetoCheckResult;
  projectId: string;
  organisationId: string;
}

function defaultParseSemanticVerdict(raw: string): VetoCheckResult {
  const verdict = raw.trim();
  return verdict.toUpperCase().startsWith("PASS")
    ? { pass: true, failures: [] }
    : { pass: false, failures: [`semantic: ${verdict.replace(/^FAIL:?\s*/i, "")}`] };
}

export async function runValidation<TConstraints>(params: RunValidationParams<TConstraints>): Promise<VetoResult> {
  const {
    supabase,
    draft,
    constraints,
    deterministicCheck: runDeterministic,
    lexicalCheck: runLexical,
    semanticJudgeAgentSlug,
    buildSemanticPrompt: buildJudgePrompt,
    semanticInput,
    mockSemanticRun: mockJudgeRun,
    projectId,
    organisationId,
  } = params;

  const deterministic = runDeterministic(draft, constraints);
  const lexical = runLexical(draft, constraints);

  const semanticInvocation = await invokeAgent({
    supabase,
    agentSlug: semanticJudgeAgentSlug,
    projectId,
    organisationId,
    input: semanticInput,
    buildPrompt: buildJudgePrompt,
    mockRun: mockJudgeRun,
  });

  const parseVerdict = params.parseSemanticVerdict ?? defaultParseSemanticVerdict;
  const semantic = parseVerdict(String(semanticInvocation.output).trim());

  const failures = [...deterministic.failures, ...lexical.failures, ...semantic.failures];

  return {
    pass: failures.length === 0,
    checks: { deterministic, lexical, semantic },
    failures,
    semanticAgentRunId: semanticInvocation.agentRunId,
  };
}

// Thin wrapper — zero behaviour change from before runValidation existed.
export function runVeto(params: RunVetoParams): Promise<VetoResult> {
  const { supabase, draft, constraints, brief, projectId, organisationId } = params;
  return runValidation({
    supabase,
    draft,
    constraints,
    deterministicCheck,
    lexicalCheck,
    semanticJudgeAgentSlug: "compliance_judge",
    buildSemanticPrompt,
    semanticInput: { draft, brief },
    mockSemanticRun,
    projectId,
    organisationId,
  });
}
