import { supabase } from "@/lib/supabase";

// Grant Studio spec §7.1: `budgets` is dual-scoped (proposal_id/project_id,
// both nullable) so a budget persists across the award transition without
// a migration; `line_items` is jsonb (a scenario/version-varying
// structure), `indirect_cost_rate` a first-class numeric column so it can
// be checked against a real ceiling without parsing JSON -- but per EAS §2
// principle 3, "Budget Studio holds no ceiling values itself." The
// Regulatory Knowledge Layer hasn't been ingested for any opportunity yet
// (confirmed live via the Eligibility Report's own `budget_ceiling_fit`
// category, Phase C) -- so no ceiling is fabricated here either. v1 does
// the deterministic part only (line-item math), same "zero-hallucination
// tier" spec §8 describes, and leaves the ceiling check exactly as honest
// as the Eligibility Report already is about it.
export interface BudgetLineItem {
  id: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface Budget {
  id: string;
  lineItems: BudgetLineItem[];
  indirectCostRate: number | null;
  currency: string | null;
}

interface BudgetRow {
  id: string;
  line_items: BudgetLineItem[] | null;
  indirect_cost_rate: number | null;
  currency: string | null;
}

export async function fetchBudget(proposalId: string): Promise<Budget | null> {
  const { data, error } = await supabase
    .from("budgets")
    .select("id, line_items, indirect_cost_rate, currency")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as BudgetRow;
  return {
    id: row.id,
    lineItems: row.line_items ?? [],
    indirectCostRate: row.indirect_cost_rate,
    currency: row.currency,
  };
}

// No unique constraint on proposal_id -- select-then-write, same pattern
// as saveLogframeNarrative/saveProposalSection.
export async function saveBudget(
  organisationId: string,
  proposalId: string,
  budget: Pick<Budget, "lineItems" | "indirectCostRate" | "currency">,
): Promise<void> {
  const existing = await fetchBudget(proposalId);
  const payload = {
    line_items: budget.lineItems,
    indirect_cost_rate: budget.indirectCostRate,
    currency: budget.currency,
  };
  if (existing) {
    const { error } = await supabase.from("budgets").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("budgets")
      .insert({ organisation_id: organisationId, proposal_id: proposalId, ...payload });
    if (error) throw error;
  }
}

export function lineItemTotal(item: BudgetLineItem): number {
  return (item.quantity || 0) * (item.unitCost || 0);
}

export interface BudgetTotals {
  directCost: number;
  indirectCost: number;
  grandTotal: number;
}

// Deterministic, zero-hallucination math -- spec §7/§8's "mathematical-
// consistency validation" tier. No LLM call, no external data dependency.
export function computeBudgetTotals(lineItems: BudgetLineItem[], indirectCostRate: number | null): BudgetTotals {
  const directCost = lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0);
  const indirectCost = indirectCostRate ? directCost * (indirectCostRate / 100) : 0;
  return { directCost, indirectCost, grandTotal: directCost + indirectCost };
}
