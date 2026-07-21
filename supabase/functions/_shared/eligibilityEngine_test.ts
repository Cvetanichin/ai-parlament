// Eligibility Engine — deterministic rollup branch coverage (Testing spec
// §1.1, highest priority: "deterministic Compliance Engine validators,
// 100% branch coverage, ships first, no exceptions"). Pure — no Supabase
// client. `runEligibilityCheck` itself (the DB-touching wrapper) is not
// tested here; only `rollupCategory`, the actual branch logic the spec's
// coverage requirement is about.
import { assertEquals } from "jsr:@std/assert@1";
import { rollupCategory } from "./eligibilityEngine.ts";

Deno.test("rollupCategory — zero findings returns context_dependent (conservative-by-default)", () => {
  const result = rollupCategory([]);
  assertEquals(result, { status: "context_dependent", riskFlags: [] });
});

Deno.test("rollupCategory — all findings pass returns pass with no risk flags", () => {
  const result = rollupCategory([
    { rule: "R1", source: "PRAG §1", severity: "mandatory", status: "pass" },
    { rule: "R2", source: "PRAG §2", severity: "recommended", status: "pass" },
  ]);
  assertEquals(result, { status: "pass", riskFlags: [] });
});

Deno.test("rollupCategory — a mandatory fail forces fail regardless of other findings", () => {
  const result = rollupCategory([
    { rule: "R1", source: "PRAG §1", severity: "mandatory", status: "fail" },
    { rule: "R2", source: "PRAG §2", severity: "recommended", status: "pass" },
  ]);
  assertEquals(result.status, "fail");
  assertEquals(result.riskFlags, ["R1 (PRAG §1) — fail"]);
});

Deno.test("rollupCategory — a recommended-severity fail degrades to warning, not fail", () => {
  const result = rollupCategory([{ rule: "R1", source: "PRAG §1", severity: "recommended", status: "fail" }]);
  assertEquals(result.status, "warning");
  assertEquals(result.riskFlags, ["R1 (PRAG §1) — fail"]);
});

Deno.test("rollupCategory — a non-fail, non-pass status (warning/context_dependent/needs_review) degrades to warning", () => {
  const result = rollupCategory([{ rule: "R1", source: "PRAG §1", severity: "mandatory", status: "needs_review" }]);
  assertEquals(result.status, "warning");
  assertEquals(result.riskFlags, ["R1 (PRAG §1) — needs_review"]);
});

Deno.test("rollupCategory — mixed pass and non-pass includes only non-pass rows in riskFlags", () => {
  const result = rollupCategory([
    { rule: "R1", source: "PRAG §1", severity: "recommended", status: "pass" },
    { rule: "R2", source: "PRAG §2", severity: "recommended", status: "warning" },
  ]);
  assertEquals(result.status, "warning");
  assertEquals(result.riskFlags, ["R2 (PRAG §2) — warning"]);
});

Deno.test("rollupCategory — a mandatory fail alongside other non-pass findings still reports every non-pass rule", () => {
  const result = rollupCategory([
    { rule: "R1", source: "PRAG §1", severity: "mandatory", status: "fail" },
    { rule: "R2", source: "PRAG §2", severity: "recommended", status: "warning" },
  ]);
  assertEquals(result.status, "fail");
  assertEquals(result.riskFlags, ["R1 (PRAG §1) — fail", "R2 (PRAG §2) — warning"]);
});
