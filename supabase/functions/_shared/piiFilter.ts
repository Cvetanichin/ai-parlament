// PII Filter (Pre-Prompt Redaction) — Security spec §4. Operationalises
// EAS §7.3: "Beneficiary PII... excluded from the Knowledge Platform's RAG
// index and from any prompt sent through the LLM Gateway."
//
// Scope (§4.1): beneficiary names, vulnerability status, GPS/location data,
// national ID numbers, beneficiary contact details (phone/email). Donor,
// partner, and staff contact information is explicitly OUT of scope —
// filtering it would break the platform's actual function (a donor
// programme officer's email, a partner's legal signatory contact). This
// module cannot structurally tell "beneficiary phone number" from "donor
// phone number" from text content alone — that's exactly the v1 limitation
// §4.3 names ("name detection is the weakest link... a known v1
// limitation, not a silent gap"), extended here to phone/email/national ID
// detection too, not just names. Both call sites below scope this filter
// to content that is plausibly beneficiary-referencing (Knowledge Platform
// ingestion of project/M&E documents) rather than applying it platform-wide
// to donor/grant metadata where it would do real harm.
//
// Detection approach v1 (§4.3): pattern-based (regex/keyword), no NER
// model, no beneficiary-name cross-reference list (none exists in this
// repo yet — falls back to "no name-specific filtering," the spec's own
// explicit escape hatch).

export type RedactionType = "gps" | "national_id" | "phone" | "email";

export interface Redaction {
  type: RedactionType;
  count: number;
}

export interface RedactionResult {
  redactedText: string;
  redactions: Redaction[];
}

// Decimal-degree GPS pairs (e.g. "41.9981, 21.4254") — the common form
// beneficiary household/site coordinates appear in M&E documents.
const GPS_PATTERN = /-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}/g;

// National ID: a conservative 6-13 digit run, optionally hyphenated in
// 2-4 digit groups — deliberately broad given no single national ID
// format applies across every jurisdiction this platform's donors operate
// in (§4.1 doesn't name one specific country's scheme).
const NATIONAL_ID_PATTERN = /\b\d{2,4}[-\s]?\d{2,4}[-\s]?\d{2,6}\b/g;

const PHONE_PATTERN = /\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PLACEHOLDER: Record<RedactionType, string> = {
  gps: "[GPS_REDACTED]",
  national_id: "[NATIONAL_ID_REDACTED]",
  phone: "[PHONE_REDACTED]",
  email: "[EMAIL_REDACTED]",
};

// Order matters: GPS and email are the most structurally distinctive
// (fewest false positives) and are matched first so their characters
// aren't consumed by the looser national-ID/phone patterns afterward.
export function redactBeneficiaryPII(text: string): RedactionResult {
  let redactedText = text;
  const redactions: Redaction[] = [];

  const passes: Array<[RedactionType, RegExp]> = [
    ["gps", GPS_PATTERN],
    ["email", EMAIL_PATTERN],
    ["phone", PHONE_PATTERN],
    ["national_id", NATIONAL_ID_PATTERN],
  ];

  for (const [type, pattern] of passes) {
    const matches = redactedText.match(pattern);
    if (matches && matches.length > 0) {
      redactedText = redactedText.replace(pattern, PLACEHOLDER[type]);
      redactions.push({ type, count: matches.length });
    }
  }

  return { redactedText, redactions };
}
