// POST /reporting-agent
// Reporting Ministry — donor progress report. Re-platformed onto the Agent
// Runtime (Project Operations spec §6) from the real, live reporting-agent
// function. Internal fast path unchanged (§7): a `monthly_report` (the
// real function's only report_type) is written exactly as before,
// submission_status left NULL — "gated on that specific use, not on every
// invocation."
//
// Donor-facing dual path (§7 point 2): reportType 'interim_narrative' or
// 'final_narrative' (Grant Studio §9.1's two new values, already allowed
// by the real reports_report_type_check constraint) additionally sets
// submission_status = 'internal_draft'. Progressing it toward
// donor-submission-ready is a separate, human act — see
// report-submission-decide — not something this drafting call can do by
// itself (EAS §9 Liability NFR: no automated path to "ready for a donor").
//
// NOTE: this function name matches a real, live production Edge Function
// on the shared Supabase project — see me-agent's header comment.
//
// Body: { projectId, periodStart, periodEnd, reportType? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildReportingAgentPrompt, mockReportingAgentRun, ReportingAgentInput } from "../_shared/ministries/projectIntelligence.ts";

const DONOR_FACING_TYPES = ["interim_narrative", "final_narrative"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, periodStart, periodEnd, reportType } = body;
    if (!projectId || !periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, periodStart, periodEnd are required" } }),
        { status: 400 },
      );
    }
    const finalReportType = reportType ?? "monthly_report";

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const [{ data: project }, { data: indicators }, { data: activities }, { data: risks }, { data: docs }] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("indicators").select("*").eq("project_id", projectId),
      admin
        .from("activities")
        .select("*")
        .eq("project_id", projectId)
        .or(`end_date.is.null,end_date.gte.${periodStart}`)
        .or(`start_date.is.null,start_date.lte.${periodEnd}`),
      admin.from("risks").select("*").eq("project_id", projectId).eq("status", "open"),
      admin.from("project_documents").select("name, category").eq("project_id", projectId),
    ]);

    const input: ReportingAgentInput = {
      project,
      periodStart,
      periodEnd,
      indicators: indicators ?? [],
      activities: activities ?? [],
      risks: risks ?? [],
      docs: docs ?? [],
    };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "reporting-agent",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      buildPrompt: (i) => buildReportingAgentPrompt(i as unknown as ReportingAgentInput),
      mockRun: (i) => mockReportingAgentRun(i as unknown as ReportingAgentInput),
    });

    const content = String(result.output);
    const titlePrefix = finalReportType === "monthly_report" ? "Monthly Report" : finalReportType === "interim_narrative" ? "Interim Narrative Report" : "Final Narrative Report";
    const title = `${titlePrefix} — ${project?.name ?? "Project"} (${periodStart} to ${periodEnd})`;
    const isDonorFacing = DONOR_FACING_TYPES.includes(finalReportType);

    const { data: reportRow, error: reportErr } = await admin
      .from("reports")
      .insert({
        project_id: projectId,
        title,
        report_type: finalReportType,
        content,
        generated_by: caller.userId,
        period_start: periodStart,
        period_end: periodEnd,
        submission_status: isDonorFacing ? "internal_draft" : null,
      })
      .select("id, submission_status")
      .single();
    if (reportErr) throw reportErr;

    await admin.from("agent_runs").update({ report_id: reportRow.id }).eq("id", result.agentRunId);

    return new Response(
      JSON.stringify({ success: true, reportId: reportRow.id, content, submissionStatus: reportRow.submission_status }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
