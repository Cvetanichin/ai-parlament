// Ministry of Writing — Narrative Engine (drafts the Annex A "shell").
// Ported from the real MVP's backend/agents/writingMinistry.js. On retry,
// receives the Vote of No Confidence error log — the "Error Log Injection"
// step: never "try again" blind, always handed the exact veto failure
// reasons (Parliament Core spec §2.3).

export interface WritingInput {
  brief: string;
  constraints: { characterLimit: number; requiredKeywords: string[] };
  errorLog?: string[] | null;
}

export function buildPrompt({ brief, constraints, errorLog }: WritingInput): string {
  let prompt = `You are the Ministry of Writing's Narrative Engine. Draft the Annex A narrative section for this project.\n\nProject brief:\n${brief}\n\nHard constraints:\n- Character limit: ${constraints.characterLimit}\n- Must explicitly address: ${constraints.requiredKeywords.join(", ")}\n`;
  if (errorLog && errorLog.length) {
    prompt += `\nThe previous draft was rejected by the Compliance veto engine for these specific reasons — fix all of them:\n`;
    errorLog.forEach((f) => (prompt += `- ${f}\n`));
  }
  return prompt;
}

// Deterministic fallback so the whole governance loop is demoable with zero
// external dependencies — mirrors the real MVP's mockDraft exactly.
export function mockDraft({ brief, constraints, errorLog }: WritingInput): string {
  const missingKeywords = errorLog
    ? errorLog.filter((f) => f.startsWith("missing_keyword:")).map((f) => f.replace("missing_keyword:", ""))
    : [];

  const keywordsToInclude = missingKeywords.length ? missingKeywords : constraints.requiredKeywords;

  let draft = `This project addresses ${brief}. `;
  draft += keywordsToInclude.map((k) => `Our approach directly incorporates ${k} throughout implementation.`).join(" ");
  draft += ` The consortium brings demonstrated capacity to deliver measurable results aligned with the call's objectives.`;

  if (draft.length > constraints.characterLimit) {
    draft = draft.slice(0, constraints.characterLimit - 1).trim() + "…";
  }
  return draft;
}
