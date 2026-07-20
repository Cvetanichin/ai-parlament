// POST /proposal-create
// Creates a Proposal (Grant Studio spec §5.1) against an existing
// Opportunity. Spec text: "from an Opportunity, post Human Gate 2
// (Go/No-Go)" — that precondition is NOT enforced here, matching the same,
// already-flagged gap in eligibility-report-run: workflow_instances in
// this Phase 1+ slice target a project directly, not yet a first-class
// Opportunity (Grant Studio Module 1, unbuilt — see supabase/README.md
// "What's NOT done yet"). Enforcing it now would mean guessing an
// Opportunity/instance linkage this spec doesn't define, not implementing
// something real.
//
// Body: { projectId, opportunityId, clientId? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, opportunityId, clientId } = body;
    if (!projectId || !opportunityId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, opportunityId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: opportunity, error: oppErr } = await admin
      .from("opportunities")
      .select("id, organisation_id")
      .eq("id", opportunityId)
      .single();
    if (oppErr || !opportunity) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "opportunity not found" } }), { status: 404 });
    }
    if (opportunity.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "opportunity belongs to a different organisation" } }), { status: 403 });
    }

    const { data: proposal, error: insertErr } = await admin
      .from("proposals")
      .insert({
        organisation_id: caller.organisationId,
        opportunity_id: opportunityId,
        client_id: clientId ?? null,
        stage: "concept_note",
        status: "draft",
        version: 1,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "human",
      actor_id: caller.userId,
      action: "proposal_created",
      target_type: "proposal",
      target_id: proposal.id,
      detail: { opportunityId },
    });

    return new Response(JSON.stringify(proposal), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
