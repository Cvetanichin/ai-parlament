// Prompt Registry promotion/rollback — Platform Services spec §2.2/§2.3,
// operationalised by House of Parliament spec §4: "a is_platform_operator
// user calls POST /prompts/{id}/approve, which is what actually flips
// approval_state to 'approved' and status to 'active', deprecating the
// previous active version." Exactly one 'active' row per Agent is enforced
// by the real partial unique index (prompt_modules_one_active_per_agent,
// migration 07) — deprecate-then-activate ordering below exists
// specifically so that constraint is never violated mid-transaction.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface ApprovePromptParams {
  supabase: SupabaseClient;
  actorId: string;
  promptModuleId: string;
}

export async function approvePrompt(params: ApprovePromptParams): Promise<{ promptModuleId: string; agentId: string; deprecatedId: string | null }> {
  const { supabase, actorId, promptModuleId } = params;

  const { data: target, error: targetErr } = await supabase
    .from("prompt_modules")
    .select("id, agent_id, approval_state, status")
    .eq("id", promptModuleId)
    .single();
  if (targetErr || !target) throw new Error("not_found: prompt module not found");
  if (!["draft", "pending_review"].includes(target.approval_state)) {
    throw new Error(`gate_precondition_unmet: prompt is in approval_state '${target.approval_state}', expected 'draft' or 'pending_review'`);
  }

  const { data: currentActive } = await supabase
    .from("prompt_modules")
    .select("id")
    .eq("agent_id", target.agent_id)
    .eq("status", "active")
    .maybeSingle();

  if (currentActive) {
    const { error: deprecateErr } = await supabase.from("prompt_modules").update({ status: "deprecated" }).eq("id", currentActive.id);
    if (deprecateErr) throw deprecateErr;
  }

  const { error: activateErr } = await supabase
    .from("prompt_modules")
    .update({ approval_state: "approved", status: "active" })
    .eq("id", promptModuleId);
  if (activateErr) throw activateErr;

  await supabase.from("audit_events").insert({
    organisation_id: null,
    actor_type: "human",
    actor_id: actorId,
    action: "prompt_approved",
    target_type: "prompt_module",
    target_id: promptModuleId,
    detail: { agentId: target.agent_id, deprecatedId: currentActive?.id ?? null },
  });

  return { promptModuleId, agentId: target.agent_id, deprecatedId: currentActive?.id ?? null };
}

export interface RollbackPromptParams {
  supabase: SupabaseClient;
  actorId: string;
  promptModuleId: string; // the deprecated version being reactivated
}

// §2.2: "Rollback is promoting a previously-deprecated version again, with
// rolled_back_from set to the version being rolled back from — the
// append-only history is preserved; nothing is deleted or un-deprecated
// silently."
export async function rollbackPrompt(params: RollbackPromptParams): Promise<{ promptModuleId: string; agentId: string; rolledBackFrom: string | null }> {
  const { supabase, actorId, promptModuleId } = params;

  const { data: target, error: targetErr } = await supabase
    .from("prompt_modules")
    .select("id, agent_id, status")
    .eq("id", promptModuleId)
    .single();
  if (targetErr || !target) throw new Error("not_found: prompt module not found");
  if (target.status !== "deprecated") {
    throw new Error(`gate_precondition_unmet: prompt is in status '${target.status}', expected 'deprecated' to roll back to it`);
  }

  const { data: currentActive } = await supabase
    .from("prompt_modules")
    .select("id")
    .eq("agent_id", target.agent_id)
    .eq("status", "active")
    .maybeSingle();

  if (currentActive) {
    const { error: deprecateErr } = await supabase.from("prompt_modules").update({ status: "deprecated" }).eq("id", currentActive.id);
    if (deprecateErr) throw deprecateErr;
  }

  const { error: reactivateErr } = await supabase
    .from("prompt_modules")
    .update({ status: "active", rolled_back_from: currentActive?.id ?? null })
    .eq("id", promptModuleId);
  if (reactivateErr) throw reactivateErr;

  await supabase.from("audit_events").insert({
    organisation_id: null,
    actor_type: "human",
    actor_id: actorId,
    action: "prompt_rolled_back",
    target_type: "prompt_module",
    target_id: promptModuleId,
    detail: { agentId: target.agent_id, rolledBackFrom: currentActive?.id ?? null },
  });

  return { promptModuleId, agentId: target.agent_id, rolledBackFrom: currentActive?.id ?? null };
}
