// Ministry of Procurement — thresholds, tendering, vendor selection (EAS
// §3.2). Net-new, no existing code precedent (Parliament Core §0). Grant
// Studio §4.3 names exactly one concrete Procurement deliverable:
// "Subcontracting/sub-granting oversight... a subcontract is a vendor
// relationship" — and `_shared/partnerPostAward.ts` already implements that
// as plain direct-Supabase CRUD against `partners.subcontract_value`
// (correctly: no cross-table business logic beyond RLS per its own header
// comment). What was still missing is the one part of "vendor selection"
// that genuinely needs drafting help, not a CRUD write: a documented
// rationale for *why* a partner/vendor was selected against the stated
// thresholds — the free-text `justification` that `recordAmendment` in
// partnerPostAward.ts already requires a human to supply. This ministry
// drafts that rationale for human review; it never calls recordAmendment
// itself (no autonomous write — EAS §9's Liability NFR pattern applied here
// even though this isn't a Human Gate).

export interface ProcurementInput {
  partnerName: string;
  decisionType: "subcontract_selection" | "vendor_selection";
  thresholdContext?: string | null;
  candidateSummary?: string | null;
}

export function buildPrompt({ partnerName, decisionType, thresholdContext, candidateSummary }: ProcurementInput): string {
  return `You are the Ministry of Procurement. Draft a procurement decision rationale for a ${decisionType === "subcontract_selection" ? "subcontract" : "vendor"} selection — a human will review and finalise this before it is recorded.

Partner/vendor: ${partnerName}
Applicable thresholds / tendering process: ${thresholdContext || "(none supplied — flag this as an open item)"}
Candidate summary: ${candidateSummary || "(none supplied)"}

Write a concise rationale (under 200 words) covering: which threshold/tendering rule applies, why this candidate was selected, and any risk worth flagging. Do not assert that any specific procurement rule was satisfied unless the threshold context explicitly says so.`;
}

// Deterministic fallback, matching writing.ts's mockDraft pattern.
export function mockDraft({ partnerName, decisionType, thresholdContext, candidateSummary }: ProcurementInput): string {
  const missingThreshold = !thresholdContext || thresholdContext.trim().length < 10;
  return `(mock) Draft procurement rationale for ${decisionType === "subcontract_selection" ? "subcontract" : "vendor"} selection of "${partnerName}". ${
    missingThreshold
      ? "No applicable threshold/tendering process was supplied — this must be confirmed against Annex IV before the decision is finalised."
      : `Applicable threshold context: ${thresholdContext}`
  } ${candidateSummary ? "Candidate summary: " + candidateSummary : ""} No real model call made — human review required before this is recorded via partner-amendment-run.`;
}
