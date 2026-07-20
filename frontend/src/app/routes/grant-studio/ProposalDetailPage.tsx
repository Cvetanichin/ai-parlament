import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "@/app/lib/supabaseClient";
import { useAuth } from "@/app/lib/auth";
import { invokeEdgeFunction, EdgeFunctionError } from "@/app/lib/edgeFunctions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { HumanGateDialog, type GateFinding } from "@/app/components/gates/HumanGateDialog";

interface ProposalSection {
  id: string;
  section_key: string;
  content: string | null;
  workflow_instance_id: string | null;
}

interface ComplianceFindingRow {
  id: string;
  rule: string;
  source: string;
  status: GateFinding["status"];
  override_justification: string | null;
}

interface ComplianceStatusResponse {
  overallStatus: GateFinding["status"];
  byArtefactType: Record<string, { status: GateFinding["status"]; riskFlags: string[] }>;
}

export function ProposalDetailPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const { defaultProjectId } = useAuth();
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatusResponse | null>(null);
  const [proposalFindings, setProposalFindings] = useState<ComplianceFindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSections = useCallback(async () => {
    if (!proposalId) return;
    const { data, error } = await supabase
      .from("proposal_sections")
      .select("id, section_key, content, workflow_instance_id")
      .eq("proposal_id", proposalId);
    if (error) setError(error.message);
    else setSections(data ?? []);
  }, [proposalId]);

  const loadCompliance = useCallback(async () => {
    if (!proposalId || !defaultProjectId) return;
    try {
      const [status] = await Promise.all([
        invokeEdgeFunction<ComplianceStatusResponse>("compliance-status-get", { projectId: defaultProjectId, proposalId }),
      ]);
      setComplianceStatus(status);
      const { data } = await supabase
        .from("compliance_findings")
        .select("id, rule, source, status, override_justification")
        .eq("artefact_type", "proposal")
        .eq("artefact_id", proposalId);
      setProposalFindings((data ?? []) as ComplianceFindingRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [proposalId, defaultProjectId]);

  useEffect(() => {
    loadSections();
    loadCompliance();
  }, [loadSections, loadCompliance]);

  if (!proposalId) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Proposal</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="submission">Submission</TabsTrigger>
        </TabsList>

        <TabsContent value="sections">
          <div className="grid gap-4">
            {sections.map((s) => (
              <SectionCard key={s.id} proposalId={proposalId} section={s} projectId={defaultProjectId!} onDrafted={loadSections} />
            ))}
            <NewSectionForm proposalId={proposalId} onCreated={loadSections} />
          </div>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Aggregated status
                {complianceStatus && <Badge variant={complianceStatus.overallStatus === "pass" ? "success" : "warning"}>{complianceStatus.overallStatus}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {complianceStatus &&
                Object.entries(complianceStatus.byArtefactType).map(([type, v]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{type}</span>
                    <Badge variant={v.status === "pass" ? "success" : v.status === "fail" ? "destructive" : "outline"}>{v.status}</Badge>
                  </div>
                ))}

              {proposalFindings.filter((f) => f.status !== "pass" && !f.override_justification).length > 0 && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <span className="text-sm font-medium">Findings requiring attention</span>
                  {proposalFindings
                    .filter((f) => f.status !== "pass" && !f.override_justification)
                    .map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          {f.rule} <span className="text-muted-foreground">({f.source})</span>
                        </span>
                        <HumanGateDialog
                          trigger={<Button size="sm" variant="outline">Override</Button>}
                          title="Compliance Override"
                          description="Approving this overrides a flagged finding — a justification is required (EAS §3.1)."
                          artefact={<span>{f.rule}</span>}
                          findings={[{ label: f.rule, status: f.status, source: f.source }]}
                          requiresJustification
                          approveLabel="Override"
                          onApprove={async (justification) => {
                            await invokeEdgeFunction("compliance-override", { projectId: defaultProjectId, findingId: f.id, justification });
                            await loadCompliance();
                          }}
                        />
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submission">
          <SubmissionPanel proposalId={proposalId} projectId={defaultProjectId!} complianceOverall={complianceStatus?.overallStatus} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionCard({
  proposalId,
  section,
  projectId,
  onDrafted,
}: {
  proposalId: string;
  section: ProposalSection;
  projectId: string;
  onDrafted: () => void;
}) {
  const [brief, setBrief] = useState("");
  const [keywords, setKeywords] = useState("");
  const [charLimit, setCharLimit] = useState(1500);
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<{ vetoPassed: boolean; confidence: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await invokeEdgeFunction<{ vetoPassed: boolean; confidence: string }>("proposal-section-draft-run", {
        projectId,
        proposalId,
        sectionKey: section.section_key,
        brief,
        constraints: { characterLimit: charLimit, requiredKeywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) },
      });
      setResult(res);
      onDrafted();
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{section.section_key}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {section.content ? (
          <div className="flex flex-col gap-2">
            <p className="whitespace-pre-wrap text-sm">{section.content}</p>
            {result && (
              <div className="flex gap-2">
                <Badge variant={result.vetoPassed ? "success" : "destructive"}>{result.vetoPassed ? "veto passed" : "veto failed"}</Badge>
                <Badge variant="outline">confidence: {result.confidence}</Badge>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label>Brief</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What should this section cover?" />
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Required keywords (comma-separated)</Label>
                <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Character limit</Label>
                <Input type="number" value={charLimit} onChange={(e) => setCharLimit(Number(e.target.value))} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleDraft} disabled={drafting || !brief} className="w-fit">
              {drafting ? "Drafting…" : "Draft section"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewSectionForm({ proposalId, onCreated }: { proposalId: string; onCreated: () => void }) {
  const [sectionKey, setSectionKey] = useState("");
  const { organisationId } = useAuth();

  async function handleAdd() {
    if (!sectionKey.trim() || !organisationId) return;
    await supabase.from("proposal_sections").insert({ organisation_id: organisationId, proposal_id: proposalId, section_key: sectionKey.trim() });
    setSectionKey("");
    onCreated();
  }

  return (
    <Card>
      <CardContent className="flex items-end gap-3 pt-6">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>New section key</Label>
          <Input value={sectionKey} onChange={(e) => setSectionKey(e.target.value)} placeholder="e.g. problem_analysis" />
        </div>
        <Button variant="outline" onClick={handleAdd}>
          Add section
        </Button>
      </CardContent>
    </Card>
  );
}

function SubmissionPanel({ proposalId, projectId, complianceOverall }: { proposalId: string; projectId: string; complianceOverall?: string }) {
  const [compiling, setCompiling] = useState(false);
  const [pkg, setPkg] = useState<{ submissionPackageId: string; complianceStatusSnapshot: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCompile() {
    setCompiling(true);
    setError(null);
    try {
      const res = await invokeEdgeFunction<{ submissionPackageId: string; complianceStatusSnapshot: string }>("submission-package-compile", {
        projectId,
        proposalId,
      });
      setPkg(res);
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    } finally {
      setCompiling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submission Gateway</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Aggregated compliance status: <Badge variant="outline">{complianceOverall ?? "unknown"}</Badge>
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!pkg && (
          <Button onClick={handleCompile} disabled={compiling} className="w-fit">
            {compiling ? "Compiling…" : "Compile submission package"}
          </Button>
        )}
        {pkg && (
          <div className="flex items-center gap-3">
            <Badge variant={pkg.complianceStatusSnapshot === "pass" ? "success" : "warning"}>{pkg.complianceStatusSnapshot}</Badge>
            <HumanGateDialog
              trigger={<Button>Submit (Human Gate 4)</Button>}
              title="Submission Gate"
              description="The only path that marks this proposal submitted — always a named, logged, human act (EAS §9)."
              artefact={<span>Submission package {pkg.submissionPackageId}</span>}
              requiresJustification={pkg.complianceStatusSnapshot !== "pass"}
              approveLabel="Submit"
              onApprove={async () => {
                await invokeEdgeFunction("submission-package-submit", { projectId, submissionPackageId: pkg.submissionPackageId });
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
