import { supabase } from "@/lib/supabase";

// Grant Studio spec §5's v1 scope note: "EU Concept Note Drafter... becomes
// v1 of this module's Concept Note stage, not the whole module." The spec's
// full architecture rule ("each donor section is its own drafting workflow,
// not one monolithic 'draft the proposal' call") is not what's actually
// built: workflowEngine.ts's runGovernanceLoop/decideGate implement ONE
// continuous Workflow Instance per proposal carrying go_no_go -> writing ->
// polish -> submission (verified live, supabase/README.md's Phase 1
// section) -- there is no per-section instance concept in the deployed
// code. Rather than rearchitect a tested, working state machine to retrofit
// a per-section model the spec describes aspirationally, v1 drafts one
// holistic narrative section per proposal, matching what's actually built.
// The per-section gap is real and flagged, not silently resolved.
export const CONCEPT_NOTE_NARRATIVE_SECTION_KEY = "concept_note.narrative";

export interface ProposalSection {
  id: string;
  sectionKey: string;
  content: string | null;
  workflowInstanceId: string | null;
}

export async function fetchProposalSection(proposalId: string, sectionKey: string): Promise<ProposalSection | null> {
  const { data, error } = await supabase
    .from("proposal_sections")
    .select("id, section_key, content, workflow_instance_id")
    .eq("proposal_id", proposalId)
    .eq("section_key", sectionKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, sectionKey: data.section_key, content: data.content, workflowInstanceId: data.workflow_instance_id };
}

// No unique constraint on (proposal_id, section_key) exists on the real
// table, so this can't use Supabase's upsert(onConflict:) -- select-then-
// write instead, matching ensureProjectForOpportunity's same pattern.
export async function saveProposalSection(
  organisationId: string,
  proposalId: string,
  sectionKey: string,
  content: string,
  workflowInstanceId?: string,
): Promise<void> {
  const existing = await fetchProposalSection(proposalId, sectionKey);
  if (existing) {
    const { error } = await supabase
      .from("proposal_sections")
      .update({ content, ...(workflowInstanceId ? { workflow_instance_id: workflowInstanceId } : {}) })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("proposal_sections").insert({
      organisation_id: organisationId,
      proposal_id: proposalId,
      section_key: sectionKey,
      content,
      workflow_instance_id: workflowInstanceId ?? null,
    });
    if (error) throw error;
  }
}
