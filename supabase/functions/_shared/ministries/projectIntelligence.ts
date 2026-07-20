// Ported near-verbatim from the real, live me-agent / compliance-agent /
// reporting-agent Edge Functions (Project Operations spec §0: confirmed
// against actual source at the connected Intelligence Workspace codebase,
// supabase/functions/{me-agent,compliance-agent,reporting-agent}/index.ts —
// same live Supabase project this repo's migrations already apply to).
// Prompt wording and section structure are unchanged; only the surrounding
// mechanics differ, per Project Operations spec §6: querying moves to the
// caller (data-fetch stays in the Edge Function, as before), but prompt
// construction + LLM call now go through the Ministry Adapter contract
// (buildPrompt/mockRun/parseResponse) and the Agent Runtime's invokeAgent,
// not an inline Anthropic SDK call — closing gap §2.3 without changing
// what these three ministries actually say to the model.
//
// Row shapes below are intentionally loose (Record<string, unknown>) —
// these read from the real, live projects/indicators/activities/risks/
// project_documents tables, whose exact optional-field shape this repo
// does not own or fully specify (Project Operations spec §1.1 documents
// the fields actually used here).

interface ProjectRow {
  name?: string;
  donor?: string;
  grant_reference?: string;
  start_date?: string;
  end_date?: string;
}
type Row = Record<string, unknown>;

export interface MeAgentInput {
  project: ProjectRow | null;
  periodStart: string;
  periodEnd: string;
  indicators: Row[];
  activities: Row[];
  risks: Row[];
}

export function buildMeAgentPrompt({ project, periodStart, periodEnd, indicators, activities, risks }: MeAgentInput): string {
  return `You are an M&E (Monitoring & Evaluation) analyst for a CSO project. Produce a concise monthly M&E intelligence brief.

PROJECT: ${project?.name ?? "Unknown"}
PERIOD: ${periodStart} to ${periodEnd}
DONOR: ${project?.donor ?? "Not specified"}

INDICATORS (${indicators.length} total):
${indicators.map((i) => `- ${i.name} [${i.level ?? "unknown level"}]: Baseline ${i.baseline ?? "?"} | Target ${i.target ?? "?"} | Actual ${i.actual ?? "not reported"} ${i.unit ?? ""} | Status: ${i.status ?? "unknown"}`).join("\n")}

ACTIVITIES (${activities.length} total):
${activities.map((a) => `- ${a.title}: ${a.status} (${a.responsible ?? "no responsible"})`).join("\n")}

OPEN RISKS (${risks.length}):
${risks.map((r) => `- ${r.title} [${r.risk_level ?? "unknown"} risk]: ${r.mitigation ?? "No mitigation"}`).join("\n")}

Write a structured M&E brief in markdown with these sections:
## Executive Summary
## Indicator Status
## Activity Progress
## Data Quality & Evidence Gaps
## Key Risks
## Recommended Actions

Be specific, professional, and evidence-based. Flag concrete issues. Keep it under 600 words.`;
}

export function mockMeAgentRun({ project, indicators, activities, risks }: MeAgentInput): string {
  return `## Executive Summary\n(mock) M&E brief for ${project?.name ?? "the project"} — ${indicators.length} indicators, ${activities.length} activities, ${risks.length} open risks tracked.\n## Indicator Status\nNo real model call made (mock provider).\n## Activity Progress\n(mock)\n## Data Quality & Evidence Gaps\n(mock)\n## Key Risks\n(mock)\n## Recommended Actions\n(mock)`;
}

export interface ComplianceAgentInput {
  project: ProjectRow | null;
  periodStart: string;
  periodEnd: string;
  docs: Row[];
  risks: Row[];
  activities: Row[];
  indicators: Row[];
}

export function buildComplianceAgentPrompt({ project, periodStart, periodEnd, docs, risks, activities, indicators }: ComplianceAgentInput): string {
  const docList = docs.map((d) => `- ${d.name} [${d.category ?? "uncategorised"}]`).join("\n");
  const riskList = risks.map((r) => `- ${r.title} [${r.category ?? "general"}, ${r.risk_level ?? "?"} risk, ${r.status}]`).join("\n");

  return `You are a compliance analyst reviewing a CSO/NGO project for donor compliance and organisational risk.

PROJECT: ${project?.name ?? "Unknown"}
DONOR: ${project?.donor ?? "Not specified"}
GRANT REF: ${project?.grant_reference ?? "N/A"}
PERIOD: ${periodStart} to ${periodEnd}

DOCUMENTS ON FILE (${docs.length}):
${docList || "No documents uploaded"}

RISK REGISTER (${risks.length} risks):
${riskList || "No risks logged"}

ACTIVITIES (${activities.length}):
${activities.map((a) => `- ${a.title}: ${a.status}`).join("\n") || "None logged"}

INDICATORS with data gaps (missing actuals):
${indicators.filter((i) => i.actual === null || i.actual === undefined).map((i) => `- ${i.name}`).join("\n") || "All indicators have data"}

Produce a structured compliance review in markdown with these sections:
## Compliance Status Overview
## Document Completeness
(Check for: log frame, budget, narrative reports, contracts, annexes, visibility materials)
## Data & Reporting Gaps
## Risk Assessment
## Audit Readiness
## Required Actions (prioritised)

Rate overall compliance: GREEN / AMBER / RED with justification. Be direct and specific.`;
}

export function mockComplianceAgentRun({ project, docs, risks }: ComplianceAgentInput): string {
  return `## Compliance Status Overview\n(mock) Compliance review for ${project?.name ?? "the project"} — ${docs.length} documents on file, ${risks.length} risks logged.\nOverall compliance: AMBER (mock, no real model call made).\n## Document Completeness\n(mock)\n## Data & Reporting Gaps\n(mock)\n## Risk Assessment\n(mock)\n## Audit Readiness\n(mock)\n## Required Actions (prioritised)\n(mock)`;
}

export interface ReportingAgentInput {
  project: ProjectRow | null;
  periodStart: string;
  periodEnd: string;
  indicators: Row[];
  activities: Row[];
  risks: Row[];
  docs: Row[];
}

export function buildReportingAgentPrompt({ project, periodStart, periodEnd, indicators, activities, risks, docs }: ReportingAgentInput): string {
  const indByStatus = (status: string) => indicators.filter((i) => i.status === status);
  const actByStatus = (status: string) => activities.filter((a) => a.status === status);

  return `You are a senior programme officer writing a donor progress report for a CSO/NGO project.

PROJECT: ${project?.name ?? "Unknown"}
DONOR: ${project?.donor ?? "Not specified"}
GRANT REF: ${project?.grant_reference ?? "N/A"}
REPORTING PERIOD: ${periodStart} to ${periodEnd}
PROJECT DURATION: ${project?.start_date ?? "?"} to ${project?.end_date ?? "?"}

INDICATOR SUMMARY:
- On track: ${indByStatus("on_track").length}
- At risk: ${indByStatus("at_risk").length}
- Behind: ${indByStatus("behind").length}
- Achieved: ${indByStatus("achieved").length}

KEY INDICATORS:
${indicators.slice(0, 8).map((i) => `- ${i.name}: ${i.actual ?? "NR"} / ${i.target ?? "?"} ${i.unit ?? ""} (${i.status ?? "unknown"})`).join("\n")}

ACTIVITY PROGRESS:
- Completed: ${actByStatus("completed").length}
- In progress: ${actByStatus("in_progress").length}
- Delayed: ${actByStatus("delayed").length}

COMPLETED ACTIVITIES:
${actByStatus("completed").slice(0, 5).map((a) => `- ${a.title}${a.output ? ": " + a.output : ""}`).join("\n") || "None"}

IN-PROGRESS ACTIVITIES:
${actByStatus("in_progress").slice(0, 5).map((a) => `- ${a.title} (${a.responsible ?? "unassigned"})`).join("\n") || "None"}

OPEN RISKS (${risks.length}):
${risks.map((r) => `- ${r.title} [${r.risk_level ?? "?"}]: ${r.mitigation ?? "No mitigation"}`).join("\n") || "None"}

DOCUMENTS ON FILE: ${docs.length}

Write a professional donor progress report in markdown with:
## Executive Summary (3-4 sentences)
## Progress Against Objectives
## Activity Implementation
### Completed This Period
### Ongoing Activities
### Delayed / Not Started
## Results and Indicators
## Challenges and Mitigations
## Financial Overview
(Note if budget data is available; otherwise note it's not provided in this brief)
## Next Steps (next 30-60 days)
## Annexes Required

Write in formal donor report language. Be evidence-based. Acknowledge gaps honestly.`;
}

export function mockReportingAgentRun({ project, indicators, activities, risks }: ReportingAgentInput): string {
  return `## Executive Summary\n(mock) Progress report for ${project?.name ?? "the project"} — ${indicators.length} indicators, ${activities.length} activities, ${risks.length} open risks tracked. No real model call made.\n## Progress Against Objectives\n(mock)\n## Activity Implementation\n(mock)\n## Results and Indicators\n(mock)\n## Challenges and Mitigations\n(mock)\n## Financial Overview\nNot provided in this brief.\n## Next Steps (next 30-60 days)\n(mock)\n## Annexes Required\n(mock)`;
}

export interface ProposalAgentInput {
  system: string;
  prompt: string;
}

// Raw passthrough (Project Operations spec §1.2: "no project linkage...
// no persistence"). buildPrompt here IS the caller's prompt — no template
// of this ministry's own to speak of, matching the real function's shape.
// The real function sends `system` as Anthropic's separate top-level
// system parameter; llmGateway.ts has no such parameter yet (it sends one
// user-role message, shared by every ministry) — folded into the prompt
// text instead rather than widening the shared Gateway contract for one
// caller. Known fidelity gap, not a silent behavioural change: a system
// prompt folded into the user turn is not always equivalent to a real
// system-role message.
export function buildProposalAgentPrompt({ system, prompt }: ProposalAgentInput): string {
  return `${system}\n\n${prompt}`;
}

export function mockProposalAgentRun({ prompt }: ProposalAgentInput): string {
  return `(mock) No real model call made. Echoing prompt length: ${prompt.length} characters.`;
}
