// Context Engine — Layer 3, Platform Services spec §1. Per §1.5: "has no
// storage of its own" — it's a stateless orchestration function, not a
// table. Assembles relevant memory_entries (tier-filtered: institutional +
// this organisation + this target's own scope) into a system-prompt-style
// preamble a Ministry Adapter's own prompt is layered onto, per §1.2:
// "agent_runs.input_data stores the assembled context output, not raw
// task input" — when a caller opts in (agentRuntime.ts's invokeAgent takes
// an optional `contextEngine` param), this is exactly what happens.
//
// Deliberately additive/optional in invokeAgent, not a forced rewrite of
// every existing ministry call: the 8 ministries built and verified before
// this session (Research, Writing, M&E, Compliance, Reporting, plus the
// Compliance Judge) keep working byte-for-byte unchanged when they don't
// pass this param — retrofitting all of them was a materially larger,
// riskier change than this session's scope, and every one of them was
// already verified end-to-end against a real Anthropic model
// (supabase/README.md). The 3 ministries built in this session (Fundraising,
// Finance & Administration, Procurement) are its first real callers.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AssembleContextParams {
  supabase: SupabaseClient;
  organisationId: string;
  targetType: string;
  targetId: string;
  tokenBudget?: number; // rough chars/4 estimate, matches this codebase's lack of a real tokenizer anywhere else
}

export interface AssembledContext {
  systemPrompt: string;
  assembledContext: string;
  sources: string[];
  tokenEstimate: number;
  truncated: boolean;
}

const DEFAULT_TOKEN_BUDGET = 800;

export async function assembleContext(params: AssembleContextParams): Promise<AssembledContext> {
  const { supabase, organisationId, targetType, targetId, tokenBudget } = params;
  const budget = tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  // Tier order matches memory_entries.tier's own precedence intent
  // (institutional Memory Engine §5 tiers, most-durable first): institutional
  // (platform-wide, no organisation_id) and organisation-tier entries for
  // this caller's organisation, then anything scoped directly to this
  // target (project/proposal/working tier rows whose scope_id = targetId).
  const { data: rows, error } = await supabase
    .from("memory_entries")
    .select("id, tier, content, content_type, scope_id")
    .or(`tier.eq.institutional,organisation_id.eq.${organisationId}`)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const relevant = (rows ?? []).filter((r) => r.tier === "institutional" || r.tier === "organisation" || r.scope_id === targetId);

  const sources: string[] = [];
  const lines: string[] = [];
  let charCount = 0;
  let truncated = false;
  const charBudget = budget * 4;

  for (const row of relevant) {
    const line = `- [${row.tier}/${row.content_type}] ${row.content}`;
    if (charCount + line.length > charBudget) {
      truncated = true;
      break;
    }
    lines.push(line);
    sources.push(row.id as string);
    charCount += line.length;
  }

  const assembledContext = lines.length > 0 ? lines.join("\n") : "(no relevant memory entries found)";
  const systemPrompt = `Relevant institutional/organisational context for this ${targetType} (${targetId}), most recent first:\n${assembledContext}`;

  return {
    systemPrompt,
    assembledContext,
    sources,
    tokenEstimate: Math.ceil(charCount / 4),
    truncated,
  };
}
