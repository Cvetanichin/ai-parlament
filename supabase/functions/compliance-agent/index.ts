// POST /compliance-agent
// Compliance Ministry — audit-readiness review. Re-platformed onto the
// Agent Runtime (Project Operations spec §6) from the real, live
// compliance-agent function. Internal fast path unchanged (§7): narrative
// review written to `reports` exactly as before.
//
// Donor-facing dual path (§7 point 1): "When a compliance review is being
// prepared for a donor-facing audit response or a partner due-diligence
// file, it must also produce structured compliance_findings rows... every
// claim traceable to a cited clause per the no-fabrication principle."
// compliance_findings.clause_id is NOT NULL REFERENCES regulatory_clauses,
// and that table is real but empty (ingestion pipeline unbuilt — same gap
// flagged throughout this build pass). This function does NOT fabricate a
// compliance_findings row from the LLM narrative to satisfy that
// requirement mechanically — doing so would mean inventing a clause_id
// citation for a clause that was never actually matched, which is exactly
// the "freeform text asserting a rule exists" Grant Studio §3 prohibits.
// `donorFacing: true` instead returns an honest
// structuredFindingsAvailable: false alongside the narrative, same
// conservative-by-default pattern used everywhere else in this build.
//
// NOTE: this function name matches a real, live production Edge Function
// on the shared Supabase project — see me-agent's header comment.
//
// Body: { projectId, periodStart, periodEnd, donorFacing? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildComplianceAgentPrompt, mockComplianceAgentRun, ComplianceAgentInput } from "../_shared/ministries/projectIntelligence.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, periodStart, periodEnd, donorFacing } = body;
    if (!projectId || !periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, periodStart, periodEnd are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const [{ data: project }, { data: docs }, { data: risks }, { data: activities }, { data: indicators }] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("project_documents").select("name, category").eq("project_id", projectId),
      admin.from("risks").select("*").eq("project_id", projectId),
      admin.from("activities").select("title, status").eq("project_id", projectId),
      admin.from("indicators").select("name, status, actual, target").eq("project_id", projectId),
    ]);

    const input: ComplianceAgentInput = {
      project,
      periodStart,
      periodEnd,
      docs: docs ?? [],
      risks: risks ?? [],
      activities: activities ?? [],
      indicators: indicators ?? [],
    };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "compliance-agent",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      buildPrompt: (i) => buildComplianceAgentPrompt(i as unknown as ComplianceAgentInput),
      mockRun: (i) => mockComplianceAgentRun(i as unknown as ComplianceAgentInput),
    });

    const content = String(result.output);
    const title = `Compliance Review — ${project?.name ?? "Project"} (${periodStart} to ${periodEnd})`;

    const { data: reportRow, error: reportErr } = await admin
      .from("reports")
      .insert({ project_id: projectId, title, report_type: "compliance_review", content, generated_by: caller.userId, period_start: periodStart, period_end: periodEnd })
      .select("id")
      .single();
    if (reportErr) throw reportErr;

    await admin.from("agent_runs").update({ report_id: reportRow.id }).eq("id", result.agentRunId);

    const response: Record<string, unknown> = { success: true, reportId: reportRow.id, content };
    if (donorFacing) {
      response.structuredFindingsAvailable = false;
      response.structuredFindingsNote =
        "Regulatory Knowledge Layer ingestion (spec §4) has not run — no compliance_findings row was written, since one would require a real cited regulatory_clauses row, not an inference from this narrative. Confirm compliance manually for donor-facing use.";
    }

    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
