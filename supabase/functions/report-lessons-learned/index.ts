// POST /report-lessons-learned
// Grant Studio spec §9.1: "POST /reports/{id}/lessons-learned — writes the
// Knowledge Platform document." Closes the learning loop §9 names:
// Opportunity -> Proposal -> Submission -> Project -> Monitoring ->
// Reporting -> Lessons Learned -> Knowledge Platform -> future Proposal.
//
// Body: { projectId, reportId, title, content }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { writeLessonsLearned } from "../_shared/reportingStudio.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, reportId, title, content } = body;
    if (!projectId || !reportId || !title || !content) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, reportId, title, content are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: report, error: reportErr } = await admin.from("reports").select("id, organisation_id").eq("id", reportId).single();
    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "report not found" } }), { status: 404 });
    }
    if (report.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "report belongs to a different organisation" } }), { status: 403 });
    }

    const result = await writeLessonsLearned({
      supabase: admin,
      organisationId: caller.organisationId,
      actorId: caller.userId,
      reportId,
      projectId,
      title,
      content,
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
