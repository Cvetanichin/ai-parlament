// Compliance Studio — Grant Studio spec §8, Module 7. Ministry: Compliance
// ("the Opposition"). §8.1: "No new storage — every validator writes
// compliance_findings rows... Compliance Studio is purely an orchestration
// layer that... aggregates the results for the Polish Gate view — it has
// no table of its own to add."
//
// This aggregates across every artefact type §8.1 names for one proposal:
// the proposal itself, its budget(s), its logframe narrative, and its
// partners — each already written by the modules built earlier
// (budgetEngine.ts, consortiumBuilderEngine.ts) or awaiting a real
// Regulatory Knowledge Layer validator run (proposal, logframe — no
// validator writes these yet, so they read as context_dependent, same
// honest fallback used everywhere else in this codebase).
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ComplianceStatus = "pass" | "warning" | "fail" | "context_dependent";
export const ARTEFACT_TYPES = ["proposal", "budget", "logframe", "partner"] as const;
export type ArtefactType = (typeof ARTEFACT_TYPES)[number];

interface ComplianceFinding {
  id: string;
  rule: string;
  source: string;
  severity: string;
  status: string;
  override_justification: string | null;
}

interface RollupResult {
  status: ComplianceStatus;
  riskFlags: string[];
  // Count of non-pass findings with no override_justification recorded —
  // Submission Gateway (§10.1) needs this to distinguish a plain 'warning'
  // from an "explicitly overridden warning" (the only two states its own
  // compliance_status_snapshot CHECK constraint allows alongside 'pass').
  unoverriddenNonPassCount: number;
}

function rollup(findings: ComplianceFinding[]): RollupResult {
  if (findings.length === 0) return { status: "context_dependent", riskFlags: [], unoverriddenNonPassCount: 0 };
  const nonPass = findings.filter((f) => f.status !== "pass");
  const riskFlags = nonPass.map(
    (f) => `${f.rule} (${f.source}) — ${f.status}${f.override_justification ? ` [overridden: ${f.override_justification}]` : ""}`,
  );
  const unoverriddenNonPassCount = nonPass.filter((f) => !f.override_justification).length;
  const hasUnoverriddenMandatoryFail = findings.some((f) => f.severity === "mandatory" && f.status === "fail" && !f.override_justification);
  if (hasUnoverriddenMandatoryFail) return { status: "fail", riskFlags, unoverriddenNonPassCount };
  if (nonPass.length > 0) return { status: "warning", riskFlags, unoverriddenNonPassCount };
  return { status: "pass", riskFlags, unoverriddenNonPassCount };
}

export interface ComplianceStatusResult {
  proposalId: string;
  byArtefactType: Record<ArtefactType, RollupResult>;
  overallStatus: ComplianceStatus;
  allNonPassOverridden: boolean;
}

export interface GetComplianceStatusParams {
  supabase: SupabaseClient;
  organisationId: string;
  proposalId: string;
}

// A FAIL with an override_justification attached does NOT get silently
// suppressed here (EAS §3.1: "never silently suppresses a flag") — it
// still surfaces in riskFlags, annotated with the override, and it no
// longer forces the artefact-type status to 'fail' on its own. This is
// the same distinction decideGate's gate-level override makes: the flag
// stays visible and logged, only the blocking effect is lifted, and only
// because a human consciously recorded a justification for it.
export async function getComplianceStatus(params: GetComplianceStatusParams): Promise<ComplianceStatusResult> {
  const { supabase, organisationId, proposalId } = params;

  const artefactIds: Record<ArtefactType, string[]> = { proposal: [proposalId], budget: [], logframe: [], partner: [] };

  const [{ data: budgets }, { data: narrative }, { data: partners }] = await Promise.all([
    supabase.from("budgets").select("id").eq("proposal_id", proposalId),
    supabase.from("logframe_narratives").select("id").eq("proposal_id", proposalId).maybeSingle(),
    supabase.from("partners").select("id").eq("proposal_id", proposalId),
  ]);
  artefactIds.budget = (budgets ?? []).map((b) => b.id);
  artefactIds.logframe = narrative ? [narrative.id] : [];
  artefactIds.partner = (partners ?? []).map((p) => p.id);

  const byArtefactType = {} as ComplianceStatusResult["byArtefactType"];
  for (const artefactType of ARTEFACT_TYPES) {
    const ids = artefactIds[artefactType];
    if (ids.length === 0) {
      byArtefactType[artefactType] = { status: "context_dependent", riskFlags: [], unoverriddenNonPassCount: 0 };
      continue;
    }
    const { data: findings, error } = await supabase
      .from("compliance_findings")
      .select("id, rule, source, severity, status, override_justification")
      .eq("organisation_id", organisationId)
      .eq("artefact_type", artefactType)
      .in("artefact_id", ids);
    if (error) throw error;
    byArtefactType[artefactType] = rollup((findings ?? []) as ComplianceFinding[]);
  }

  const severityOrder: ComplianceStatus[] = ["fail", "warning", "context_dependent", "pass"];
  const statuses = ARTEFACT_TYPES.map((t) => byArtefactType[t].status);
  const overallStatus = severityOrder.find((s) => statuses.includes(s)) ?? "pass";
  const allNonPassOverridden = ARTEFACT_TYPES.every((t) => byArtefactType[t].unoverriddenNonPassCount === 0);

  return { proposalId, byArtefactType, overallStatus, allNonPassOverridden };
}

export interface OrganisationComplianceItem {
  id: string;
  label: string;
  status: ComplianceStatus;
}

export interface OrganisationComplianceOverview {
  proposals: OrganisationComplianceItem[];
  projects: OrganisationComplianceItem[];
  countsByStatus: Record<ComplianceStatus, number>;
}

// Executive Dashboard (Frontend spec §5): "compliance posture — aggregated
// compliance_findings status across active Proposals/Projects, same
// aggregation Grant Studio §8.1's GET /compliance/status already computes
// per-proposal, rolled up here across all of them." Proposal status reuses
// getComplianceStatus's own overallStatus (multi-artefact-type rollup) per
// proposal. Projects have no artefact_type of their own in
// compliance_findings — post-award compliance is tracked per Report
// (artefact_type: 'report', reportingStudio.ts's validateReport) — so a
// project's status here is the worst status across its own reports' own
// findings, using this module's own `rollup()` directly rather than
// calling validateReport in a loop (which writes an audit_events row per
// call — fine for an explicit single validation, wrong for a read-only
// dashboard view loaded on every visit, per this section's own "no write
// actions originate from this section" rule).
export interface GetOrganisationComplianceOverviewParams {
  supabase: SupabaseClient;
  organisationId: string;
}

export async function getOrganisationComplianceOverview(
  params: GetOrganisationComplianceOverviewParams,
): Promise<OrganisationComplianceOverview> {
  const { supabase, organisationId } = params;

  const [{ data: proposals }, { data: opportunities }, { data: projects }, { data: reports }] = await Promise.all([
    supabase.from("proposals").select("id, opportunity_id").eq("organisation_id", organisationId),
    supabase.from("opportunities").select("id, title").eq("organisation_id", organisationId),
    supabase.from("projects").select("id, name").eq("organisation_id", organisationId),
    supabase.from("reports").select("id, project_id").eq("organisation_id", organisationId),
  ]);

  const opportunityTitleById = new Map((opportunities ?? []).map((o) => [o.id, o.title as string]));

  const proposalIds = (proposals ?? []).map((p) => p.id);
  const { data: proposalFindings, error: proposalFindingsErr } = proposalIds.length
    ? await supabase
        .from("compliance_findings")
        .select("id, artefact_id, rule, source, severity, status, override_justification")
        .eq("organisation_id", organisationId)
        .eq("artefact_type", "proposal")
        .in("artefact_id", proposalIds)
    : { data: [] as { id: string; artefact_id: string; rule: string; source: string; severity: string; status: string; override_justification: string | null }[], error: null };
  if (proposalFindingsErr) throw proposalFindingsErr;

  const proposalFindingsByProposal = new Map<string, ComplianceFinding[]>();
  for (const finding of proposalFindings ?? []) {
    const list = proposalFindingsByProposal.get(finding.artefact_id) ?? [];
    list.push(finding);
    proposalFindingsByProposal.set(finding.artefact_id, list);
  }

  const proposalItems: OrganisationComplianceItem[] = (proposals ?? []).map((p) => ({
    id: p.id,
    label: opportunityTitleById.get(p.opportunity_id) ?? "Untitled Opportunity",
    status: rollup(proposalFindingsByProposal.get(p.id) ?? []).status,
  }));

  const reportIdsByProject = new Map<string, string[]>();
  for (const report of reports ?? []) {
    if (!report.project_id) continue;
    const list = reportIdsByProject.get(report.project_id) ?? [];
    list.push(report.id);
    reportIdsByProject.set(report.project_id, list);
  }

  const allReportIds = (reports ?? []).map((r) => r.id);
  const { data: reportFindings, error: reportFindingsErr } = allReportIds.length
    ? await supabase
        .from("compliance_findings")
        .select("id, artefact_id, rule, source, severity, status, override_justification")
        .eq("organisation_id", organisationId)
        .eq("artefact_type", "report")
        .in("artefact_id", allReportIds)
    : { data: [] as { id: string; artefact_id: string; rule: string; source: string; severity: string; status: string; override_justification: string | null }[], error: null };
  if (reportFindingsErr) throw reportFindingsErr;

  const reportFindingsByReport = new Map<string, ComplianceFinding[]>();
  for (const finding of reportFindings ?? []) {
    const list = reportFindingsByReport.get(finding.artefact_id) ?? [];
    list.push(finding);
    reportFindingsByReport.set(finding.artefact_id, list);
  }

  const severityOrder: ComplianceStatus[] = ["fail", "warning", "context_dependent", "pass"];
  const projectItems: OrganisationComplianceItem[] = (projects ?? []).map((project) => {
    const reportIds = reportIdsByProject.get(project.id) ?? [];
    if (reportIds.length === 0) {
      return { id: project.id, label: project.name, status: "context_dependent" as ComplianceStatus };
    }
    const reportStatuses = reportIds.map((rid) => rollup(reportFindingsByReport.get(rid) ?? []).status);
    const worst = severityOrder.find((s) => reportStatuses.includes(s)) ?? "pass";
    return { id: project.id, label: project.name, status: worst };
  });

  const countsByStatus: Record<ComplianceStatus, number> = { pass: 0, warning: 0, fail: 0, context_dependent: 0 };
  for (const item of [...proposalItems, ...projectItems]) countsByStatus[item.status]++;

  return { proposals: proposalItems, projects: projectItems, countsByStatus };
}

export interface OverrideFindingParams {
  supabase: SupabaseClient;
  organisationId: string;
  actorId: string;
  findingId: string;
  justification: string;
}

export async function overrideFinding(params: OverrideFindingParams): Promise<{ findingId: string; overrideJustification: string }> {
  const { supabase, organisationId, actorId, findingId, justification } = params;
  if (!justification?.trim()) {
    throw new Error("override_justification_required: a non-empty justification is required to override a compliance finding");
  }

  const { data: finding, error: findingErr } = await supabase
    .from("compliance_findings")
    .select("id, organisation_id, artefact_type, artefact_id, status")
    .eq("id", findingId)
    .single();
  if (findingErr || !finding) throw new Error("not_found: compliance finding not found");
  if (finding.organisation_id !== organisationId) throw new Error("forbidden: finding belongs to a different organisation");

  const { error: updateErr } = await supabase
    .from("compliance_findings")
    .update({ override_justification: justification })
    .eq("id", findingId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "human",
    actor_id: actorId,
    action: "compliance_override",
    target_type: finding.artefact_type,
    target_id: finding.artefact_id,
    detail: { findingId, originalStatus: finding.status, overrideJustification: justification },
  });

  return { findingId, overrideJustification: justification };
}
