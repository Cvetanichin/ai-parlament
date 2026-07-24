import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HumanGate } from "@/components/gate/HumanGate";
import { useAuth } from "@/hooks/useAuth";
import { fetchProposal } from "@/lib/opportunities";
import {
  ensureProjectForOpportunity,
  fetchEligibilityReport,
  runEligibilityCheck,
  fetchGoNoGoInstance,
  startGoNoGoInstance,
  runResearch,
  fetchResearchResult,
  type CategoryStatus,
} from "@/lib/eligibility";

// Grant Studio spec §2-3: Human Gate 2 (Go/No-Go) requires the Eligibility
// Report, plus the Research Ministry's Go/No-Go Risk Matrix (running the
// latter is what actually moves the Workflow Instance to awaiting_human --
// decideGate() hard-blocks any gate decision until that transition has
// happened, so it isn't an optional enrichment here).
export function ProposalDetail() {
  const { proposalId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState("");

  const { data: proposal, isLoading: proposalLoading } = useQuery({
    queryKey: ["proposal", proposalId],
    queryFn: () => fetchProposal(proposalId!),
    enabled: Boolean(proposalId),
  });

  const { data: projectId } = useQuery({
    queryKey: ["project-for-opportunity", proposal?.organisationId, proposal?.opportunity.id],
    queryFn: () =>
      ensureProjectForOpportunity(proposal!.organisationId, proposal!.opportunity.id, proposal!.opportunity.title, session!.user.id),
    enabled: Boolean(proposal && session),
  });

  const { data: eligibilityReport, isLoading: eligibilityLoading } = useQuery({
    queryKey: ["eligibility-report", projectId, proposal?.opportunity.id],
    queryFn: () => fetchEligibilityReport(projectId!, proposal!.opportunity.id),
    enabled: Boolean(projectId && proposal),
  });

  const runEligibility = useMutation({
    mutationFn: () => runEligibilityCheck(projectId!, proposal!.opportunity.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["eligibility-report", projectId, proposal?.opportunity.id] }),
  });

  const { data: instance } = useQuery({
    queryKey: ["go-no-go-instance", proposal?.organisationId, projectId],
    queryFn: () => fetchGoNoGoInstance(proposal!.organisationId, projectId!),
    enabled: Boolean(proposal && projectId),
  });

  const { data: researchResult } = useQuery({
    queryKey: ["research-result", instance?.id],
    queryFn: () => fetchResearchResult(instance!.id),
    enabled: Boolean(instance),
  });

  const startAndResearch = useMutation({
    mutationFn: async () => {
      const instanceId = instance?.id ?? (await startGoNoGoInstance(proposal!.organisationId, projectId!));
      return runResearch(instanceId, projectId!, brief);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["go-no-go-instance", proposal?.organisationId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["research-result", instance?.id] });
    },
  });

  if (proposalLoading || !proposal) {
    return <div className="text-sm text-muted-foreground">Loading proposal…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{proposal.opportunity.title}</h1>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>{proposal.opportunity.donorName ?? "No donor on file"} · Stage:</span>
          <Badge variant="outline">{proposal.stage.replace("_", " ")}</Badge>
          <span>· Status:</span>
          <Badge variant="outline">{proposal.status}</Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Eligibility Report</CardTitle>
          <CardDescription>Module 2 — Eligibility Engine. Required before the Go/No-Go gate can be approved.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {eligibilityLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!eligibilityLoading && !eligibilityReport && (
            <Button size="sm" onClick={() => runEligibility.mutate()} disabled={runEligibility.isPending || !projectId}>
              {runEligibility.isPending ? "Running…" : "Run eligibility check"}
            </Button>
          )}
          {eligibilityReport && (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label="Operational" status={eligibilityReport.operationalCapacityStatus} />
                <StatusBadge label="Financial" status={eligibilityReport.financialCapacityStatus} />
                <StatusBadge label="Geographic" status={eligibilityReport.geographicEligibilityStatus} />
                <StatusBadge label="Consortium" status={eligibilityReport.consortiumRequirementsStatus} />
                <StatusBadge label="Budget ceiling" status={eligibilityReport.budgetCeilingFitStatus} />
              </div>
              <p className="text-sm">
                Recommendation:{" "}
                <span className="font-semibold uppercase">{eligibilityReport.recommendation ?? "—"}</span>
              </p>
              {eligibilityReport.riskFlags.length > 0 && (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {eligibilityReport.riskFlags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="outline" onClick={() => runEligibility.mutate()} disabled={runEligibility.isPending}>
                {runEligibility.isPending ? "Re-running…" : "Re-run eligibility check"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {!researchResult && instance?.state !== "awaiting_human" && (
        <Card>
          <CardHeader>
            <CardTitle>Go/No-Go Risk Matrix</CardTitle>
            <CardDescription>Research Ministry assessment — required to open the Go/No-Go gate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="brief">Proposal brief</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={4}
                placeholder="What are we proposing, to whom, and why does it fit?"
              />
            </div>
            <Button
              size="sm"
              onClick={() => startAndResearch.mutate()}
              disabled={startAndResearch.isPending || !brief.trim() || !projectId}
            >
              {startAndResearch.isPending ? "Running Research…" : "Run Research"}
            </Button>
            {startAndResearch.isError && (
              <p className="text-sm text-destructive">{(startAndResearch.error as Error).message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {researchResult && instance?.state === "running" && (
        <Card>
          <CardHeader>
            <CardTitle>Go/No-Go: Approved</CardTitle>
            <CardDescription>Ready for Concept Note drafting (Phase D).</CardDescription>
          </CardHeader>
        </Card>
      )}

      {instance?.state === "failed" && (
        <Card>
          <CardHeader>
            <CardTitle>Go/No-Go: Rejected</CardTitle>
          </CardHeader>
        </Card>
      )}

      {instance?.state === "awaiting_human" && proposal && projectId && (
        <HumanGate
          request={{
            workflowInstanceId: instance.id,
            projectId,
            gateType: "go_no_go",
            title: "Go/No-Go Decision",
            artefact: (
              <div className="text-sm">
                <p className="font-medium">{proposal.opportunity.title}</p>
                <p className="mt-1 text-muted-foreground">{proposal.opportunity.description}</p>
              </div>
            ),
            supportingRecords: (
              <div className="space-y-3 text-sm">
                {eligibilityReport && (
                  <div>
                    <div className="font-semibold">Eligibility recommendation: {eligibilityReport.recommendation}</div>
                    {eligibilityReport.riskFlags.length > 0 && (
                      <ul className="list-inside list-disc text-muted-foreground">
                        {eligibilityReport.riskFlags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {researchResult && (
                  <div>
                    <div className="font-semibold">
                      Research recommendation: {researchResult.recommendation} (score {researchResult.score})
                    </div>
                    {researchResult.risks.length > 0 && (
                      <ul className="list-inside list-disc text-muted-foreground">
                        {researchResult.risks.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ),
          }}
          onDecided={() => {
            queryClient.invalidateQueries({ queryKey: ["go-no-go-instance", proposal.organisationId, projectId] });
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ label, status }: { label: string; status: CategoryStatus | null }) {
  const variant = status === "pass" ? "success" : status === "fail" ? "destructive" : status === "warning" ? "warning" : "outline";
  return (
    <Badge variant={variant}>
      {label}: {status ?? "—"}
    </Badge>
  );
}
