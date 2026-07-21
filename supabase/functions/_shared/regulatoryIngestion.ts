// Regulatory Knowledge Layer ingestion pipeline (spec §4: "parser, chunker,
// rule extractor, embeddings"). Pure functions, no I/O — operates only on
// text the caller supplies (a real PRAG/Annex/Standard Grant Contract
// document, or organisational policy text). Deliberately produces NO
// regulatory content of its own: every function here transforms input text
// into structured rows, it never invents clause text, rule names, or
// citations. This is what makes it safe to run against real source text
// without violating Grant Studio §3's "never freeform text asserting a
// rule exists" principle — the output is always a verbatim excerpt of the
// input, tagged with a heuristic classification a human must confirm
// (review_status is never anything but 'needs_human_review' here).
//
// eligibilityEngine.ts's header comment explains why regulatory_clauses/
// compliance_findings are real, live, empty tables: no real source text
// exists anywhere in this repo (PRAG_2025_full_version_en.md and the
// Standard Grant Contract annexes named in the spec were read in a
// separate authoring session, never committed here). This module makes
// the tables population-ready — calling regulatory-document-ingest-run
// with real source text is what actually populates them; nothing here
// seeds them with placeholder content.

export interface ParsedSection {
  section: string | null;
  text: string;
}

// Splits raw document text into sections on common legal/regulatory
// heading patterns (Article N, Annex X, §N, numbered headings). Falls back
// to one section (heading null) if no heading pattern matches — still
// usable by chunkClauses below, just without a section label.
const HEADING_PATTERN = /^\s*(Article\s+\d+[.:]?.*|Annex\s+[A-Z0-9]+[.:]?.*|§\s*\d+(\.\d+)*[.:]?.*|\d+(\.\d+)*\.\s+.+)$/im;

export function parseRegulatoryDocument(rawText: string): ParsedSection[] {
  const lines = rawText.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) sections.push({ section: currentHeading, text });
    currentLines = [];
  };

  for (const line of lines) {
    if (HEADING_PATTERN.test(line.trim())) {
      flush();
      currentHeading = line.trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections.length > 0 ? sections : [{ section: null, text: rawText.trim() }];
}

export interface Clause {
  section: string | null;
  text: string;
}

// Splits each section into clause-sized chunks on blank-line paragraph
// boundaries, merging short paragraphs forward so a clause is never a
// single orphaned sentence fragment. maxChunkChars is a soft cap — a
// single paragraph longer than the cap is kept whole rather than split
// mid-sentence (matches this codebase's "never truncate mid-sentence"
// convention, e.g. writing.ts's mockDraft).
export function chunkClauses(sections: ParsedSection[], maxChunkChars = 1200): Clause[] {
  const clauses: Clause[] = [];

  for (const { section, text } of sections) {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    let buffer = "";

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (candidate.length > maxChunkChars && buffer) {
        clauses.push({ section, text: buffer });
        buffer = paragraph;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) clauses.push({ section, text: buffer });
  }

  return clauses;
}

export type ObligationType = "mandatory" | "recommended" | "prohibited" | "context_dependent";

export interface RuleCandidate {
  obligationType: ObligationType;
  extractionConfidence: number;
}

// Deterministic keyword heuristic — no LLM, no fabrication, matching
// vetoEngine.ts's deterministic/lexical tiers' rationale. Classifies a
// clause's obligation strength from its own literal wording only.
// extraction_confidence uses the platform-wide 0.6 default (Regulatory
// Knowledge Layer spec's decided threshold) as the baseline, nudged up
// for an unambiguous single-keyword match and down when both
// obligation-direction keywords appear in the same clause (genuinely
// ambiguous wording, not a classification bug).
const PROHIBITED_PATTERN = /\b(shall not|must not|is prohibited|are prohibited|may not)\b/i;
const MANDATORY_PATTERN = /\b(shall|must|is required to|are required to)\b/i;
const RECOMMENDED_PATTERN = /\b(should|is recommended|are recommended|may)\b/i;

export function extractRuleCandidate(clauseText: string): RuleCandidate {
  const isProhibited = PROHIBITED_PATTERN.test(clauseText);
  const isMandatory = MANDATORY_PATTERN.test(clauseText);
  const isRecommended = RECOMMENDED_PATTERN.test(clauseText);

  const matchCount = [isProhibited, isMandatory, isRecommended].filter(Boolean).length;

  if (isProhibited) return { obligationType: "prohibited", extractionConfidence: matchCount > 1 ? 0.5 : 0.7 };
  if (isMandatory) return { obligationType: "mandatory", extractionConfidence: matchCount > 1 ? 0.5 : 0.7 };
  if (isRecommended) return { obligationType: "recommended", extractionConfidence: matchCount > 1 ? 0.5 : 0.65 };
  return { obligationType: "context_dependent", extractionConfidence: 0.6 };
}
