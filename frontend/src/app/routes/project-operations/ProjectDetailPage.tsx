import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "@/app/lib/supabaseClient";
import { invokeEdgeFunction, EdgeFunctionError } from "@/app/lib/edgeFunctions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { HumanGateDialog, type GateFinding } from "@/app/components/gates/HumanGateDialog";

// Project Operations §6/§7: M&E/Compliance/Reporting ministries draft
// internally-gated content directly (me-agent/compliance-agent/
// reporting-agent — no Workflow Instance, a human reads before it's used
// for anything external); donor-facing reports (interim_narrative/
// final_narrative) additionally carry submission_status and go through
// report-submission-decide's Human Gate, reusing HumanGateDialog exactly
// like ProposalDetailPage.tsx's Submission Gate.

const REPORT_TYPES = ["monthly_report", "interim_narrative", "final_narrative"] as const;

interface ReportRow {
  id: string;
  title: string | null;
  report_type: string | null;
  content: string | null;
  submission_status: string | null;
  period_start: string | null;
  period_end: string | null;
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, report_type, content, submission_status, period_start, period_end")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setReports(data ?? []);
  }, [projectId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (!projectId) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Project</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <GeneratePanel projectId={projectId} onGenerated={loadReports} />
        </TabsContent>

        <TabsContent value="reports">
          <div className="grid gap-4">
            {reports.length === 0 && <p className="text-muted-foreground">No reports yet.</p>}
            {reports.map((r) => (
              <ReportCard key={r.id} projectId={projectId} report={r} onChanged={loadReports} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneratePanel({ projectId, onGenerated }: { projectId: string; onGenerated: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]>("monthly_report");
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: string, extra?: Record<string, unknown>) {
    setRunning(fn);
    setError(null);
    try {
      await invokeEdgeFunction(fn, { projectId, periodStart, periodEnd, ...extra });
      onGenerated();
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Draft internal intelligence / a report</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Period start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Period end</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!running} onClick={() => run("me-agent")}>
            {running === "me-agent" ? "Drafting…" : "Generate M&E Brief"}
          </Button>
          <Button variant="outline" disabled={!!running} onClick={() => run("compliance-agent")}>
            {running === "compliance-agent" ? "Drafting…" : "Generate Compliance Review"}
          </Button>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-border bg-input-background px-2 text-sm"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as (typeof REPORT_TYPES)[number])}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button variant="outline" disabled={!!running} onClick={() => run("reporting-agent", { reportType })}>
              {running === "reporting-agent" ? "Drafting…" : "Generate Report"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard({ projectId, report, onChanged }: { projectId: string; report: ReportRow; onChanged: () => void }) {
  const [validation, setValidation] = useState<{ status: GateFinding["status"]; riskFlags: string[] } | null>(null);
  const [lessonsTitle, setLessonsTitle] = useState("");
  const [lessonsContent, setLessonsContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadValidation = useCallback(async () => {
    try {
      const res = await invokeEdgeFunction<{ status: GateFinding["status"]; riskFlags: string[] }>("report-validate-run", { projectId, reportId: report.id });
      setValidation(res);
    } catch {
      // report-validate-run is only meaningful once compliance_findings exist for this report; a
      // fresh internal draft with none yet is not an error worth surfacing here.
    }
  }, [projectId, report.id]);

  useEffect(() => {
    if (report.submission_status) loadValidation();
  }, [report.submission_status, loadValidation]);

  async function decide(action: "request_review" | "approve" | "reject") {
    setError(null);
    try {
      await invokeEdgeFunction("report-submission-decide", { projectId, reportId: report.id, action });
      onChanged();
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    }
  }

  async function submitLessons() {
    if (!lessonsTitle.trim() || !lessonsContent.trim()) return;
    try {
      await invokeEdgeFunction("report-lessons-learned", { projectId, reportId: report.id, title: lessonsTitle, content: lessonsContent });
      setLessonsTitle("");
      setLessonsContent("");
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{report.title ?? report.report_type}</CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline">{report.report_type}</Badge>
          {report.submission_status && <Badge variant="secondary">{report.submission_status}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {report.content && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{report.content.slice(0, 400)}{report.content.length > 400 ? "…" : ""}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {report.submission_status === "internal_draft" && (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => decide("request_review")}>
            Request review
          </Button>
        )}

        {report.submission_status === "pending_human_review" && (
          <HumanGateDialog
            trigger={<Button size="sm" className="w-fit">Review (Human Gate)</Button>}
            title="Report Submission Gate"
            description="Approve moves this report to approved_for_submission — the only path there (EAS §9)."
            artefact={<span>{report.title ?? report.report_type}</span>}
            findings={validation ? [{ label: "Reporting Validator", status: validation.status, source: "compliance_findings" }] : undefined}
            requiresJustification={validation ? validation.status !== "pass" : false}
            approveLabel="Approve"
            onApprove={async () => {
              await decide("approve");
            }}
            onReject={async () => {
              await decide("reject");
            }}
          />
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label className="text-xs text-muted-foreground">Lessons learned (Knowledge Platform)</Label>
          <Input value={lessonsTitle} onChange={(e) => setLessonsTitle(e.target.value)} placeholder="Title" />
          <Textarea value={lessonsContent} onChange={(e) => setLessonsContent(e.target.value)} placeholder="What should future proposals learn from this?" />
          <Button size="sm" variant="outline" className="w-fit" onClick={submitLessons} disabled={!lessonsTitle.trim() || !lessonsContent.trim()}>
            Save lessons learned
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
