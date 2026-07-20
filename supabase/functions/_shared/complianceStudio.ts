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
