// Ministry of Finance & Administration — Budget Studio drafting (Grant
// Studio §7: "far larger than 'fill in Annex B': Budget Builder... staff
// cost calculator... cash flow projection... scenario analysis"). Net-new,
// no existing code precedent (Parliament Core §0). This ministry drafts the
// budget narrative/justification a human reviews and refines — it never
// asserts a cost-eligibility ceiling itself; that stays the Regulatory
// Knowledge Layer's Budget API via the separate deterministic
// budgetEngine.ts (EAS §2 principle 3: "Budget Studio holds no ceiling
// values itself"). Drafting and validation are deliberately two different
// code paths here, mirroring the Writing Ministry / Veto Engine split.

export interface FinanceAdministrationInput {
  budgetContext: {
    projectOrProposalName?: string | null;
    currency?: string | null;
    lineItems: Array<{ category?: string; description?: string; amount?: number }>;
    indirectCostRate?: number | null;
  };
  narrativeBrief?: string | null;
}

export function buildPrompt({ budgetContext, narrativeBrief }: FinanceAdministrationInput): string {
  const lines = budgetContext.lineItems
    .map((li) => `- ${li.category ?? "uncategorised"}: ${li.description ?? ""} — ${li.amount ?? "?"} ${budgetContext.currency ?? ""}`)
    .join("\n");

  return `You are the Ministry of Finance & Administration. Draft a budget justification narrative for a CSO/NGO grant budget — explain the cost logic in plain language for a donor reviewer. You do NOT decide whether any cost is eligible; that is the Regulatory Knowledge Layer's job.

Budget for: ${budgetContext.projectOrProposalName || "(unnamed)"}
Currency: ${budgetContext.currency || "(unspecified)"}
Indirect cost rate: ${budgetContext.indirectCostRate ?? "(none set)"}

Line items:
${lines || "(none)"}

Context / brief: ${narrativeBrief || "(none supplied)"}

Write a concise budget justification narrative in markdown (under 400 words) covering:
## Cost Structure Overview
## Indirect Cost Rationale
## Cost-Efficiency Notes
Do not assert compliance with any specific donor ceiling — flag it as "subject to Regulatory Knowledge Layer validation" instead.`;
}

// Deterministic fallback so Budget Studio's drafting step is demoable
// without an API key, matching writing.ts's mockDraft pattern.
export function mockDraft({ budgetContext, narrativeBrief }: FinanceAdministrationInput): string {
  const total = budgetContext.lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  return `## Cost Structure Overview\n(mock) ${budgetContext.lineItems.length} line item(s) totalling ${total} ${budgetContext.currency ?? ""} drafted for ${budgetContext.projectOrProposalName ?? "this budget"}. ${narrativeBrief ? "Context: " + narrativeBrief : ""}\n## Indirect Cost Rationale\n(mock) Indirect cost rate of ${budgetContext.indirectCostRate ?? "0"}% is subject to Regulatory Knowledge Layer validation before this narrative is finalised.\n## Cost-Efficiency Notes\n(mock) No real model call made — draft only, requires human review before use in a submission.`;
}
