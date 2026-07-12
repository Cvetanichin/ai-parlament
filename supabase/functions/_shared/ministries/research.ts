// Ministry of Research — feasibility studies + donor guideline cross-check.
// Ported from the real MVP's backend/agents/researchMinistry.js, unchanged
// in logic (Parliament Core spec §0: confirmed against real source — this
// is a re-platform, not a redesign). Output: the Go/No-Go Risk Matrix that
// informs (never replaces) the human at the Go/No-Go gate.

export interface ResearchInput {
  brief: string;
  donorGuidelines?: string;
  constraints: { characterLimit: number; requiredKeywords: string[] };
}

export interface ResearchResult {
  score: number;
  recommendation: "GO" | "CONDITIONAL" | "NO-GO";
  eligibilityFlags: string[];
  risks: string[];
}

export function buildPrompt({ brief, donorGuidelines, constraints }: ResearchInput): string {
  return `You are the Ministry of Research. Cross-check this project brief against the donor's guidelines and assess feasibility.

Project brief: ${brief}

Donor guidelines / eligibility text: ${donorGuidelines || "(none supplied)"}

Elements the donor requires: ${constraints.requiredKeywords.join(", ") || "(none specified)"}

Return ONLY valid JSON, no prose, in this exact shape:
{"score": <integer 0-100>, "recommendation": "GO" | "CONDITIONAL" | "NO-GO", "eligibilityFlags": [string, ...], "risks": [string, ...]}`;
}

// Deterministic fallback so the Go/No-Go Risk Matrix is demoable without any
// API key. Mirrors what the veto engine checks later (required elements
// present, brief substantive enough) so Research catches the same class of
// problem earlier and cheaper than Writing + the veto loop would.
export function mockRun({ brief, donorGuidelines, constraints }: ResearchInput): string {
  const briefLower = (brief || "").toLowerCase();
  const flags: string[] = [];
  const risks: string[] = [];
  let score = 78;

  (constraints.requiredKeywords || []).forEach((keyword) => {
    if (!briefLower.includes(keyword.toLowerCase())) {
      flags.push(`Brief does not yet address a required donor element: "${keyword}"`);
      score -= 12;
    }
  });

  if (!donorGuidelines || donorGuidelines.trim().length < 20) {
    risks.push("No donor guideline text supplied — eligibility cross-check is unverified, treat this score as provisional.");
    score -= 15;
  }

  if (briefLower.length < 40) {
    risks.push("Brief is very thin — feasibility cannot be assessed with real confidence yet.");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 65 ? "GO" : score >= 40 ? "CONDITIONAL" : "NO-GO";

  return JSON.stringify({ score, recommendation, eligibilityFlags: flags, risks });
}

export function parseResponse(raw: string): ResearchResult {
  try {
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      recommendation: parsed.recommendation || "NO-GO",
      eligibilityFlags: parsed.eligibilityFlags || [],
      risks: parsed.risks || [],
    };
  } catch {
    return {
      score: 0,
      recommendation: "NO-GO",
      eligibilityFlags: [],
      risks: [`Research Ministry returned output that couldn't be parsed as JSON: ${String(raw).slice(0, 200)}`],
    };
  }
}
