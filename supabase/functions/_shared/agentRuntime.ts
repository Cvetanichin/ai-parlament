// Agent Runtime — Layer 3 (Parliament Core spec §3). Owns *execution*: how
// a single ministry's drafting/analysis step runs, against which Agent
// Version (Prompt Version + model binding), with full audit binding.
//
// Physical mapping per ADR-0007 (Parliament Core spec §3.6): Agent =
// ai_agents, AgentVersion = prompt_modules, AgentInvocation = agent_runs —
// the real, live Intelligence Workspace tables, extended additively.
//
// NOTE: agent_runs.project_id is NOT NULL in the real, live table (confirmed
// against the actual schema, not assumed) — every invocation is recorded
// against a real project, per the "extend the real table" rule (ADR-0007,
// Database Schema spec §0). This is why every caller of invokeAgent below
// must supply a projectId.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateText, ModelBinding } from "./llmGateway.ts";

export interface InvokeAgentParams {
  supabase: SupabaseClient;
  agentSlug: string; // ai_agents.slug
  projectId: string;
  organisationId: string;
  input: Record<string, unknown>;
  buildPrompt: (input: Record<string, unknown>) => string;
  mockRun: (input: Record<string, unknown>) => string;
  parseResponse?: (raw: string) => unknown;
  source?: "production" | "house_of_parliament";
}

export interface InvokeAgentResult {
  agentRunId: string;
  output: unknown;
  raw: string;
  promptModuleId: string | null;
  usedProvider: string;
  tokenCost: number | null;
  latencyMs: number;
}

// Register (or fetch) an Agent by slug — Parliament Core §3.2 "Register" step,
// idempotent so this can be called safely from a seed script or on first use.
export async function ensureAgent(
  supabase: SupabaseClient,
  params: { slug: string; name: string; edgeFunction: string; description: string; allowedTools?: string[] },
): Promise<string> {
  const { data: existing } = await supabase.from("ai_agents").select("id").eq("slug", params.slug).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("ai_agents")
    .insert({
      slug: params.slug,
      name: params.name,
      edge_function: params.edgeFunction,
      description: params.description,
      allowed_tools: params.allowedTools ?? [],
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

// Register (or fetch) the active AgentVersion (prompt_modules row) for an
// Agent. Per Platform Services spec §2.2: a new version is always an
// insert, exactly one status='active' row per Agent (enforced by the real
// partial unique index, migration 07).
export async function ensureActivePromptVersion(
  supabase: SupabaseClient,
  params: { agentId: string; name: string; content: string; modelProvider: string; modelName: string },
): Promise<string> {
  const { data: existing } = await supabase
    .from("prompt_modules")
    .select("id")
    .eq("agent_id", params.agentId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("prompt_modules")
    .insert({
      agent_id: params.agentId,
      name: params.name,
      content: params.content,
      version: 1,
      status: "active",
      approval_state: "approved",
      model_provider: params.modelProvider,
      model_name: params.modelName,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function invokeAgent(params: InvokeAgentParams): Promise<InvokeAgentResult> {
  const { supabase, agentSlug, projectId, organisationId, input } = params;

  const { data: agent, error: agentErr } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("slug", agentSlug)
    .single();
  if (agentErr || !agent) throw new Error(`Agent not registered: ${agentSlug}`);

  const { data: version } = await supabase
    .from("prompt_modules")
    .select("id, model_provider, model_name")
    .eq("agent_id", agent.id)
    .eq("status", "active")
    .maybeSingle();

  const binding: ModelBinding = version
    ? { provider: version.model_provider as ModelBinding["provider"], model: version.model_name }
    : { provider: "mock", model: "mock" };

  const prompt = params.buildPrompt(input);
  const { text: raw, tokenCost, latencyMs, usedProvider } = await generateText(prompt, {
    binding,
    mock: () => params.mockRun(input),
  });
  const output = params.parseResponse ? params.parseResponse(raw) : raw;

  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      project_id: projectId,
      organisation_id: organisationId,
      agent_id: agent.id,
      prompt_module_id: version?.id ?? null,
      status: "completed",
      input_data: input,
      output_data: typeof output === "string" ? { text: output } : output,
      token_cost: tokenCost,
      latency_ms: Math.round(latencyMs),
      source: params.source ?? "production",
    })
    .select("id")
    .single();
  if (runErr) throw runErr;

  return {
    agentRunId: run.id,
    output,
    raw,
    promptModuleId: version?.id ?? null,
    usedProvider,
    tokenCost,
    latencyMs,
  };
}
