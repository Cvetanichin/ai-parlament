// Ministry of Fundraising — Opportunity Intelligence (EAS §3.2: "Fundraising
// (Opportunity Intelligence — see Grant Studio §10.1)"; Grant Studio §2.2).
// Net-new — no existing code precedent (Parliament Core spec §0 lists
// Fundraising among the ministries built to the Ministry Adapter contract
// from scratch). Drafts the strategic narrative + risk/relevance scoring for
// an ingested Opportunity. Explicitly advisory: Grant Studio §2.2 requires
// this output be "re-labelled as AI-generated guidance needing Research
// sign-off, not an autonomous verdict" — callers must not treat riskScore/
// relevanceScore as a final decision, only as input to the Research
// Ministry's own Go/No-Go assessment.

export interface FundraisingInput {
  opportunity: {
    title: string;
    description?: string | null;
    donorName?: string | null;
    region?: string | null;
    fundingType?: string | null;
    amountMin?: number | null;
    amountMax?: number | null;
    deadline?: string | null;
    eligibilitySummary?: string | null;
    tags?: string[];
  };
}

export interface FundraisingResult {
  strategicNarrative: string;
  riskScore: number;
  relevanceScore: number;
  flags: string[];
}

export function buildPrompt({ opportunity }: FundraisingInput): string {
  return `You are the Ministry of Fundraising's Opportunity Intelligence function. Assess this funding opportunity and draft advisory guidance for Research to cross-check — you are NOT making the Go/No-Go decision.

Opportunity: ${opportunity.title}
Donor: ${opportunity.donorName || "(unknown)"}
Description: ${opportunity.description || "(none supplied)"}
Region: ${opportunity.region || "(unspecified)"}
Funding type: ${opportunity.fundingType || "(unspecified)"}
Amount range: ${opportunity.amountMin ?? "?"} - ${opportunity.amountMax ?? "?"}
Deadline: ${opportunity.deadline || "(none)"}
Eligibility summary: ${opportunity.eligibilitySummary || "(none supplied)"}
Tags: ${(opportunity.tags || []).join(", ") || "(none)"}

Return ONLY valid JSON, no prose, in this exact shape:
{"strategicNarrative": "<2-4 sentence advisory narrative — never assert eligibility as fact>", "riskScore": <integer 0-100, higher = riskier>, "relevanceScore": <integer 0-100, higher = more relevant to a CSO/NGO grant portfolio>, "flags": [string, ...]}`;
}

// Deterministic fallback — mirrors the same "flag what's missing" pattern
// research.ts's mockRun uses, since this ministry feeds the same downstream
// human decision (Grant Studio §2.2: advisory only).
export function mockRun({ opportunity }: FundraisingInput): string {
  const flags: string[] = [];
  let risk = 40;
  let relevance = 60;

  if (!opportunity.eligibilitySummary || opportunity.eligibilitySummary.trim().length < 20) {
    flags.push("No eligibility summary supplied — eligibility cannot be assessed from this record alone.");
    risk += 15;
  }
  if (!opportunity.deadline) {
    flags.push("No deadline recorded — cannot assess time pressure.");
    risk += 5;
  }
  if (!opportunity.amountMin && !opportunity.amountMax) {
    flags.push("No funding amount range recorded.");
    relevance -= 10;
  }

  risk = Math.max(0, Math.min(100, risk));
  relevance = Math.max(0, Math.min(100, relevance));

  const strategicNarrative =
    `(mock) Provisional read on "${opportunity.title}": ` +
    `${flags.length ? "data gaps present — " + flags.join(" ") : "record looks complete enough for a first pass."} ` +
    `Requires Research Ministry sign-off before this feeds any Go/No-Go decision.`;

  return JSON.stringify({ strategicNarrative, riskScore: risk, relevanceScore: relevance, flags });
}

function stripCodeFence(raw: string): string {
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : raw;
}

export function parseResponse(raw: string): FundraisingResult {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    return {
      strategicNarrative: String(parsed.strategicNarrative || ""),
      riskScore: Number(parsed.riskScore) || 0,
      relevanceScore: Number(parsed.relevanceScore) || 0,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch {
    return {
      strategicNarrative: "",
      riskScore: 100,
      relevanceScore: 0,
      flags: [`Fundraising Ministry returned output that couldn't be parsed as JSON: ${String(raw).slice(0, 200)}`],
    };
  }
}
