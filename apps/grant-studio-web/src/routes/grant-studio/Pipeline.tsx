import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe2, Sparkles, Link2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOrganisation } from "@/hooks/useOrganisation";
import {
  fetchOpportunities,
  startProposalFromOpportunity,
  OPPORTUNITY_STATUSES,
  type Opportunity,
  type OpportunityStatus,
} from "@/lib/opportunities";
import { daysUntil, deadlineClasses, deadlineLabel, formatDeadline, deadlineTone } from "@/lib/deadline";

// Real status vocabulary is richer than grant-stream-studio's 3 values --
// open/rolling first (both currently actionable), forthcoming next, then
// the two terminal states.
const STATUS_ORDER: Record<OpportunityStatus, number> = {
  open: 0,
  rolling: 0,
  forthcoming: 1,
  closed: 2,
  archived: 3,
};

// Ported from grant-stream-studio's PipelineTab.tsx: KPI strip, cluster/
// status filters, urgency-coloured deadline badges. Rewired onto a direct
// Supabase read of the real `opportunities`/`donors`/`proposals` tables
// instead of Zustand + hardcoded fixtures -- see the consolidation plan's
// table mapping for what's the same and what's genuinely richer here
// (donor.pipelineStage replaces the fixture's funder.stage; "linked" is
// computed from real proposals rows, not a stored field).
export function Pipeline() {
  const { organisationId } = useOrganisation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState<string | "all">("all");
  const [status, setStatus] = useState<OpportunityStatus | "all">("all");

  const { data: opportunities = [], isLoading, error } = useQuery({
    queryKey: ["opportunities", organisationId],
    queryFn: () => fetchOpportunities(organisationId!),
    enabled: Boolean(organisationId),
  });

  const startProposal = useMutation({
    mutationFn: (opportunityId: string) => startProposalFromOpportunity(organisationId!, opportunityId),
    onSuccess: (proposalId) => {
      queryClient.invalidateQueries({ queryKey: ["opportunities", organisationId] });
      navigate(`/grant-studio/proposals/${proposalId}`);
    },
  });

  const clusters = useMemo(
    () => Array.from(new Set(opportunities.map((o) => o.cluster).filter((c): c is string => Boolean(c)))).sort(),
    [opportunities],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities
      .filter((o) => (cluster === "all" ? true : o.cluster === cluster))
      .filter((o) => (status === "all" ? true : o.status === status))
      .filter((o) => (q ? o.title.toLowerCase().includes(q) || (o.donor?.name.toLowerCase().includes(q) ?? false) : true))
      .sort((a, b) => {
        // Status category first (grant-stream-studio's STATUS_ORDER) --
        // otherwise a closed call's negative days-until sorts it above
        // every open one, which is backwards.
        const sa = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (sa !== 0) return sa;
        const da = daysUntil(a.deadline) ?? 9_999;
        const db = daysUntil(b.deadline) ?? 9_999;
        return da - db;
      });
  }, [opportunities, search, cluster, status]);

  const kpis = useMemo(() => {
    const open = opportunities.filter((o) => o.status === "open" || o.status === "rolling").length;
    const urgent = opportunities.filter((o) => {
      const d = daysUntil(o.deadline);
      return d !== null && d >= 0 && d <= 14;
    }).length;
    const linked = opportunities.filter((o) => o.linkedProposalId).length;
    return { total: opportunities.length, open, urgent, linked };
  }, [opportunities]);

  if (!organisationId) {
    return <div className="text-sm text-muted-foreground">Loading organisation membership…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Funding Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Tracked calls, donor relationships, and the bridge into the proposal studio.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Tracked opportunities" value={kpis.total} />
        <Kpi label="Open now" value={kpis.open} tone="brand" />
        <Kpi label="Urgent (≤14 days)" value={kpis.urgent} tone="warning" />
        <Kpi label="Linked to a proposal" value={kpis.linked} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or donor…"
          className="min-w-[220px] flex-1"
        />
        <FilterGroup
          label="Cluster"
          value={cluster}
          options={[{ value: "all", label: "All clusters" }, ...clusters.map((c) => ({ value: c, label: c }))]}
          onChange={setCluster}
        />
        <FilterGroup
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            ...OPPORTUNITY_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
          onChange={(v) => setStatus(v as OpportunityStatus | "all")}
        />
      </div>

      {error && <p className="text-sm text-destructive">Failed to load opportunities: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading opportunities…</p>}

      {!isLoading && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {opportunities.length} opportunities · sorted by nearest deadline
          </div>
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No opportunities match your filters.
            </div>
          )}
          {filtered.map((o) => (
            <OpportunityCard
              key={o.id}
              opp={o}
              onStart={() =>
                o.linkedProposalId
                  ? navigate(`/grant-studio/proposals/${o.linkedProposalId}`)
                  : startProposal.mutate(o.id)
              }
              starting={startProposal.isPending && startProposal.variables === o.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(min: number | null, max: number | null, currency: string | null): string | null {
  if (min === null && max === null) return null;
  const fmt = (n: number) => new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const cur = currency ?? "";
  if (min !== null && max !== null && min !== max) return `${cur} ${fmt(min)} – ${fmt(max)}`;
  return `${cur} ${fmt(min ?? max ?? 0)}`;
}

function OpportunityCard({ opp, onStart, starting }: { opp: Opportunity; onStart: () => void; starting: boolean }) {
  const days = daysUntil(opp.deadline);
  const tone = deadlineTone(days);
  const money = formatMoney(opp.amountMin, opp.amountMax, opp.currency);

  return (
    <Card className={cn(opp.linkedProposalId && "border-primary/40 ring-1 ring-primary/20")}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {opp.isNew && (
                <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                  New
                </Badge>
              )}
              <span className="text-sm font-semibold leading-snug text-foreground">{opp.title}</span>
            </div>
            {opp.donor && (
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {opp.donor.name}
                {opp.donor.status && ` · ${titleCase(opp.donor.status)}`}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                deadlineClasses(tone),
              )}
            >
              {deadlineLabel(days)} · {formatDeadline(opp.deadline)}
              {days !== null && days >= 0 && <span className="opacity-70">· {days}d</span>}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {money && <Chip>{money}</Chip>}
          {opp.region && (
            <Chip>
              <Globe2 className="mr-1 h-3 w-3" />
              {opp.region}
            </Chip>
          )}
          {opp.applicationType && <Chip>{opp.applicationType}</Chip>}
          {opp.relevanceScore !== null && <Chip>Relevance · {Math.round(opp.relevanceScore * 100)}%</Chip>}
          {opp.cluster && <Chip>{opp.cluster}</Chip>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {opp.linkedProposalId ? (
            <Button size="sm" onClick={onStart}>
              <Link2 className="mr-1.5 h-4 w-4" />
              Open linked proposal
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={opp.status === "closed" || starting} onClick={onStart}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {starting ? "Starting…" : opp.status === "closed" ? "Call closed" : "Start proposal from this call"}
            </Button>
          )}
          {opp.sourceUrl && (
            <a
              href={opp.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
            >
              Call page <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {(opp.description || opp.strategicNarrative || opp.eligibilitySummary) && (
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            {opp.description && <Section title="Description">{opp.description}</Section>}
            {opp.strategicNarrative && <Section title="Strategic note">{opp.strategicNarrative}</Section>}
            {opp.eligibilitySummary && <Section title="Eligibility">{opp.eligibilitySummary}</Section>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "brand" | "warning" | "success" }) {
  const ring =
    tone === "brand"
      ? "border-sky-300/50 bg-sky-50"
      : tone === "warning"
        ? "border-amber-300/50 bg-amber-50"
        : tone === "success"
          ? "border-emerald-300/50 bg-emerald-50"
          : "border-border bg-card";
  return (
    <div className={cn("rounded-2xl border p-4", ring)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1 rounded-full border bg-card p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border bg-secondary px-2 py-0.5">{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-secondary/40 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}
