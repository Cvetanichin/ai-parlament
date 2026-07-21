// Veto Engine regression suite (Testing spec §1.1/§1.2 — highest priority
// in the test pyramid: deterministic/lexical branch coverage plus the two
// named golden-file cases for the semantic tier's mock fallback). Every
// case here is pure — no Supabase client, no network — matching the
// deterministic/lexical tiers' own "zero-hallucination, plain code"
// design and mockSemanticRun's role as runVeto's offline fallback.
import { assertEquals } from "jsr:@std/assert@1";
import { deterministicCheck, lexicalCheck, mockSemanticRun } from "./vetoEngine.ts";

const CONSTRAINTS = { characterLimit: 100, requiredKeywords: ["visibility", "gender"] };

Deno.test("deterministicCheck — empty draft fails", () => {
  const result = deterministicCheck("", CONSTRAINTS);
  assertEquals(result.pass, false);
  assertEquals(result.failures, ["deterministic: draft is empty"]);
});

Deno.test("deterministicCheck — whitespace-only draft fails (trim, not just length)", () => {
  const result = deterministicCheck("   \n  ", CONSTRAINTS);
  assertEquals(result.pass, false);
  assertEquals(result.failures.includes("deterministic: draft is empty"), true);
});

Deno.test("deterministicCheck — over character limit fails with exact message", () => {
  const draft = "x".repeat(150);
  const result = deterministicCheck(draft, CONSTRAINTS);
  assertEquals(result.pass, false);
  assertEquals(result.failures, ["deterministic: draft is 150 characters, exceeds the 100-character limit"]);
});

Deno.test("deterministicCheck — empty AND over limit reports both failures", () => {
  // Can't be literally empty and over a positive limit at once, but a
  // negative characterLimit (a Workflow Definition misconfiguration, not
  // a caller bug this function should silently tolerate) exercises both
  // branches on one non-empty draft — this is exactly the kind of edge
  // case 100% branch coverage (spec §1.1) is meant to catch.
  const result = deterministicCheck("a real draft", { characterLimit: -1, requiredKeywords: [] });
  assertEquals(result.pass, false);
  assertEquals(result.failures.length, 1);
  assertEquals(result.failures[0].startsWith("deterministic: draft is 12 characters"), true);
});

Deno.test("deterministicCheck — within limit and non-empty passes", () => {
  const result = deterministicCheck("a real draft", CONSTRAINTS);
  assertEquals(result, { pass: true, failures: [] });
});

Deno.test("lexicalCheck — missing keyword fails with missing_keyword: prefix", () => {
  const result = lexicalCheck("This addresses gender equity only.", CONSTRAINTS);
  assertEquals(result.pass, false);
  assertEquals(result.failures, ["missing_keyword:visibility"]);
});

Deno.test("lexicalCheck — all keywords present, case-insensitive, passes", () => {
  const result = lexicalCheck("VISIBILITY materials will address Gender equality.", CONSTRAINTS);
  assertEquals(result, { pass: true, failures: [] });
});

Deno.test("lexicalCheck — no required keywords always passes", () => {
  const result = lexicalCheck("anything at all", { characterLimit: 100, requiredKeywords: [] });
  assertEquals(result, { pass: true, failures: [] });
});

// Golden-file case 1 (Testing spec §1.2, verbatim against vetoEngine.ts):
// a draft under 40 characters is "too thin" regardless of content.
Deno.test("mockSemanticRun — golden file: draft under 40 chars fails as too thin", () => {
  const verdict = mockSemanticRun({ draft: "Too short." });
  assertEquals(verdict, "FAIL: draft is too thin to credibly address the brief");
});

// Golden-file case 2: a draft >= 40 chars that ends (after trim) with the
// mock writer's own truncation marker "…" fails as truncated mid-sentence.
Deno.test("mockSemanticRun — golden file: draft truncated mid-sentence fails", () => {
  const draft = "This project addresses the brief in full detail and then stops mid…";
  const verdict = mockSemanticRun({ draft });
  assertEquals(verdict, "FAIL: draft was truncated mid-sentence and reads as incomplete");
});

Deno.test("mockSemanticRun — thin-check takes precedence over truncation check", () => {
  // Under 40 chars AND ends with "…" — the too-thin branch must win
  // (it's checked first in the source), not the truncation branch.
  const verdict = mockSemanticRun({ draft: "Too short…" });
  assertEquals(verdict, "FAIL: draft is too thin to credibly address the brief");
});

Deno.test("mockSemanticRun — trailing whitespace after the truncation marker still fails as truncated", () => {
  const draft = "This project addresses the brief in full detail and then stops mid…   ";
  const verdict = mockSemanticRun({ draft });
  assertEquals(verdict, "FAIL: draft was truncated mid-sentence and reads as incomplete");
});

Deno.test("mockSemanticRun — substantive, non-truncated draft passes", () => {
  const draft = "This project directly addresses visibility and gender requirements with a complete narrative.";
  const verdict = mockSemanticRun({ draft });
  assertEquals(verdict, "PASS");
});
