// ADR-0010 §7 — fixed source-table → text-field mapping. This mapping
// lives in code, not caller-supplied, so a bad `source_table` value
// cannot cause the pipeline to embed the wrong column by mistake.
//
// If a new embedding-bearing table is added, this map, the RPC allowlist
// in migration 13_embedding_pipeline_support.sql, and the input contract
// in ADR-0010 §7 must all be updated together.

export type SourceTable =
  | "regulatory_clauses"
  | "knowledge_chunks"
  | "knowledge_documents"
  | "opportunities"
  | "memory_entries";

export const SOURCE_TABLES: SourceTable[] = [
  "regulatory_clauses",
  "knowledge_chunks",
  "knowledge_documents",
  "opportunities",
  "memory_entries",
];

// Columns the function must SELECT out of each source table to produce
// the text to embed. `join` describes how to combine them for the API
// input; `single` means the column IS the text.
type TextFieldSpec =
  | { kind: "single"; column: string }
  | { kind: "join"; columns: string[]; separator: string };

const TEXT_FIELD_BY_TABLE: Record<SourceTable, TextFieldSpec> = {
  regulatory_clauses: { kind: "single", column: "text" },
  knowledge_chunks: { kind: "single", column: "content" },
  knowledge_documents: { kind: "single", column: "content" },
  opportunities: { kind: "join", columns: ["title", "description"], separator: "\n" },
  memory_entries: { kind: "single", column: "content" },
};

export function selectColumnsFor(table: SourceTable): string {
  const spec = TEXT_FIELD_BY_TABLE[table];
  const cols = spec.kind === "single" ? [spec.column] : spec.columns;
  return ["id", ...cols].join(",");
}

// Returns the concatenated text to embed for one row, or null if all
// mapped columns are null/empty (ADR-0010 §9 step 2: skip and report as
// failed — nothing to embed).
export function buildTextForRow(
  table: SourceTable,
  row: Record<string, unknown>,
): string | null {
  const spec = TEXT_FIELD_BY_TABLE[table];
  if (spec.kind === "single") {
    const v = row[spec.column];
    return typeof v === "string" && v.trim().length > 0 ? v : null;
  }
  const parts = spec.columns
    .map((c) => (typeof row[c] === "string" ? (row[c] as string).trim() : ""))
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts.join(spec.separator) : null;
}
