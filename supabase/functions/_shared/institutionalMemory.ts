// Institutional Memory Curation — House of Parliament spec §3, resolving
// Platform Services §8 / Database Schema §14's open item ("who has
// authority to write to the institutional tier, and through what
// interface"). tier is fixed to 'institutional', organisation_id fixed to
// null (institutional memory is cross-tenant by definition, Platform
// Services §3.1), and a non-empty justification is required — distinct
// from the entry content itself, so the audit trail captures *why* a
// cross-tenant assertion was accepted, not only what it says.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface WriteInstitutionalMemoryParams {
  supabase: SupabaseClient;
  actorId: string;
  content: string;
  contentType: "fact" | "decision" | "preference" | "risk_pattern";
  justification: string;
}

export async function writeInstitutionalMemory(params: WriteInstitutionalMemoryParams): Promise<{ memoryEntryId: string }> {
  const { supabase, actorId, content, contentType, justification } = params;
  if (!justification?.trim()) {
    throw new Error("bad_request: justification is required to write an institutional-tier memory entry");
  }

  // Human-curated institutional entries default confidence = 1.0, bypassing
  // the <0.6 auto-flagging Platform Services §7 defined for agent-written
  // entries — that threshold guards against low-confidence agent guesses,
  // not a platform operator's deliberate curation.
  const { data: entry, error } = await supabase
    .from("memory_entries")
    .insert({
      tier: "institutional",
      organisation_id: null,
      content,
      content_type: contentType,
      confidence: 1.0,
      justification,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("audit_events").insert({
    organisation_id: null,
    actor_type: "human",
    actor_id: actorId,
    action: "institutional_memory_written",
    target_type: "memory_entry",
    target_id: entry.id,
    detail: { contentType, justification },
  });

  return { memoryEntryId: entry.id };
}

export interface AmendInstitutionalMemoryParams {
  supabase: SupabaseClient;
  actorId: string;
  memoryEntryId: string;
  content: string;
  justification: string;
}

// §3: "PATCH /memory/institutional/{id} (amend an existing entry —
// institutional memory is corrected, not versioned, since it is not
// agent-authored)." A direct in-place update, deliberately not a new
// row + superseded_by chain (that mechanism exists for agent-authored
// entries whose provenance matters; a human operator correcting a
// standing institutional fact is editing it, not superseding it).
export async function amendInstitutionalMemory(params: AmendInstitutionalMemoryParams): Promise<{ memoryEntryId: string }> {
  const { supabase, actorId, memoryEntryId, content, justification } = params;
  if (!justification?.trim()) {
    throw new Error("bad_request: justification is required to amend an institutional-tier memory entry");
  }

  const { data: existing, error: existingErr } = await supabase
    .from("memory_entries")
    .select("id, tier")
    .eq("id", memoryEntryId)
    .single();
  if (existingErr || !existing) throw new Error("not_found: memory entry not found");
  if (existing.tier !== "institutional") {
    throw new Error(`bad_request: memory entry ${memoryEntryId} is tier '${existing.tier}', not 'institutional' — this endpoint only amends institutional-tier entries`);
  }

  const { error: updateErr } = await supabase.from("memory_entries").update({ content, justification }).eq("id", memoryEntryId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_events").insert({
    organisation_id: null,
    actor_type: "human",
    actor_id: actorId,
    action: "institutional_memory_amended",
    target_type: "memory_entry",
    target_id: memoryEntryId,
    detail: { justification },
  });

  return { memoryEntryId };
}
