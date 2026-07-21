// Workflow Engine — gate-sequencing and Compliance Override regression
// (Testing spec §1.3). This is the safety-critical logic EAS §9's
// Liability NFR depends on ("no fully autonomous submission path exists
// anywhere in the platform"), so it's tested against `decideGate` itself,
// not reimplemented as a parallel assertion of the same rules.
//
// `decideGate` takes a real SupabaseClient — every other Edge Function in
// this codebase exercises it against the actual local Postgres instance
// (see supabase/README.md's live-HTTP verification runs). A true
// integration test needs that running stack, which this environment's
// automated `deno test` run cannot assume. This file instead uses a small,
// purpose-built in-memory fake scoped exactly to the query shapes
// `decideGate`'s own call graph uses (checked directly against
// workflowEngine.ts: `.from(table).select(...).eq(...).in(...).order(...)
// .limit(...).maybeSingle()/.single()`, plus bare `.insert()`/`.update()`)
// — not a generic PostgREST reimplementation, and not a substitute for
// also running the real HTTP flow against a live local stack before
// trusting this in production (the manual verification already done this
// session, per the session's own tool transcript, is the integration
// coverage; this file is the fast, deterministic regression layer on top).
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { decideGate } from "./workflowEngine.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function makeFakeSupabase(seed: { workflow_instances: Row[]; audit_events: Row[]; workflow_instance_history: Row[] }) {
  const tables: Record<string, Row[]> = {
    workflow_instances: seed.workflow_instances,
    audit_events: seed.audit_events,
    workflow_instance_history: seed.workflow_instance_history,
  };

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let op: "select" | "insert" | "update" = "select";
    // deno-lint-ignore no-explicit-any
    let payload: any = null;

    function materialize(): Row[] {
      let rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => (orderAsc ? 1 : -1) * (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0));
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return rows;
    }

    function run() {
      if (op === "insert") {
        const row = { id: crypto.randomUUID(), ...payload };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      if (op === "update") {
        const updated: Row[] = [];
        tables[table] = tables[table].map((r) => {
          if (filters.every((f) => f(r))) {
            const next = { ...r, ...payload };
            updated.push(next);
            return next;
          }
          return r;
        });
        return { data: updated, error: null };
      }
      return { data: materialize(), error: null };
    }

    // deno-lint-ignore no-explicit-any
    const b: any = {
      select() {
        return b;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return b;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return b;
      },
      limit(n: number) {
        limitN = n;
        return b;
      },
      insert(row: Row) {
        op = "insert";
        payload = row;
        return b;
      },
      update(row: Row) {
        op = "update";
        payload = row;
        return b;
      },
      async maybeSingle() {
        const { data, error } = await run();
        return { data: data[0] ?? null, error };
      },
      async single() {
        const { data, error } = await run();
        if (!data[0]) return { data: null, error: { message: "no rows returned" } };
        return { data: data[0], error };
      },
      then(onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(onResolve, onReject);
      },
    };
    return b;
  }

  // deno-lint-ignore no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

function baseSeed(instanceState: string) {
  return {
    workflow_instances: [{ id: "inst-1", state: instanceState }],
    audit_events: [] as Row[],
    workflow_instance_history: [] as Row[],
  };
}

Deno.test("decideGate — rejects when instance is not awaiting_human", async () => {
  const supabase = makeFakeSupabase(baseSeed("running"));
  await assertRejects(
    () => decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "go_no_go", decision: "approved" }),
    Error,
    "gate_precondition_unmet",
  );
});

Deno.test("decideGate — rejects an out-of-order gate (submission called before go_no_go)", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "GO" } }, created_at: "2026-01-01T00:00:00Z" });
  const supabase = makeFakeSupabase(seed);
  await assertRejects(
    () => decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "submission", decision: "approved" }),
    Error,
    "gate_precondition_unmet",
  );
});

Deno.test("decideGate — go_no_go approval requires overrideJustification when research recommended NO-GO", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "NO-GO" } }, created_at: "2026-01-01T00:00:00Z" });
  const supabase = makeFakeSupabase(seed);
  await assertRejects(
    () => decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "go_no_go", decision: "approved" }),
    Error,
    "override_justification_required",
  );
});

Deno.test("decideGate — go_no_go approval with justification overrides a NO-GO recommendation and moves to running", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "NO-GO" } }, created_at: "2026-01-01T00:00:00Z" });
  const supabase = makeFakeSupabase(seed);
  const result = await decideGate({
    supabase,
    instanceId: "inst-1",
    organisationId: "org-1",
    gateType: "go_no_go",
    decision: "approved",
    overrideJustification: "Donor confirmed extended eligibility window verbally; proceeding on that basis.",
  });
  assertEquals(result.state, "running");
  assertEquals(result.wasOverride, true);
});

Deno.test("decideGate — go_no_go approval with a GO recommendation needs no justification", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "GO" } }, created_at: "2026-01-01T00:00:00Z" });
  const supabase = makeFakeSupabase(seed);
  const result = await decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "go_no_go", decision: "approved" });
  assertEquals(result.state, "running");
  assertEquals(result.wasOverride, false);
});

Deno.test("decideGate — polish approval after a Vote of No Confidence escalation requires justification, and is not terminal", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "veto_result", detail: {}, created_at: "2026-01-01T00:00:00Z" });
  seed.workflow_instance_history.push({ workflow_instance_id: "inst-1", state: "escalated" });
  const supabase = makeFakeSupabase(seed);

  await assertRejects(
    () => decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "polish", decision: "approved" }),
    Error,
    "override_justification_required",
  );

  const result = await decideGate({
    supabase,
    instanceId: "inst-1",
    organisationId: "org-1",
    gateType: "polish",
    decision: "approved",
    overrideJustification: "Reviewed the escalated draft manually; content is acceptable despite the exhausted Vote of No Confidence threshold.",
  });
  assertEquals(result.state, "awaiting_human");
  assertEquals(result.wasOverride, true);
});

Deno.test("decideGate — submission approval is the only path that reaches completed", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push(
    { target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "GO" } }, created_at: "2026-01-01T00:00:00Z" },
    { target_id: "inst-1", action: "veto_result", detail: {}, created_at: "2026-01-01T00:01:00Z" },
    { target_id: "inst-1", action: "gate_decision", detail: { gateType: "polish", decision: "approved", wasOverride: false }, created_at: "2026-01-01T00:02:00Z" },
  );
  const supabase = makeFakeSupabase(seed);
  const result = await decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "submission", decision: "approved" });
  assertEquals(result.state, "completed");
  assertEquals(result.wasOverride, false);
});

Deno.test("decideGate — submission approval requires justification when an earlier gate in this instance was itself an override", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push(
    { target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "NO-GO" } }, created_at: "2026-01-01T00:00:00Z" },
    { target_id: "inst-1", action: "veto_result", detail: {}, created_at: "2026-01-01T00:01:00Z" },
    { target_id: "inst-1", action: "gate_decision", detail: { gateType: "go_no_go", decision: "approved", wasOverride: true, overrideReason: "research_recommended_no_go" }, created_at: "2026-01-01T00:00:30Z" },
    { target_id: "inst-1", action: "gate_decision", detail: { gateType: "polish", decision: "approved", wasOverride: false }, created_at: "2026-01-01T00:02:00Z" },
  );
  const supabase = makeFakeSupabase(seed);
  await assertRejects(
    () => decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "submission", decision: "approved" }),
    Error,
    "override_justification_required",
  );
});

Deno.test("decideGate — a rejected decision always moves to failed, regardless of gate type", async () => {
  const seed = baseSeed("awaiting_human");
  seed.audit_events.push({ target_id: "inst-1", action: "feasibility_assessment", detail: { output: { recommendation: "GO" } }, created_at: "2026-01-01T00:00:00Z" });
  const supabase = makeFakeSupabase(seed);
  const result = await decideGate({ supabase, instanceId: "inst-1", organisationId: "org-1", gateType: "go_no_go", decision: "rejected", note: "Not viable." });
  assertEquals(result.state, "failed");
});
