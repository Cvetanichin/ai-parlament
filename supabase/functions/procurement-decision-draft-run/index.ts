// POST /procurement-decision-draft-run
// Procurement Ministry — drafts a decision rationale for a subcontract/
// vendor selection (Grant Studio §4.3: "Subcontracting/sub-granting
// oversight | Procurement | ... a subcontract is a vendor relationship").
// Draft-only: never writes to `partners` itself. A human reviews this draft
// and, if satisfied, calls the existing recordAmendment (partner-amendment-
// run) with their own reviewed justification — same "AI drafts, human
// decides" split used everywhere else in this codebase, applied here even
// though recording the amendment isn't a formal Human Gate.
//
// Body: { projectId, partnerId, decisionType, thresholdContext?, candidateSummary? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildPrompt, mockDraft, ProcurementInput } from "../_shared/ministries/procurement.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, partnerId, decisionType, thresholdContext, candidateSummary } = body;
    if (!projectId || !partnerId || !decisionType) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, partnerId, decisionType are required" } }),
        { status: 400 },
      );
    }
    if (decisionType !== "subcontract_selection" && decisionType !== "vendor_selection") {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "decisionType must be 'subcontract_selection' or 'vendor_selection'" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: partner, error: partnerErr } = await admin
      .from("partners")
      .select("id, organisation_id, legal_name")
      .eq("id", partnerId)
      .single();
    if (partnerErr || !partner) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "partner not found" } }), { status: 404 });
    }
    if (partner.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "partner belongs to a different organisation" } }), { status: 403 });
    }

    const input: ProcurementInput = {
      partnerName: partner.legal_name,
      decisionType,
      thresholdContext: thresholdContext ?? null,
      candidateSummary: candidateSummary ?? null,
    };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "procurement_ministry",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      contextEngine: { targetType: "partner", targetId: partnerId },
      buildPrompt: (i) => buildPrompt(i as unknown as ProcurementInput),
      mockRun: (i) => mockDraft(i as unknown as ProcurementInput),
    });

    const draft = String(result.output);

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "agent",
      action: "procurement_decision_drafted",
      target_type: "partner",
      target_id: partnerId,
      agent_run_id: result.agentRunId,
      detail: { decisionType, draft },
    });

    return new Response(JSON.stringify({ partnerId, decisionType, draft, agentRunId: result.agentRunId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
