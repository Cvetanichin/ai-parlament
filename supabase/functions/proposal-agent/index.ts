// POST /proposal-agent
// Raw system+prompt passthrough. Re-platformed onto the Agent Runtime
// (Project Operations spec §6): "proposal-agent's raw passthrough shape is
// the closest existing thing to a generic LLM Gateway endpoint... once
// given proper logging (an ai_agents row, agent_runs logging it currently
// skips) and tool-permission enforcement, rather than something to
// discard." The real function takes no project_id and does no auth
// check at all beyond the platform's verify_jwt — this port necessarily
// adds a required projectId, because agent_runs.project_id is NOT NULL on
// the real, live table (agentRuntime.ts's own constraint, confirmed
// against actual schema) and "proper logging" is impossible without a
// project to log against. This is a genuine, deliberate behaviour change
// from the original "no project linkage" shape, not an oversight — flagged
// here rather than silently requiring a new field.
//
// NOTE: this function name matches a real, live production Edge Function
// on the shared Supabase project — see me-agent's header comment.
//
// Body: { projectId, system?, prompt }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildProposalAgentPrompt, mockProposalAgentRun, ProposalAgentInput } from "../_shared/ministries/projectIntelligence.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, system, prompt } = body;
    if (!projectId || !prompt) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, prompt are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const input: ProposalAgentInput = { system: system ?? "You are a helpful assistant for civil society organisations.", prompt };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "proposal-agent",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      buildPrompt: (i) => buildProposalAgentPrompt(i as unknown as ProposalAgentInput),
      mockRun: (i) => mockProposalAgentRun(i as unknown as ProposalAgentInput),
    });

    return new Response(JSON.stringify({ content: String(result.output) }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
