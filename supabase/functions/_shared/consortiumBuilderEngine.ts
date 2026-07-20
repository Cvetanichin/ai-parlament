// Consortium Builder — Grant Studio spec §4.1, Module 3 (pre-award only).
// Ministry: Research + Compliance (modelled as a Committee, EAS §3.2 — "cross-
// ministry review bodies... modelled as workflow participants, not separate
// services"). No Workflow Instance is spun up here, matching how
// eligibilityEngine.ts (Module 2) already operates: this pass is checklist/
// rule evaluation, not LLM drafting + veto, so it doesn't enter the Workflow
// Engine's state machine.
//
// Deliberately NOT an LLM Agent Invocation, same rationale as
// eligibilityEngine.ts: §4.1 routes due-diligence "through the Compliance
// Engine's eligibility validator" -- i.e. this reuses Module 2's machinery,
// not a freeform LLM judge. compliance_findings.clause_id is NOT NULL
// REFERENCES regulatory_clauses, and regulatory_clauses is real but
// currently empty (ingestion pipeline not built yet) -- an LLM judge would
// have nothing real to cite, violating Grant Studio §3's "never freeform
// text asserting a rule exists." So both functions below are pure
// deterministic code: they read whatever real compliance_findings/
// eligibility_reports rows exist and fall back to context_dependent when
// none do, never a fabricated pass.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type DueDiligenceStatus = "pass" | "warning" | "fail" | "context_dependent";

interface ComplianceFinding {
  rule: string;
  source: string;
  severity: string;
  status: string;
}

export interface RunPartnerDueDiligenceParams {
  supabase: SupabaseClient;
  organisationId: string;
  partnerId: string;
}

export interface PartnerDueDiligenceResult {
  partnerId: string;
  status: DueDiligenceStatus;
  riskFlags: string[];
}

// Same rollup shape as eligibilityEngine.ts's rollupCategory: a mandatory-
// severity fail fails the whole check; any other non-pass finding degrades
// to a warning; no findings at all is context_dependent, never a silent
// pass (Regulatory Knowledge Layer spec §6.1's conservative-by-default
// rule).
function rollupFindings(findings: ComplianceFinding[]): { status: DueDiligenceStatus; riskFlags: string[] } {
  if (findings.length === 0) {
    return { status: "context_dependent", riskFlags: [] };
  }
  const riskFlags = findings
    .filter((f) => f.status !== "pass")
    .map((f) => `${f.rule} (${f.source}) — ${f.status}`);
  const hasMandatoryFail = findings.some((f) => f.severity === "mandatory" && f.status === "fail");
  if (hasMandatoryFail) return { status: "fail", riskFlags };
  const hasNonPass = findings.some((f) => f.status !== "pass");
  if (hasNonPass) return { status: "warning", riskFlags };
  return { status: "pass", riskFlags };
}

// §4.1's due-diligence check: "routed through the Compliance Engine's
// eligibility validator for each partner (exclusion/selection criteria —
// Annex H territory)". Reads compliance_findings scoped to this partner
// (artefact_type: 'partner' — free text column, no CHECK constraint
// restricts it to 'opportunity', so no schema change was needed to add
// this artefact type) and writes the rollup back to
// partners.due_diligence_status, which — unlike eligibility_reports'
// narrower CHECK constraint — is free text, so context_dependent can be
// stored as-is with no remapping.
export async function runPartnerDueDiligence(params: RunPartnerDueDiligenceParams): Promise<PartnerDueDiligenceResult> {
  const { supabase, organisationId, partnerId } = params;

  const { data: findingsRows, error: findingsErr } = await supabase
    .from("compliance_findings")
    .select("rule, source, severity, status")
    .eq("organisation_id", organisationId)
    .eq("artefact_type", "partner")
    .eq("artefact_id", partnerId);
  if (findingsErr) throw findingsErr;

  const { status, riskFlags } = rollupFindings(findingsRows ?? []);
  if (status === "context_dependent") {
    riskFlags.push(
      "No ingested regulatory findings yet for this partner — Regulatory Knowledge Layer ingestion (spec §4) has not run; a human must confirm exclusion/selection criteria (Annex H) directly, not treat this as a pass.",
    );
  }

  const { error: updateErr } = await supabase
    .from("partners")
    .update({ due_diligence_status: status })
    .eq("id", partnerId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "system",
    action: "partner_due_diligence_check",
    target_type: "partner",
    target_id: partnerId,
    detail: { status, riskFlags },
  });

  return { partnerId, status, riskFlags };
}

export interface ScorePartnerCapacityParams {
  supabase: SupabaseClient;
  organisationId: string;
  partnerId: string;
  opportunityId: string;
}

export interface PartnerCapacityResult {
  partnerId: string;
  capacityScore: number | null;
  status: "scored" | "context_dependent";
  riskFlags: string[];
}

// §4.1's partner scoring: "capacity assessment against the specific call's
// consortium requirements (from the Eligibility Report, §3)". Reads the
// opportunity's eligibility_reports row (already populated by Module 2) —
// if none exists yet, this returns context_dependent rather than guessing,
// same conservative-by-default rule as the due-diligence check above.
export async function scorePartnerCapacity(params: ScorePartnerCapacityParams): Promise<PartnerCapacityResult> {
  const { supabase, organisationId, partnerId, opportunityId } = params;

  const { data: report, error: reportErr } = await supabase
    .from("eligibility_reports")
    .select("consortium_requirements_status")
    .eq("organisation_id", organisationId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportErr) throw reportErr;

  if (!report) {
    const riskFlags = [
      "No eligibility report exists yet for this opportunity — run the Eligibility Engine (Grant Studio §3) first; capacity cannot be scored against unknown consortium requirements.",
    ];
    await supabase.from("audit_events").insert({
      organisation_id: organisationId,
      actor_type: "system",
      action: "partner_capacity_score",
      target_type: "partner",
      target_id: partnerId,
      detail: { status: "context_dependent", riskFlags },
    });
    return { partnerId, capacityScore: null, status: "context_dependent", riskFlags };
  }

  const { data: partner, error: partnerErr } = await supabase
    .from("partners")
    .select("pic_pador, role, past_cooperation_notes")
    .eq("id", partnerId)
    .single();
  if (partnerErr) throw partnerErr;

  // Deterministic starting score, adjusted against real structured signals
  // only — no LLM-freeform assessment, same principle as the due-diligence
  // check. A partner with a registered PIC/PADOR identifier and a role
  // already assigned starts higher; a NO-GO/fail on the call's own
  // consortium_requirements_status caps the score regardless of the
  // partner's own record, since the call's requirements are the binding
  // constraint here.
  const riskFlags: string[] = [];
  let capacityScore = 50;
  if (partner.pic_pador) capacityScore += 15;
  else riskFlags.push("Partner has no PIC/PADOR identifier on file — verify legal entity registration before proceeding.");
  if (partner.role) capacityScore += 10;
  else riskFlags.push("Partner has no role/mandate assigned yet (lead applicant / co-applicant / associate).");
  if (partner.past_cooperation_notes) capacityScore += 10;

  if (report.consortium_requirements_status === "fail") {
    capacityScore = Math.min(capacityScore, 20);
    riskFlags.push("Call's consortium_requirements_status is 'fail' — this partner cannot offset a call-level requirement failure.");
  } else if (report.consortium_requirements_status === "warning") {
    capacityScore = Math.min(capacityScore, 60);
    riskFlags.push("Call's consortium_requirements_status is 'warning' — review before relying on this score.");
  }

  capacityScore = Math.max(0, Math.min(100, capacityScore));

  const { error: updateErr } = await supabase
    .from("partners")
    .update({ capacity_score: capacityScore })
    .eq("id", partnerId);
  if (updateErr) throw updateErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "system",
    action: "partner_capacity_score",
    target_type: "partner",
    target_id: partnerId,
    detail: { capacityScore, riskFlags, consortiumRequirementsStatus: report.consortium_requirements_status },
  });

  return { partnerId, capacityScore, status: "scored", riskFlags };
}
