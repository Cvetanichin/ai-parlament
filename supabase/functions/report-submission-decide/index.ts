// POST /report-submission-decide
// Human Gate for donor-facing reports (Project Operations spec §7 point 2):
// moves a reports row through internal_draft -> pending_human_review ->
// approved_for_submission. Only 'interim_narrative'/'final_narrative'
// reports ever carry a submission_status (reporting-agent leaves it NULL
// for monthly_report) — this endpoint refuses to act on a NULL status
// rather than silently starting a state machine the report was never
// opted into.
//
// action: 'request_review' — any org member, internal_draft ->
//   pending_human_review (staff signals "I think this is donor-ready").
// action: 'approve' | 'reject' — owner/admin only (requireGateRole,
//   Security spec §2.2, same restriction workflow-gate-decide already
//   enforces for the section-level gates): pending_human_review ->
//   approved_for_submission, or back to internal_draft on reject.
//
// Body: { projectId, reportId, action: 'request_review'|'approve'|'reject' }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";

const TRANSITIONS: Record<string, { from: string; to: string; requiresGateRole: boolean }> = {
  request_review: { from: "internal_draft", to: "pending_human_review", requiresGateRole: false },
  approve: { from: "pending_human_review", to: "approved_for_submission", requiresGateRole: true },
  reject: { from: "pending_human_review", to: "internal_draft", requiresGateRole: true },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, reportId, action } = body;
    const transition = TRANSITIONS[action];
    if (!projectId || !reportId || !transition) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, reportId, action ('request_review'|'approve'|'reject') are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    if (transition.requiresGateRole) requireGateRole(caller);

    const { data: report, error: reportErr } = await admin
      .from("reports")
      .select("id, project_id, submission_status")
      .eq("id", reportId)
      .single();
    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "report not found" } }), { status: 404 });
    }
    if (report.project_id !== projectId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "report does not belong to the given project" } }), { status: 403 });
    }
    if (report.submission_status !== transition.from) {
      return new Response(
        JSON.stringify({
          error: {
            code: "gate_precondition_unmet",
            message: `report submission_status is '${report.submission_status ?? "null (not a donor-facing report)"}', expected '${transition.from}' for action '${action}'`,
          },
        }),
        { status: 409 },
      );
    }

    const { error: updateErr } = await admin.from("reports").update({ submission_status: transition.to }).eq("id", reportId);
    if (updateErr) throw updateErr;

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "human",
      actor_id: caller.userId,
      action: "report_submission_decision",
      target_type: "report",
      target_id: reportId,
      detail: { decision: action, fromStatus: transition.from, toStatus: transition.to },
    });

    return new Response(JSON.stringify({ reportId, submissionStatus: transition.to }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized")
      ? 401
      : message.startsWith("forbidden")
        ? 403
        : message.startsWith("not_found")
          ? 404
          : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
