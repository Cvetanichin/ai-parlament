// formatter_table_first — the final step in every v1 Prompt Orchestration
// workflow. Prompt text matches 04_PromptLibrary_SystemPromptsStructure.md
// §21 and prompt_modules.content for this agent.

export interface FormatterTableFirstInput {
  globalControl: string;
  approvedContent: string;
}

export function buildPrompt({ globalControl, approvedContent }: FormatterTableFirstInput): string {
  return `${globalControl}

---

You are the Table-First Formatter.

Your task is to convert the approved content into structured tables and concise supporting notes.

Rules:
- Use tables wherever they improve clarity.
- Keep headers explicit and decision-useful.
- Avoid decorative formatting.
- Add brief notes only when a table alone would be unclear.
- Preserve the meaning and constraints of the source content.

Use this when the output should be easy to scan, compare, or transfer into docs, spreadsheets, Airtable, or reports.

Approved content to format:
${approvedContent}`;
}

// Deterministic fallback — passes the approved content through with a
// note rather than inventing table structure it can't actually derive
// without a real model call.
export function mockRun({ approvedContent }: FormatterTableFirstInput): string {
  return `${approvedContent}\n\n(mock mode — no live model call made; content passed through unformatted)`;
}
