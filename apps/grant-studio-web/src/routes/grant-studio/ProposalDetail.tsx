import { useEffect, useState } from "react";
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
  runGovernanceDraft,
  fetchVetoResult,
  fetchExpectedGate,
  syncProposalStatus,
  type CategoryStatus,
} from "@/lib/eligibility";
import {
  fetchProposalSection,
  saveProposalSection,
  CONCEPT_NOTE_NARRATIVE_SECTION_KEY,
} from "@/lib/proposalSections";

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
  const [draftingBrief, setDraftingBrief] = useState("");
  const [sectionDraft, setSectionDraft] = useState("");

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

  const { data: vetoResult } = useQuery({
    queryKey: ["veto-result", instance?.id],
    queryFn: () => fetchVetoResult(instance!.id),
    enabled: Boolean(instance && researchResult),
  });

  // The authoritative source of "which gate is pending" -- mirrors
  // decideGate()'s own server-side getExpectedGateType exactly (a cheap
  // heuristic based only on researchResult/vetoResult presence was tried
  // first and found live, via browser testing, to keep the Polish Gate
  // card rendering even after Polish had already been approved and the
  // instance had moved on to awaiting Submission).
  const { data: expectedGate } = useQuery({
    queryKey: ["expected-gate", instance?.id],
    queryFn: () => fetchExpectedGate(instance!.id),
    enabled: Boolean(instance),
  });

  const { data: section } = useQuery({
    queryKey: ["proposal-section", proposalId, CONCEPT_NOTE_NARRATIVE_SECTION_KEY],
    queryFn: () => fetchProposalSection(proposalId!, CONCEPT_NOTE_NARRATIVE_SECTION_KEY),
    enabled: Boolean(proposalId),
  });

  useEffect(() => {
    setSectionDraft(section?.content ?? "");
  }, [section?.content]);

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

  const draftWithAi = useMutation({
    mutationFn: async () => {
      const result = await runGovernanceDraft(instance!.id, projectId!, draftingBrief);
      await saveProposalSection(
        proposal!.organisationId,
        proposalId!,
        CONCEPT_NOTE_NARRATIVE_SECTION_KEY,
        result.draft ?? "",
        instance!.id,
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["go-no-go-instance", proposal?.organisationId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["veto-result", instance?.id] });
      queryClient.invalidateQueries({ queryKey: ["proposal-section", proposalId, CONCEPT_NOTE_NARRATIVE_SECTION_KEY] });
    },
  });

  const saveSection = useMutation({
    mutationFn: () => saveProposalSection(proposal!.organisationId, proposalId!, CONCEPT_NOTE_NARRATIVE_SECTION_KEY, sectionDraft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposal-section", proposalId, CONCEPT_NOTE_NARRATIVE_SECTION_KEY] }),
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

      {instance?.state === "awaiting_human" && expectedGate === "go_no_go" && proposal && projectId && (
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
          onDecided={(_decision, result) => {
            queryClient.invalidateQueries({ queryKey: ["go-no-go-instance", proposal.organisationId, projectId] });
            queryClient.invalidateQueries({ queryKey: ["expected-gate", instance.id] });
            void syncProposalStatus(proposalId!, result.state);
          }}
        />
      )}

      {instance?.state === "failed" && (
        <Card>
          <CardHeader>
            <CardTitle>Go/No-Go: Rejected</CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Concept Note — Module 4's v1 slice (Grant Studio spec §5): a single
          holistic narrative section, drafted by the Writing Ministry ->
          Tripartite Veto Engine -> Vote of No Confidence loop, reusing the
          same Workflow Instance the Go/No-Go gate ran on. The spec's fuller
          per-donor-section-as-its-own-instance architecture isn't what's
          built (workflowEngine.ts carries one continuous instance through
          go_no_go -> writing -> polish -> submission) -- ADR-0013 records
          this as a real, deliberate v1 scoping choice, not an oversight. */}
      {researchResult && instance && (instance.state === "running" || (instance.state === "awaiting_human" && expectedGate === "polish")) && (
        <Card>
          <CardHeader>
            <CardTitle>Concept Note</CardTitle>
            <CardDescription>Ministry of Writing — Annex A narrative, gated by the Tripartite Veto Engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="section-content">Narrative</Label>
              <Textarea
                id="section-content"
                value={sectionDraft}
                onChange={(e) => setSectionDraft(e.target.value)}
                rows={8}
                placeholder="Drafted content appears here — edit freely, or draft with AI below."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveSection.mutate()}
                  disabled={saveSection.isPending || sectionDraft === (section?.content ?? "")}
                >
                  {saveSection.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>

            {instance.state === "running" && (
              <div className="space-y-2 rounded-md border bg-muted/40 p-4">
                <Label htmlFor="drafting-brief">Drafting brief</Label>
                <Textarea
                  id="drafting-brief"
                  value={draftingBrief}
                  onChange={(e) => setDraftingBrief(e.target.value)}
                  rows={4}
                  placeholder="What should the Writing Ministry draft? Include what the donor requires."
                />
                <Button
                  size="sm"
                  onClick={() => draftWithAi.mutate()}
                  disabled={draftWithAi.isPending || !draftingBrief.trim()}
                >
                  {draftWithAi.isPending ? "Drafting…" : section?.content ? "Redraft with AI" : "Draft with AI"}
                </Button>
                {draftWithAi.isError && <p className="text-sm text-destructive">{(draftWithAi.error as Error).message}</p>}
                {draftWithAi.data && (
                  <p className="text-sm text-muted-foreground">
                    Confidence: <span className="font-semibold">{draftWithAi.data.confidence}</span> · Veto{" "}
                    {draftWithAi.data.vetoPassed ? "passed" : "did not pass — escalated for review"} · attempts:{" "}
                    {draftWithAi.data.attempts}
                  </p>
                )}
              </div>
            )}

            {instance.state === "awaiting_human" && expectedGate === "polish" && projectId && (
              <HumanGate
                request={{
                  workflowInstanceId: instance.id,
                  projectId,
                  gateType: "polish",
                  title: "Polish Gate",
                  knownOverride: vetoResult ? !vetoResult.pass : false,
                  artefact: (
                    <div className="text-sm whitespace-pre-wrap">{section?.content}</div>
                  ),
                  supportingRecords: vetoResult && (
                    <div className="space-y-1 text-sm">
                      <div className="font-semibold">Veto result: {vetoResult.pass ? "Passed" : "Did not pass — escalated"}</div>
                      <VetoTierList label="Deterministic" tier={vetoResult.vetoChecks.deterministic} />
                      <VetoTierList label="Lexical" tier={vetoResult.vetoChecks.lexical} />
                      <VetoTierList label="Semantic" tier={vetoResult.vetoChecks.semantic} />
                    </div>
                  ),
                }}
                onDecided={(_decision, result) => {
                  queryClient.invalidateQueries({ queryKey: ["go-no-go-instance", proposal.organisationId, projectId] });
                  queryClient.invalidateQueries({ queryKey: ["expected-gate", instance.id] });
                  void syncProposalStatus(proposalId!, result.state);
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {instance?.state === "awaiting_human" && expectedGate === "submission" && (
        <Card>
          <CardHeader>
            <CardTitle>Polish: Approved</CardTitle>
            <CardDescription>Ready for Compliance &amp; Submission (Phase G).</CardDescription>
          </CardHeader>
        </Card>
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

function VetoTierList({ label, tier }: { label: string; tier: { pass: boolean; failures: string[] } }) {
  return (
    <div>
      <span className="font-medium">{label}:</span> {tier.pass ? "pass" : "fail"}
      {!tier.pass && tier.failures.length > 0 && (
        <ul className="ml-4 list-inside list-disc text-muted-foreground">
          {tier.failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
