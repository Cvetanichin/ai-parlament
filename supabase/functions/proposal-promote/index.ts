// POST /proposal-promote
// Concept Note -> Full Application stage transition (Grant Studio spec
// §5.1: "POST /proposals/{id}/promote"). Only enforces the one precondition
// the spec actually states — current stage must be 'concept_note' — not a
// section-completeness rule (e.g. "all Concept Note sections veto-passed
// first"), since §5.1 doesn't specify one and inventing a business rule
// here would be guessing at a Product Owner decision, not implementing a
// spec. Flagged as a follow-up decision, not silently assumed.
//
// Body: { projectId, proposalId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, proposalId } = body;
    if (!projectId || !proposalId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, proposalId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: proposal, error: propErr } = await admin
      .from("proposals")
      .select("id, organisation_id, stage")
      .eq("id", proposalId)
      .single();
    if (propErr || !proposal) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "proposal not found" } }), { status: 404 });
    }
    if (proposal.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "proposal belongs to a different organisation" } }), { status: 403 });
    }
    if (proposal.stage !== "concept_note") {
      return new Response(
        JSON.stringify({
          error: { code: "gate_precondition_unmet", message: `proposal is in stage '${proposal.stage}', expected 'concept_note'` },
        }),
        { status: 409 },
      );
    }

    const { data: updated, error: updateErr } = await admin
      .from("proposals")
      .update({ stage: "full_application" })
      .eq("id", proposalId)
      .select("*")
      .single();
    if (updateErr) throw updateErr;

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "human",
      actor_id: caller.userId,
      action: "proposal_promoted",
      target_type: "proposal",
      target_id: proposalId,
      detail: { fromStage: "concept_note", toStage: "full_application" },
    });

    return new Response(JSON.stringify(updated), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
