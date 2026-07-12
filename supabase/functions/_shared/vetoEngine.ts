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

export async function runVeto(params: RunVetoParams): Promise<VetoResult> {
  const { supabase, draft, constraints, brief, projectId, organisationId } = params;

  const deterministic = deterministicCheck(draft, constraints);
  const lexical = lexicalCheck(draft, constraints);

  const semanticInvocation = await invokeAgent({
    supabase,
    agentSlug: "compliance_judge",
    projectId,
    organisationId,
    input: { draft, brief },
    buildPrompt: buildSemanticPrompt,
    mockRun: mockSemanticRun,
  });

  const verdict = String(semanticInvocation.output).trim();
  const semantic: VetoCheckResult = verdict.toUpperCase().startsWith("PASS")
    ? { pass: true, failures: [] }
    : { pass: false, failures: [`semantic: ${verdict.replace(/^FAIL:?\s*/i, "")}`] };

  const failures = [...deterministic.failures, ...lexical.failures, ...semantic.failures];

  return {
    pass: failures.length === 0,
    checks: { deterministic, lexical, semantic },
    failures,
    semanticAgentRunId: semanticInvocation.agentRunId,
  };
}
