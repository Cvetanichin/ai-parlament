import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useAuth } from "@/app/lib/auth";
import { invokeEdgeFunction, EdgeFunctionError } from "@/app/lib/edgeFunctions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

// Executive Dashboard (Frontend spec §5): "cross-application, read-only
// aggregation... no write actions originate from this section." Pipeline,
// deadlines, and cost are direct Supabase reads (RLS alone gates them,
// Frontend spec §2's rule); compliance posture is the one section backed
// by an Edge Function (executive-dashboard-compliance-get), since it needs
// real cross-artefact aggregation, not just an RLS-scoped read.
//
// Known gap, not silently worked around: the spec also names "report due
// dates" as a deadline source, but `reports` has no due-date column
// anywhere in this schema — deadlines below come from opportunities only.

interface OpportunityRow {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
}

interface ProposalRow {
  id: string;
  stage: string;
  status: string;
}

interface ProjectRow {
  id: string;
  status: string | null;
}

interface CostRollupRow {
  id: string;
  scope_type: string;
  total_token_cost: number;
  total_invocations: number;
  period_start: string;
  period_end: string;
}

interface ComplianceItem {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail" | "context_dependent";
}

interface ComplianceOverview {
  proposals: ComplianceItem[];
  projects: ComplianceItem[];
  countsByStatus: Record<ComplianceItem["status"], number>;
}

function countBy<T>(rows: T[], key: (row: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) ?? "unspecified";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

const STATUS_VARIANT: Record<ComplianceItem["status"], "success" | "warning" | "destructive" | "outline"> = {
  pass: "success",
  warning: "warning",
  fail: "destructive",
  context_dependent: "outline",
};

export function DashboardPage() {
  const { defaultProjectId } = useAuth();
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [costRollups, setCostRollups] = useState<CostRollupRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("opportunities").select("id, title, status, deadline").then(({ data, error }) => {
      if (error) setError(error.message);
      else setOpportunities(data ?? []);
    });
    supabase.from("proposals").select("id, stage, status").then(({ data, error }) => {
      if (error) setError(error.message);
      else setProposals(data ?? []);
    });
    supabase.from("projects").select("id, status").then(({ data, error }) => {
      if (error) setError(error.message);
      else setProjects(data ?? []);
    });
    supabase
      .from("cost_rollups")
      .select("id, scope_type, total_token_cost, total_invocations, period_start, period_end")
      .order("computed_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setCostRollups(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!defaultProjectId) return;
    invokeEdgeFunction<ComplianceOverview>("executive-dashboard-compliance-get", { projectId: defaultProjectId })
      .then(setCompliance)
      .catch((err) => setError(err instanceof EdgeFunctionError ? err.message : String(err)));
  }, [defaultProjectId]);

  const today = new Date();
  const upcomingDeadlines = opportunities
    .filter((o) => o.deadline && new Date(o.deadline) >= today)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 8);

  const totalCost = costRollups.reduce((sum, r) => sum + Number(r.total_token_cost), 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Executive Dashboard</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div>
              <span className="font-medium">Opportunities</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(countBy(opportunities, (o) => o.status)).map(([status, count]) => (
                  <Badge key={status} variant="outline">{status}: {count}</Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="font-medium">Proposals</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(countBy(proposals, (p) => `${p.stage}/${p.status}`)).map(([key, count]) => (
                  <Badge key={key} variant="outline">{key}: {count}</Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="font-medium">Projects</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(countBy(projects, (p) => p.status)).map(([status, count]) => (
                  <Badge key={status} variant="outline">{status}: {count}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {upcomingDeadlines.length === 0 && <p className="text-muted-foreground">No upcoming opportunity deadlines.</p>}
            {upcomingDeadlines.map((o) => {
              const days = Math.ceil((new Date(o.deadline!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <span>{o.title}</span>
                  <Badge variant={days <= 14 ? "destructive" : days <= 30 ? "warning" : "outline"}>{days}d</Badge>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              Report due dates not shown — `reports` has no due-date column in this schema yet.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {costRollups.length === 0 ? (
              <p className="text-muted-foreground">No cost rollups yet — run cost-rollup-recompute-run.</p>
            ) : (
              <>
                <p className="font-medium">Total (all rollups on file): ${totalCost.toFixed(2)}</p>
                {costRollups.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{r.scope_type} — {r.period_start} to {r.period_end}</span>
                    <span>${Number(r.total_token_cost).toFixed(2)} / {r.total_invocations} calls</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance Posture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {!compliance && <p className="text-muted-foreground">Loading…</p>}
            {compliance && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(compliance.countsByStatus) as [ComplianceItem["status"], number][]).map(([status, count]) => (
                    <Badge key={status} variant={STATUS_VARIANT[status]}>{status}: {count}</Badge>
                  ))}
                </div>
                {[...compliance.proposals, ...compliance.projects]
                  .filter((item) => item.status !== "pass")
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span>{item.label}</span>
                      <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                    </div>
                  ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
