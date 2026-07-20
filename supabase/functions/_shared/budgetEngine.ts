// Budget Studio — Grant Studio spec §7, Module 6. Ministry: Finance &
// Administration. §7.1: "GET /budgets/{proposalId}/validate ... calls the
// Regulatory Knowledge Layer's Budget API per line item and indirect cost
// rate, returns compliance_findings-shaped responses — Budget Studio holds
// no ceiling values itself, per EAS §2 principle 3."
//
// Two tiers, both deterministic (zero-hallucination, matching vetoEngine.ts's
// deterministic tier and eligibilityEngine.ts's rationale):
//
// 1. Mathematical-consistency check (§7's "mathematical-consistency
//    validation (deterministic — zero-hallucination tier of the Veto
//    Engine)") — pure arithmetic over the budget's own line_items, no
//    external data needed. Deliberately does NOT hardcode a donor ceiling
//    (e.g. a specific "7%" indirect-cost rate) — that would be exactly the
//    "freeform text asserting a rule exists" Grant Studio §3 prohibits.
//    Ceilings only ever come from real compliance_findings rows (tier 2).
// 2. Regulatory Budget API rollup — same pattern as
//    eligibilityEngine.ts/consortiumBuilderEngine.ts: reads real
//    compliance_findings for this budget and falls back to
//    context_dependent when none exist (Regulatory Knowledge Layer
//    ingestion not built yet).
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type BudgetValidationStatus = "pass" | "warning" | "fail" | "context_dependent";

interface LineItem {
  [key: string]: unknown;
  amount?: unknown;
}

export interface MathCheckResult {
  status: BudgetValidationStatus;
  total: number | null;
  issues: string[];
}

// Structural/arithmetic check only — no donor-specific thresholds asserted.
function checkMath(lineItems: unknown, indirectCostRate: number | null): MathCheckResult {
  const issues: string[] = [];

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { status: "fail", total: null, issues: ["line_items is empty or not an array — a budget must have at least one line item."] };
  }

  let total = 0;
  let sawInvalidAmount = false;
  (lineItems as LineItem[]).forEach((item, i) => {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      issues.push(`Line item ${i} has no valid non-negative "amount" field.`);
      sawInvalidAmount = true;
    } else {
      total += amount;
    }
  });

  if (indirectCostRate !== null && (indirectCostRate < 0 || indirectCostRate > 100)) {
    issues.push(`indirect_cost_rate (${indirectCostRate}) is outside a plausible 0-100 range.`);
  }

  const status: BudgetValidationStatus = sawInvalidAmount || issues.length > 0 ? "fail" : "pass";
  return { status, total: sawInvalidAmount ? null : total, issues };
}

interface ComplianceFinding {
  rule: string;
  source: string;
  severity: string;
  status: string;
}

function rollupFindings(findings: ComplianceFinding[]): { status: BudgetValidationStatus; riskFlags: string[] } {
  if (findings.length === 0) return { status: "context_dependent", riskFlags: [] };
  const riskFlags = findings.filter((f) => f.status !== "pass").map((f) => `${f.rule} (${f.source}) — ${f.status}`);
  const hasMandatoryFail = findings.some((f) => f.severity === "mandatory" && f.status === "fail");
  if (hasMandatoryFail) return { status: "fail", riskFlags };
  const hasNonPass = findings.some((f) => f.status !== "pass");
  if (hasNonPass) return { status: "warning", riskFlags };
  return { status: "pass", riskFlags };
}

export interface RunBudgetValidationParams {
  supabase: SupabaseClient;
  organisationId: string;
  budgetId: string;
}

export interface BudgetValidationResult {
  budgetId: string;
  mathCheck: MathCheckResult;
  regulatoryStatus: BudgetValidationStatus;
  regulatoryRiskFlags: string[];
  overallStatus: BudgetValidationStatus;
}

export async function runBudgetValidation(params: RunBudgetValidationParams): Promise<BudgetValidationResult> {
  const { supabase, organisationId, budgetId } = params;

  const { data: budget, error: budgetErr } = await supabase
    .from("budgets")
    .select("line_items, indirect_cost_rate")
    .eq("id", budgetId)
    .single();
  if (budgetErr || !budget) throw new Error("not_found: budget not found");

  const mathCheck = checkMath(budget.line_items, budget.indirect_cost_rate);

  const { data: findingsRows, error: findingsErr } = await supabase
    .from("compliance_findings")
    .select("rule, source, severity, status")
    .eq("organisation_id", organisationId)
    .eq("artefact_type", "budget")
    .eq("artefact_id", budgetId);
  if (findingsErr) throw findingsErr;

  const { status: regulatoryStatus, riskFlags: regulatoryRiskFlags } = rollupFindings(findingsRows ?? []);
  if (regulatoryStatus === "context_dependent") {
    regulatoryRiskFlags.push(
      "No ingested regulatory findings yet for this budget — Regulatory Knowledge Layer ingestion (spec §4) has not run; indirect-cost ceilings and cost-eligibility rules must be confirmed manually, not treated as a pass.",
    );
  }

  // Combined status: a math failure is always the worst case (it's a
  // correctness bug in the budget itself, not a missing-data caveat); a
  // regulatory fail/warning otherwise dominates a math pass.
  const severityOrder: BudgetValidationStatus[] = ["fail", "warning", "context_dependent", "pass"];
  const overallStatus = severityOrder.find((s) => s === mathCheck.status || s === regulatoryStatus) ?? "pass";

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "system",
    action: "budget_validation",
    target_type: "budget",
    target_id: budgetId,
    detail: { mathCheck, regulatoryStatus, regulatoryRiskFlags, overallStatus },
  });

  return { budgetId, mathCheck, regulatoryStatus, regulatoryRiskFlags, overallStatus };
}
