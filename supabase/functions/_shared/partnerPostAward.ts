// Consortium Builder — post-award (Grant Studio §4.2, §4.3). Partner
// Management Committee: a joint review body (EAS §3.2's Committee pattern,
// same "workflow participants, not separate services" framing already used
// for pre-award Consortium Builder) splitting §4.2's functions across the
// existing Ministry Library per §4.3's table. Three of its six named
// sub-functions are built here — the ones with a clear, real data target
// per the spec text. The other three (subcontracting/sub-granting
// oversight → Procurement; payment/transfer tracking → Finance &
// Administration; partner-level financial reporting consolidation →
// Finance & Administration) are plain single-field writes against
// `partners.subcontract_value` with no cross-table business logic beyond
// RLS, or — for financial-reporting consolidation specifically — have no
// concrete write target defined anywhere in Grant Studio §4.2/§4.3 or
// Database Schema (unlike every pre-award module, which named a real
// column or table for each function). Left as direct-Supabase-client CRUD
// (the first two, Frontend spec §2) and a flagged open item (the third),
// not guessed at here.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { runPartnerDueDiligence, PartnerDueDiligenceResult } from "./consortiumBuilderEngine.ts";

export interface RefreshDueDiligenceParams {
  supabase: SupabaseClient;
  organisationId: string;
  partnerId: string;
}

// §4.2: "Periodic due-diligence refresh... re-screening partners against
// exclusion criteria on a cadence... since a partner's eligibility status
// can change during a multi-year project." §4.3 assigns this to
// Compliance — same exclusion-criteria machinery as pre-award due
// diligence (§4.1), just re-run and timestamped. Reuses
// runPartnerDueDiligence unchanged rather than a parallel post-award
// implementation of the same rollup.
export async function refreshDueDiligence(params: RefreshDueDiligenceParams): Promise<PartnerDueDiligenceResult & { refreshedAt: string }> {
  const { supabase, organisationId, partnerId } = params;
  const result = await runPartnerDueDiligence({ supabase, organisationId, partnerId });
  const refreshedAt = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("partners").update({ due_diligence_refresh_date: refreshedAt }).eq("id", partnerId);
  if (error) throw error;

  return { ...result, refreshedAt };
}

export interface RecordAmendmentParams {
  supabase: SupabaseClient;
  organisationId: string;
  actorId: string;
  partnerId: string;
  changeType: "role" | "subcontract_value";
  newValue: string | number;
  justification: string;
}

// §4.2: "Amendment management: when a partner's role, budget share, or
// mandate changes mid-project, requiring a contract amendment." §4.3
// assigns this to Compliance, "jointly consulted with Finance &
// Administration when the amendment changes a budget share" — recorded
// here as a joint audit trail (both named as consulted parties in the
// event detail) rather than a second approval gate the spec doesn't
// actually describe as a Human Gate.
export async function recordAmendment(params: RecordAmendmentParams): Promise<{ partnerId: string; changeType: string; newValue: string | number }> {
  const { supabase, organisationId, actorId, partnerId, changeType, newValue, justification } = params;
  if (!justification?.trim()) {
    throw new Error("bad_request: a justification is required to record a partner amendment");
  }

  const column = changeType === "role" ? "role" : "subcontract_value";
  const { error } = await supabase.from("partners").update({ [column]: newValue }).eq("id", partnerId);
  if (error) throw error;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "human",
    actor_id: actorId,
    action: "partner_amendment",
    target_type: "partner",
    target_id: partnerId,
    detail: { changeType, newValue, justification, consultedMinistries: ["compliance", "finance_administration"] },
  });

  return { partnerId, changeType, newValue };
}

export interface RatePerformanceParams {
  supabase: SupabaseClient;
  organisationId: string;
  actorId: string;
  partnerId: string;
  rating: number;
  notes: string;
}

// §4.2: "Performance rating: structured feedback... written back to the
// Partner entity's institutional memory (Knowledge Platform, EAS §3.3) so
// future Consortium Builder scoring (§4.1) reflects actual cooperation
// history." §4.3 assigns this to M&E. Writes both partners.
// performance_rating (read directly by scorePartnerCapacity's
// past_cooperation_notes signal on a future proposal) and a real
// memory_entries row at tier: 'institutional' — the mechanism the spec
// names explicitly, not implied.
export async function ratePerformance(params: RatePerformanceParams): Promise<{ partnerId: string; rating: number; memoryEntryId: string }> {
  const { supabase, organisationId, actorId, partnerId, rating, notes } = params;
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    throw new Error("bad_request: rating must be a number between 0 and 5");
  }

  const { data: partner, error: partnerErr } = await supabase.from("partners").select("legal_name").eq("id", partnerId).single();
  if (partnerErr || !partner) throw new Error("not_found: partner not found");

  const { error: updateErr } = await supabase
    .from("partners")
    .update({ performance_rating: rating, past_cooperation_notes: notes })
    .eq("id", partnerId);
  if (updateErr) throw updateErr;

  const { data: memoryRow, error: memoryErr } = await supabase
    .from("memory_entries")
    .insert({
      tier: "institutional",
      scope_id: partnerId,
      organisation_id: organisationId,
      content: `Performance rating for partner "${partner.legal_name}": ${rating}/5. ${notes}`,
      content_type: "fact",
      justification: notes,
    })
    .select("id")
    .single();
  if (memoryErr) throw memoryErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "human",
    actor_id: actorId,
    action: "partner_performance_rated",
    target_type: "partner",
    target_id: partnerId,
    detail: { rating, notes, memoryEntryId: memoryRow.id },
  });

  return { partnerId, rating, memoryEntryId: memoryRow.id };
}
