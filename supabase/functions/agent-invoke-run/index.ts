// POST /agent-invoke-run
// Parliament Core spec §3.7's indicative "POST /agents/{id}/invoke" —
// "called by Workflow Engine, not directly by Layer 1." House of
// Parliament spec §6 (Playground, Replay Sessions) is the one caller class
// that IS meant to reach it directly, precisely because both modules exist
// to rehearse the *same* invocation path production traffic uses — so this
// is gated behind is_platform_operator (resolvePlatformOperator), matching
// every other House-of-Parliament-introduced endpoint in this build pass,
// rather than opened up as a general-purpose bypass around the
// purpose-built ministry functions every real workflow already goes
// through.
//
// Registry maps each registered ai_agents.slug to its Ministry Adapter
// (buildPrompt/mockRun) — every agent slug actually registered in this
// codebase's seed data, not a speculative generic dispatcher.
//
// Body: { agentSlug, projectId, organisationId, input, forceMock? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildPrompt as buildResearchPrompt, mockRun as mockResearchRun, parseResponse as parseResearchResponse } from "../_shared/ministries/research.ts";
import { buildPrompt as buildWritingPrompt, mockDraft as mockWritingRun } from "../_shared/ministries/writing.ts";
import {
  buildMeAgentPrompt,
  mockMeAgentRun,
  buildComplianceAgentPrompt,
  mockComplianceAgentRun,
  buildReportingAgentPrompt,
  mockReportingAgentRun,
  buildProposalAgentPrompt,
  mockProposalAgentRun,
} from "../_shared/ministries/projectIntelligence.ts";

type AdapterPair = {
  buildPrompt: (input: Record<string, unknown>) => string;
  mockRun: (input: Record<string, unknown>) => string;
  parseResponse?: (raw: string) => unknown;
};

const REGISTRY: Record<string, AdapterPair> = {
  research_ministry: {
    buildPrompt: (i) => buildResearchPrompt(i as never),
    mockRun: (i) => mockResearchRun(i as never),
    parseResponse: (raw) => parseResearchResponse(raw),
  },
  writing_ministry: { buildPrompt: (i) => buildWritingPrompt(i as never), mockRun: (i) => mockWritingRun(i as never) },
  "me-agent": { buildPrompt: (i) => buildMeAgentPrompt(i as never), mockRun: (i) => mockMeAgentRun(i as never) },
  "compliance-agent": { buildPrompt: (i) => buildComplianceAgentPrompt(i as never), mockRun: (i) => mockComplianceAgentRun(i as never) },
  "reporting-agent": { buildPrompt: (i) => buildReportingAgentPrompt(i as never), mockRun: (i) => mockReportingAgentRun(i as never) },
  "proposal-agent": { buildPrompt: (i) => buildProposalAgentPrompt(i as never), mockRun: (i) => mockProposalAgentRun(i as never) },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { agentSlug, projectId, organisationId, input, forceMock } = body;
    if (!agentSlug || !projectId || !organisationId || !input) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "agentSlug, projectId, organisationId, input are required" } }),
        { status: 400 },
      );
    }
    const adapter = REGISTRY[agentSlug];
    if (!adapter) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: `no Ministry Adapter registered for agentSlug '${agentSlug}' in this Playground registry` } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    await resolvePlatformOperator(req, admin);

    const result = await invokeAgent({
      supabase: admin,
      agentSlug,
      projectId,
      organisationId,
      input,
      buildPrompt: adapter.buildPrompt,
      mockRun: adapter.mockRun,
      parseResponse: adapter.parseResponse,
      source: "house_of_parliament",
      forceMock: forceMock ?? true,
    });

    return new Response(
      JSON.stringify({ agentRunId: result.agentRunId, output: result.output, usedProvider: result.usedProvider }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
