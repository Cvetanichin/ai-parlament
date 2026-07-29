import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fetchProposal } from "@/lib/opportunities";
import {
  fetchBudget,
  saveBudget,
  computeBudgetTotals,
  type BudgetLineItem,
} from "@/lib/budget";

function newLineItem(): BudgetLineItem {
  return { id: crypto.randomUUID(), category: "", description: "", unit: "", quantity: 1, unitCost: 0 };
}

function formatCurrency(amount: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + (currency ? ` ${currency}` : "");
}

// Module 6 -- Budget Studio (Grant Studio spec §7): line-item budget
// builder against real `budgets` rows. v1 scope is the deterministic core
// -- line items, direct/indirect/grand totals -- not the full spec (Unit
// Cost Library, staff cost calculator, equipment library, procurement
// planner, cash flow projection, exchange rate handling, scenario
// analysis, Budget API ceiling validation all remain unbuilt, flagged not
// silently dropped: the Regulatory Knowledge Layer isn't ingested for any
// opportunity yet, so there is no real ceiling to check against, same gap
// already surfaced honestly in the Eligibility Report's budget_ceiling_fit
// category).
export function Budget() {
  const { proposalId } = useParams();
  const queryClient = useQueryClient();

  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [indirectCostRate, setIndirectCostRate] = useState<string>("");
  const [currency, setCurrency] = useState("EUR");

  const { data: proposal } = useQuery({
    queryKey: ["proposal", proposalId],
    queryFn: () => fetchProposal(proposalId!),
    enabled: Boolean(proposalId),
  });

  const { data: budget, isLoading } = useQuery({
    queryKey: ["budget", proposalId],
    queryFn: () => fetchBudget(proposalId!),
    enabled: Boolean(proposalId),
  });

  useEffect(() => {
    if (budget) {
      setLineItems(budget.lineItems);
      setIndirectCostRate(budget.indirectCostRate?.toString() ?? "");
      setCurrency(budget.currency ?? "EUR");
    }
  }, [budget]);

  const save = useMutation({
    mutationFn: () =>
      saveBudget(proposal!.organisationId, proposalId!, {
        lineItems,
        indirectCostRate: indirectCostRate === "" ? null : Number(indirectCostRate),
        currency,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budget", proposalId] }),
  });

  const updateLineItem = (index: number, patch: Partial<BudgetLineItem>) => {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const addLineItem = () => setLineItems((prev) => [...prev, newLineItem()]);
  const removeLineItem = (index: number) => setLineItems((prev) => prev.filter((_, i) => i !== index));

  const totals = computeBudgetTotals(lineItems, indirectCostRate === "" ? null : Number(indirectCostRate));

  const categories = Array.from(new Set(lineItems.map((i) => i.category || "Uncategorised")));

  if (!proposalId) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Budget</h1>
          <p className="text-sm text-muted-foreground">Line items, indirect costs, and totals -- Module 6, Grant Studio spec §7.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/grant-studio/proposals/${proposalId}`}>Back to proposal</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>Grouped by category. Add rows for staff, travel, equipment, other direct costs, etc.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
              {lineItems.map((item, index) =>
                (item.category || "Uncategorised") === category ? (
                  <div key={item.id} className="grid grid-cols-2 gap-2 rounded-md border p-3 md:grid-cols-7">
                    <Input
                      placeholder="Category"
                      value={item.category}
                      onChange={(e) => updateLineItem(index, { category: e.target.value })}
                    />
                    <div className="col-span-2 md:col-span-2">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      />
                    </div>
                    <Input placeholder="Unit" value={item.unit} onChange={(e) => updateLineItem(index, { unit: e.target.value })} />
                    <Input
                      placeholder="Qty"
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) || 0 })}
                    />
                    <Input
                      placeholder="Unit cost"
                      type="number"
                      value={item.unitCost}
                      onChange={(e) => updateLineItem(index, { unitCost: Number(e.target.value) || 0 })}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatCurrency(item.quantity * item.unitCost, currency)}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeLineItem(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="mr-1 h-3 w-3" /> Line item
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indirect Costs & Totals</CardTitle>
          <CardDescription>
            No automated ceiling check is available -- the Regulatory Knowledge Layer hasn't been ingested for this call yet
            (same gap the Eligibility Report's budget_ceiling_fit category already flags). Confirm the indirect cost rate
            against the call's Guidelines for Applicants yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="indirect-rate">Indirect cost rate (%)</Label>
              <Input
                id="indirect-rate"
                type="number"
                value={indirectCostRate}
                onChange={(e) => setIndirectCostRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 rounded-md border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direct costs</span>
              <span className="font-medium">{formatCurrency(totals.directCost, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Indirect costs</span>
              <span className="font-medium">{formatCurrency(totals.indirectCost, currency)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <span>Grand total</span>
              <span>{formatCurrency(totals.grandTotal, currency)}</span>
            </div>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save budget"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
