// Reporting Studio — Grant Studio spec §9, Module 8. Ministry: Reporting
// (post-award, reusing Writing's drafting infrastructure — the actual
// drafting call is reporting-agent, already re-platformed in
// projectIntelligence.ts). This module covers the two remaining §9.1
// endpoints: the Reporting Validator (same compliance_findings mechanism
// as Compliance Studio §8, artefact_type: 'report') and the
// Lessons-Learned write-back that closes the Opportunity -> ... ->
// Knowledge Platform -> future Proposal loop §9 describes.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ReportValidationStatus = "pass" | "warning" | "fail" | "context_dependent";

interface ComplianceFinding {
  rule: string;
  source: string;
  severity: string;
  status: string;
  override_justification: string | null;
}

function rollup(findings: ComplianceFinding[]): { status: ReportValidationStatus; riskFlags: string[] } {
  if (findings.length === 0) return { status: "context_dependent", riskFlags: [] };
  const nonPass = findings.filter((f) => f.status !== "pass");
  const riskFlags = nonPass.map((f) => `${f.rule} (${f.source}) — ${f.status}${f.override_justification ? ` [overridden: ${f.override_justification}]` : ""}`);
  const hasUnoverriddenMandatoryFail = findings.some((f) => f.severity === "mandatory" && f.status === "fail" && !f.override_justification);
  if (hasUnoverriddenMandatoryFail) return { status: "fail", riskFlags };
  if (nonPass.length > 0) return { status: "warning", riskFlags };
  return { status: "pass", riskFlags };
}

export interface ValidateReportParams {
  supabase: SupabaseClient;
  organisationId: string;
  reportId: string;
}

export async function validateReport(params: ValidateReportParams): Promise<{ reportId: string; status: ReportValidationStatus; riskFlags: string[] }> {
  const { supabase, organisationId, reportId } = params;

  const { data: findings, error } = await supabase
    .from("compliance_findings")
    .select("rule, source, severity, status, override_justification")
    .eq("organisation_id", organisationId)
    .eq("artefact_type", "report")
    .eq("artefact_id", reportId);
  if (error) throw error;

  const { status, riskFlags } = rollup((findings ?? []) as ComplianceFinding[]);
  if (status === "context_dependent") {
    riskFlags.push(
      "No ingested regulatory findings yet for this report — Regulatory Knowledge Layer ingestion (spec §4) has not run; the Annex G template and Reporting Validator rules must be confirmed manually, not treated as a pass.",
    );
  }

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "system",
    action: "report_validation",
    target_type: "report",
    target_id: reportId,
    detail: { status, riskFlags },
  });

  return { reportId, status, riskFlags };
}

export interface WriteLessonsLearnedParams {
  supabase: SupabaseClient;
  organisationId: string;
  actorId: string;
  reportId: string;
  projectId: string;
  content: string;
  title: string;
}

// §9.1: "Lessons Learned output is written as a knowledge_documents row,
// document_type = 'lessons_learned', project_id-linked" — project linkage
// is via knowledge_document_links (entity_type: 'project'), the real
// mechanism Knowledge Platform uses for this, not a direct column on
// knowledge_documents (which has none).
export async function writeLessonsLearned(params: WriteLessonsLearnedParams): Promise<{ knowledgeDocumentId: string }> {
  const { supabase, organisationId, actorId, reportId, projectId, content, title } = params;

  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      organisation_id: organisationId,
      title,
      content,
      document_type: "lessons_learned",
      source_type: "manual_upload",
      source: `report:${reportId}`,
    })
    .select("id")
    .single();
  if (docErr) throw docErr;

  const { error: linkErr } = await supabase
    .from("knowledge_document_links")
    .insert({ knowledge_document_id: doc.id, entity_type: "project", entity_id: projectId });
  if (linkErr) throw linkErr;

  await supabase.from("audit_events").insert({
    organisation_id: organisationId,
    actor_type: "human",
    actor_id: actorId,
    action: "lessons_learned_recorded",
    target_type: "knowledge_document",
    target_id: doc.id,
    detail: { reportId, projectId },
  });

  return { knowledgeDocumentId: doc.id };
}
