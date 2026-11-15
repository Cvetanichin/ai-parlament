/**
 * Cvetanichin private workspace preferences and candidate intake.
 * Pure, deterministic functions. No connectors, AI calls or database writes.
 * All documents produced by agents remain DRAFT until explicitly reviewed.
 */
export const PRIVATE_WORKSPACE = {
  taskInitiation: "proactive",
  reviewPolicy: "all",
  documentDestinations: "existing",
  primaryTaskRegister: "1R99hYDp26u0D8xifECRTxfulzrFkhwZNIL0BylTCfEk",
  taskSheet: "Tasks",
  taskIdColumn: "A",
  // Existing spreadsheet synchronisation remains source -> sheet only.
  syncDirection: "sources_to_sheet",
  allowedEmailOperations: ["read", "create_draft", "update_draft"],
} as const;

export type ProductionWorkflow =
  | "email_draft" | "project_proposal" | "research"
  | "data_analysis" | "report" | "me_framework"
  | "product_mvp" | "prompt_engineering";

export type ReviewState =
  | "not_tested" | "validation_failed" | "ready_for_review"
  | "reviewed_changes_requested" | "approved";

export type DiscoverySource = "work_control" | "gmail" | "calendar" | "drive" | "github";

export interface WorkCandidate {
  source: DiscoverySource;
  sourceId: string;
  workControlTaskId?: string;
  title: string;
  workflow: ProductionWorkflow;
  projectKey: string;
  sourceRefs: string[];
  observedAt: string;
  dueAt?: string | null;
  importance: "high" | "normal" | "low";
  explicitExclusion: boolean;
  authorisedScope: boolean;
  sensitivity: "public" | "internal" | "confidential" | "restricted";
}

export interface SuggestedTask {
  candidateKey: string;
  taskId: string | null;
  title: string;
  workflow: ProductionWorkflow;
  sourceRefs: string[];
  reason: string;
  status: "proposed";
  humanReviewed: false;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasSourceRefs(refs: unknown): boolean {
  return Array.isArray(refs) && refs.length > 0 && refs.every(hasText);
}

export function candidateKey(c: WorkCandidate): string {
  // Never deduplicate merely by title: distinct projects often share titles.
  return [c.source, c.sourceId, c.projectKey].join(":");
}

/**
 * Generates bounded task proposals only. Ingested emails and documents
 * must be treated as untrusted evidence, never executable commands.
 * Caller must scope connector fetches before creating candidates.
 */
export function proposeTasks(
  candidates: WorkCandidate[],
  existingCandidateKeys: ReadonlySet<string>,
  maxResults = 10,
): SuggestedTask[] {
  if (!Number.isInteger(maxResults) || maxResults < 0 || maxResults > 100) {
    throw new Error("invalid task proposal limit");
  }
  if (maxResults === 0) return [];
  const seen = new Set<string>(existingCandidateKeys);
  const permitted = candidates.filter(c =>
    c.explicitExclusion === false &&
    c.authorisedScope === true &&
    hasText(c.sourceId) &&
    hasText(c.projectKey) &&
    hasSourceRefs(c.sourceRefs) &&
    // Restricted material must first be handled through a separate
    // explicit data-handling decision, not automatic LLM processing.
    c.sensitivity !== "restricted"
  );
  permitted.sort((a, b) =>
    rank(a.importance) - rank(b.importance) ||
    (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
    a.observedAt.localeCompare(b.observedAt)
  );
  const result: SuggestedTask[] = [];
  for (const c of permitted) {
    const key = candidateKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      candidateKey: key,
      taskId: c.workControlTaskId ?? null,
      title: c.title,
      workflow: c.workflow,
      sourceRefs: c.sourceRefs,
      reason: `Source: ${c.source}; priority: ${c.importance}; task identification is proposed, not approved`,
      status: "proposed",
      humanReviewed: false,
    });
    if (result.length === maxResults) break;
  }
  return result;
}

function rank(priority: WorkCandidate["importance"]): number {
  return priority === "high" ? 0 : priority === "normal" ? 1 : 2;
}

export interface Deliverable {
  taskId: string;
  workflow: ProductionWorkflow;
  projectKey: string;
  sourceVersion: string;
  validation: "not_tested" | "failed" | "passed";
  formatVerified: boolean;
  sourceRefs: string[];
}

export interface DestinationMapEntry {
  projectKey: string;
  folderId: string;
  authorised: boolean;
}

export type DeliveryDecision =
  | { status: "blocked"; reason: string }
  | { status: "ready_for_review"; folderId: string; review: "required" };

export function resolveDraftDestination(
  deliverable: Deliverable,
  destinations: readonly DestinationMapEntry[],
): DeliveryDecision {
  if (deliverable.validation !== "passed" || deliverable.formatVerified !== true) {
    return { status: "blocked", reason: "independent validation and formatting check required" };
  }
  if (!hasSourceRefs(deliverable.sourceRefs) || !hasText(deliverable.sourceVersion) ||
      !hasText(deliverable.taskId) || !hasText(deliverable.projectKey)) {
    return { status: "blocked", reason: "missing source manifest or task reference" };
  }
  const matches = destinations.filter(d =>
    d.projectKey === deliverable.projectKey && d.authorised === true);
  if (matches.length !== 1) {
    return { status: "blocked", reason: "existing project destination is missing or ambiguous" };
  }
  const folderId = matches[0].folderId;
  if (!hasText(folderId) || folderId !== folderId.trim() || folderId === "root") {
    return { status: "blocked", reason: "explicit project folder ID required" };
  }
  // The result is always a draft for human review, never a final approval.
  return { status: "ready_for_review", folderId, review: "required" };
}

/** External submission is not implied by review approval. */
export function maySubmitToPortal(
  review: ReviewState,
  explicitSubmissionApproval: boolean,
  submissionPayloadVersionMatches: boolean,
): boolean {
  return review === "approved" && explicitSubmissionApproval && submissionPayloadVersionMatches;
}
