// Vote of No Confidence Threshold Authoring — House of Parliament spec §5,
// the confirmed interface ADR-0003 anticipated but did not specify.
// workflow_definitions has no authenticated UPDATE policy at all (only
// select) — by design, matching this spec's "requires is_platform_operator,
// not casual editing" rule; only a service-role Edge Function can write it.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface UpdateThresholdParams {
  supabase: SupabaseClient;
  actorId: string;
  workflowDefinitionId: string;
  newThreshold: number;
}

export async function updateVoteOfNoConfidenceThreshold(
  params: UpdateThresholdParams,
): Promise<{ workflowDefinitionId: string; oldThreshold: number; newThreshold: number }> {
  const { supabase, actorId, workflowDefinitionId, newThreshold } = params;
  if (!Number.isInteger(newThreshold) || newThreshold < 1) {
    throw new Error("bad_request: newThreshold must be a positive integer");
  }

  const { data: definition, error: defErr } = await supabase
    .from("workflow_definitions")
    .select("id, name, version, vote_of_no_confidence_threshold")
    .eq("id", workflowDefinitionId)
    .single();
  if (defErr || !definition) throw new Error("not_found: workflow definition not found");

  const oldThreshold = definition.vote_of_no_confidence_threshold;

  const { error: updateErr } = await supabase
    .from("workflow_definitions")
    .update({ vote_of_no_confidence_threshold: newThreshold })
    .eq("id", workflowDefinitionId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_events").insert({
    organisation_id: null,
    actor_type: "human",
    actor_id: actorId,
    action: "vote_of_no_confidence_threshold_changed",
    target_type: "workflow_definition",
    target_id: workflowDefinitionId,
    detail: { name: definition.name, version: definition.version, oldThreshold, newThreshold },
  });

  return { workflowDefinitionId, oldThreshold, newThreshold };
}
