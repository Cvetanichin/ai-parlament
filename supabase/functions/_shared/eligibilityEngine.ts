// Eligibility Engine — Grant Studio spec §3, Module 2. Ministry: Research,
// calling the Regulatory Knowledge Layer's Eligibility API (Regulatory
// Knowledge Layer spec §6). Purpose: replace manual reading of a call's
// Guidelines for Applicants with a structured Go/No-Go input, before
// Writing or Finance & Admin are ever activated (EAS §2 principle 4,
// cost-control).
//
// Deliberately NOT an LLM Agent Invocation. Every Regulatory API finding
// must be a real, cited rule object (EAS §6.3's fixed shape: rule, source,
// severity, status) — "never freeform text asserting a rule exists" (Grant
// Studio §3). The Regulatory Knowledge Layer's ingestion pipeline (§4:
// parser, chunker, rule extractor, embeddings) has not been built yet —
// regulatory_clauses and compliance_findings are real, live, empty tables.
// Rather than fabricate a plausible-sounding assessment via an LLM (which
// would violate the "never freeform text asserting a rule exists" rule the
// moment there's no real finding to cite), this rollup is pure deterministic
// code, exactly like vetoEngine.ts's deterministic/lexical tiers: it reads
// whatever real compliance_findings rows exist and, for categories with none,
// returns the spec's own explicit escape hatch — status: "context_dependent"
// (Regulatory Knowledge Layer spec §6.1's "conservative-by-default rule": a
// query that cannot be answered generically returns context_dependent with a
// note on what a human must confirm, never a best-guess PASS).
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CategoryStatus = "pass" | "warning" | "fail" | "context_dependent";

export const ELIGIBILITY_CATEGORIES = [
  "operational_capacity",
  "financial_capacity",
  "geographic_eligibility",
  "consortium_requirements",
  "budget_ceiling_fit",
] as const;
export type EligibilityCategory = (typeof ELIGIBILITY_CATEGORIES)[number];

export interface ComplianceFinding {
  rule: string;
  source: string;
  severity: string;
  status: string;
}

// compliance_findings.flags (jsonb) carries the category tag — an additive
// use of an existing flexible column rather than a new one (Database Schema
// spec §0's "extend the real table" rule), since no findings-to-category
// mapping column exists yet and none should be invented speculatively ahead
// of the real ingestion pipeline landing.
function rollupCategory(findings: ComplianceFinding[]): { status: CategoryStatus; riskFlags: string[] } {
  if (findings.length === 0) {
    return { status: "context_dependent", riskFlags: [] };
  }
  const riskFlags = findings
    .filter((f) => f.status !== "pass")
    .map((f) => `${f.rule} (${f.source}) — ${f.status}`);
  // compliance_findings.status is constrained (real, live CHECK constraint)
  // to pass|warning|fail|context_dependent|needs_review — not the spec
  // illustration's "missing". A category fails if any mandatory-severity
  // finding within it failed outright; any other non-pass finding degrades
  // the category to a warning rather than a silent pass.
  const hasMandatoryFail = findings.some((f) => f.severity === "mandatory" && f.status === "fail");
  if (hasMandatoryFail) return { status: "fail", riskFlags };
  const hasNonPass = findings.some((f) => f.status !== "pass");
  if (hasNonPass) return { status: "warning", riskFlags };
  return { status: "pass", riskFlags };
}

export interface EligibilityReport {
  id: string;
  organisationId: string;
  opportunityId: string;
  categoryStatus: Record<EligibilityCategory, CategoryStatus>;
  riskFlags: string[];
  recommendation: "go" | "no_go" | "needs_review";
}

export interface RunEligibilityCheckParams {
  supabase: SupabaseClient;
  organisationId: string;
  opportunityId: string;
}

export async function runEligibilityCheck(params: RunEligibilityCheckParams): Promise<EligibilityReport> {
  const { supabase, organisationId, opportunityId } = params;

  const { data: findingsRows, error: findingsErr } = await supabase
    .from("compliance_findings")
    .select("rule, source, severity, status, flags")
    .eq("organisation_id", organisationId)
    .eq("artefact_type", "opportunity")
    .eq("artefact_id", opportunityId);
  if (findingsErr) throw findingsErr;

  const byCategory: Record<EligibilityCategory, ComplianceFinding[]> = {
    operational_capacity: [],
    financial_capacity: [],
    geographic_eligibility: [],
    consortium_requirements: [],
    budget_ceiling_fit: [],
  };
  for (const row of findingsRows ?? []) {
    const category = (row.flags as Record<string, unknown> | null)?.category as EligibilityCategory | undefined;
    if (category && category in byCategory) {
      byCategory[category].push({ rule: row.rule, source: row.source, severity: row.severity, status: row.status });
    }
  }

  const categoryStatus = {} as Record<EligibilityCategory, CategoryStatus>;
  const riskFlags: string[] = [];
  for (const category of ELIGIBILITY_CATEGORIES) {
    const { status, riskFlags: categoryFlags } = rollupCategory(byCategory[category]);
    categoryStatus[category] = status;
    riskFlags.push(...categoryFlags);
    if (status === "context_dependent") {
      riskFlags.push(
        `No ingested regulatory findings yet for ${category} — Regulatory Knowledge Layer ingestion (spec §4) has not run for this opportunity; a human must confirm this category directly against the call's Guidelines for Applicants, not treat this as a pass.`,
      );
    }
  }

  const recommendation: EligibilityReport["recommendation"] = Object.values(categoryStatus).includes("fail")
    ? "no_go"
    : Object.values(categoryStatus).some((s) => s === "warning" || s === "context_dependent")
      ? "needs_review"
      : "go";

  // eligibility_reports.*_status columns are constrained (real, live CHECK
  // constraints) to pass|warning|fail only — no context_dependent slot
  // exists at the per-category-column level, unlike compliance_findings.status
  // above. Rather than force a schema change to store a distinction the
  // real table doesn't have a column for, context_dependent maps to
  // "warning" at the DB boundary — the conservative-by-default intent
  // (never a silent pass) survives via this mapping, and the specific
  // "no ingested data yet, not a real assessment" caveat is preserved in
  // risk_flags (a plain text[], no such constraint) rather than lost.
  const toDbStatus = (status: CategoryStatus): "pass" | "warning" | "fail" =>
    status === "context_dependent" ? "warning" : status;

  const { data: reportRow, error: insertErr } = await supabase
    .from("eligibility_reports")
    .insert({
      organisation_id: organisationId,
      opportunity_id: opportunityId,
      operational_capacity_status: toDbStatus(categoryStatus.operational_capacity),
      financial_capacity_status: toDbStatus(categoryStatus.financial_capacity),
      geographic_eligibility_status: toDbStatus(categoryStatus.geographic_eligibility),
      consortium_requirements_status: toDbStatus(categoryStatus.consortium_requirements),
      budget_ceiling_fit_status: toDbStatus(categoryStatus.budget_ceiling_fit),
      risk_flags: riskFlags,
      recommendation,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "system",
    action: "eligibility_check",
    target_type: "opportunity",
    target_id: opportunityId,
    detail: { categoryStatus, riskFlags, recommendation, reportId: reportRow.id },
  });

  return { id: reportRow.id, organisationId, opportunityId, categoryStatus, riskFlags, recommendation };
}
