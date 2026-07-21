// POST /budget-narrative-draft-run
// Finance & Administration Ministry — Budget Studio drafting (Grant Studio
// §7). Deliberately separate from budget-validate-run/budgetEngine.ts: this
// drafts the narrative a human refines (LLM ministry, mocked without a
// provider key); budgetEngine.ts stays the zero-hallucination validator —
// same Writing Ministry / Veto Engine split applied to Budget Studio.
// Result is logged to audit_events, not written to a new `budgets` column
// (this codebase's established "prefer reading/writing existing data over
// adding columns" pattern) — the caller displays/persists the draft as it
// sees fit.
//
// Body: { projectId, budgetId, narrativeBrief? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildPrompt, mockDraft, FinanceAdministrationInput } from "../_shared/ministries/financeAdministration.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, budgetId, narrativeBrief } = body;
    if (!projectId || !budgetId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, budgetId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: budget, error: budgetErr } = await admin
      .from("budgets")
      .select("id, organisation_id, line_items, indirect_cost_rate, currency, proposal_id, project_id")
      .eq("id", budgetId)
      .single();
    if (budgetErr || !budget) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "budget not found" } }), { status: 404 });
    }
    if (budget.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "budget belongs to a different organisation" } }), { status: 403 });
    }

    let projectOrProposalName: string | null = null;
    if (budget.project_id) {
      const { data: project } = await admin.from("projects").select("name").eq("id", budget.project_id).maybeSingle();
      projectOrProposalName = (project?.name as string | undefined) ?? null;
    } else if (budget.proposal_id) {
      const { data: proposal } = await admin.from("proposals").select("opportunity_id").eq("id", budget.proposal_id).maybeSingle();
      if (proposal?.opportunity_id) {
        const { data: opportunity } = await admin.from("opportunities").select("title").eq("id", proposal.opportunity_id).maybeSingle();
        projectOrProposalName = (opportunity?.title as string | undefined) ?? null;
      }
    }

    const input: FinanceAdministrationInput = {
      budgetContext: {
        projectOrProposalName,
        currency: budget.currency,
        lineItems: Array.isArray(budget.line_items) ? budget.line_items : [],
        indirectCostRate: budget.indirect_cost_rate,
      },
      narrativeBrief: narrativeBrief ?? null,
    };

    const result = await invokeAgent({
      supabase: admin,
      agentSlug: "finance_admin_ministry",
      projectId,
      organisationId: caller.organisationId,
      input: input as unknown as Record<string, unknown>,
      contextEngine: { targetType: "budget", targetId: budgetId },
      buildPrompt: (i) => buildPrompt(i as unknown as FinanceAdministrationInput),
      mockRun: (i) => mockDraft(i as unknown as FinanceAdministrationInput),
    });

    const draft = String(result.output);

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "agent",
      action: "budget_narrative_drafted",
      target_type: "budget",
      target_id: budgetId,
      agent_run_id: result.agentRunId,
      detail: { draft },
    });

    return new Response(JSON.stringify({ budgetId, draft, agentRunId: result.agentRunId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
