// POST /me-agent
// M&E Ministry — monthly intelligence brief. Re-platformed onto the Agent
// Runtime (Project Operations spec §6) from the real, live me-agent
// function (figmaprojects/supabase/functions/me-agent/index.ts) — same
// prompt, same data shape (projectIntelligence.ts), now going through
// invokeAgent (prompt_modules lookup + LLM Gateway) instead of an inline
// Anthropic SDK call. Internal fast path (§7) — ungoverned, no Workflow
// Instance, matching the real function's current behaviour exactly; a
// human consultant reads this before using it for anything external.
//
// NOTE: this function name matches a real, live production Edge Function
// on the shared Supabase project. This file is a local port for
// development/testing — deploying it to replace the live function is a
// separate, deliberate decision, not implied by this file existing.
//
// Body: { projectId, periodStart, periodEnd }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildMeAgentPrompt, mockMeAgentRun, MeAgentInput } from "../_shared/ministries/projectIntelligence.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, periodStart, periodEnd } = body;
    if (!projectId || !periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, periodStart, periodEnd are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const [{ data: project }, { data: indicators }, { data: activities }, { data: risks }] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("indicators").select("*").eq("project_id", projectId),
      admin.from("activities").select("*").eq("project_id", projectId),
      admin.from("risks").select("*").eq("project_id", projectId).eq("status", "open"),
    ]);

    const input: MeAgentInput = { project, periodStart, periodEnd, indicators: indicators ?? [], activities: activities ?? [], risks: risks ?? [] };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "me-agent",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      buildPrompt: (i) => buildMeAgentPrompt(i as unknown as MeAgentInput),
      mockRun: (i) => mockMeAgentRun(i as unknown as MeAgentInput),
    });

    const content = String(result.output);
    const title = `M&E Brief — ${project?.name ?? "Project"} (${periodStart} to ${periodEnd})`;

    const { data: reportRow, error: reportErr } = await admin
      .from("reports")
      .insert({ project_id: projectId, title, report_type: "me_brief", content, generated_by: caller.userId, period_start: periodStart, period_end: periodEnd })
      .select("id")
      .single();
    if (reportErr) throw reportErr;

    await admin.from("agent_runs").update({ report_id: reportRow.id }).eq("id", result.agentRunId);

    return new Response(JSON.stringify({ success: true, reportId: reportRow.id, content }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
