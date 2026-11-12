import {
  PRIVATE_WORKSPACE, proposeTasks, resolveDraftDestination, maySubmitToPortal,
  type WorkCandidate, type Deliverable,
} from "./privateWorkspacePolicy.ts";

function expect(ok: boolean, reason: string): void {
  if (!ok) throw new Error(reason);
}

const candidate: WorkCandidate = {
  source: "gmail", sourceId: "mail-123", workControlTaskId: "FR-01",
  title: "Draft reply to a partner", workflow: "email_draft", projectKey: "FR",
  sourceRefs: ["gmail://mail-123"], observedAt: "2026-11-12T10:00:00Z",
  importance: "high", explicitExclusion: false, authorisedScope: true,
  sensitivity: "internal",
};
const deliverable: Deliverable = {
  taskId: "FR-01", workflow: "project_proposal", projectKey: "FR",
  sourceVersion: "2026-11-12-v1", validation: "passed",
  formatVerified: true, sourceRefs: ["drive://source-1"],
};
const folders = [{ projectKey: "FR", folderId: "existing-drive-folder", authorised: true }];

Deno.test("fixed private preferences match the owner's decisions", () => {
  expect(PRIVATE_WORKSPACE.taskInitiation === "proactive", "proactive");
  expect(PRIVATE_WORKSPACE.reviewPolicy === "all", "review all");
  expect(PRIVATE_WORKSPACE.documentDestinations === "existing", "existing folders");
  expect(!JSON.stringify(PRIVATE_WORKSPACE.allowedEmailOperations).includes('"send"'), "no Gmail send");
});

Deno.test("proactive discovery proposes without executing", () => {
  const suggestions = proposeTasks([candidate], new Set());
  expect(suggestions.length === 1, "one suggestion");
  expect(suggestions[0].status === "proposed", "proposal only");
  expect(suggestions[0].humanReviewed === false, "not approved");
});

Deno.test("deduplicate by source and project, not title", () => {
  const candidates = [candidate, {...candidate, sourceId:"mail-456"}];
  expect(proposeTasks(candidates, new Set()).length === 2, "different email same title");
  expect(proposeTasks(candidates, new Set(["gmail:mail-123:FR"])).length === 1, "existing source");
});

Deno.test("skip excluded, unauthorised and restricted content", () => {
  const candidates = [
    {...candidate, explicitExclusion: true},
    {...candidate, sourceId:"2", authorisedScope:false},
    {...candidate, sourceId:"3", sensitivity:"restricted" as const},
  ];
  expect(proposeTasks(candidates, new Set()).length === 0, "excluded");
});

Deno.test("priority and deadline determine proposal order", () => {
  const low = {...candidate, sourceId:"low", importance:"low" as const};
  const urgent = {...candidate, sourceId:"urgent", dueAt:"2026-11-13T00:00:00Z"};
  expect(proposeTasks([low, urgent], new Set())[0].candidateKey.includes("urgent"), "priority ordering");
});

Deno.test("candidate limit is enforced including zero", () => {
  expect(proposeTasks([candidate], new Set(), 0).length === 0, "zero");
  expect(proposeTasks([candidate], new Set(), 1).length === 1, "one");
});

Deno.test("validated deliverables go to existing folder but require review", () => {
  const decision = resolveDraftDestination(deliverable, folders);
  expect(decision.status === "ready_for_review", "draft review");
  if (decision.status === "ready_for_review") {
    expect(decision.folderId === "existing-drive-folder", "existing destination");
    expect(decision.review === "required", "review mandatory");
  }
});

Deno.test("unknown or duplicate folder never falls back to root", () => {
  expect(resolveDraftDestination(deliverable, []).status === "blocked", "missing folder");
  expect(resolveDraftDestination(deliverable, [...folders, ...folders]).status === "blocked", "ambiguous folder");
});

Deno.test("unvalidated and source-less work is blocked", () => {
  expect(resolveDraftDestination({...deliverable,validation:"not_tested"}, folders).status === "blocked", "missing validation");
  expect(resolveDraftDestination({...deliverable,sourceRefs:[]}, folders).status === "blocked", "missing manifest");
});

Deno.test("review approval alone cannot submit a portal application", () => {
  expect(!maySubmitToPortal("approved", false, true), "no submission approval");
  expect(!maySubmitToPortal("approved", true, false), "stale submission payload");
  expect(!maySubmitToPortal("ready_for_review", true, true), "draft not reviewed");
  expect(maySubmitToPortal("approved", true, true), "explicit approval");
});
