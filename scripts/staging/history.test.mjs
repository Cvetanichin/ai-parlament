import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { planHistory } from "./history.mjs";

const hash = (algorithm, value) => createHash(algorithm).update(value).digest("hex");
const files = [1, 2].map((number) => ({ path: `supabase/migrations/2026010100000${number}_test_${number}.sql`, content: `select ${number};\n` }));
const source = { version: "20260201000001", name: "combined", statements: ["select 1;\nselect 2;"] };
const project = { ref: "reviewed-project", entries: [{ sourceVersion: source.version, sourceName: source.name, sourceStatementsMd5: hash("md5", source.statements.join("\n")), targets: files.map((file) => ({ file: file.path, sha256: hash("sha256", file.content) })) }] };

test("legacy group reconciliation preserves its receipt and never executes migration DDL", () => {
  const plan = planHistory(project, [source], files);
  assert.equal(plan.changed, 1);
  assert.deepEqual(plan.pending, []);
  assert.match(plan.sql, /lock table supabase_migrations.schema_migrations/);
  assert.match(plan.sql, /md5\(coalesce/);
  assert.doesNotMatch(plan.sql, /delete from|drop table/i);
  assert.match(plan.sql, /insert into supabase_migrations.schema_migrations/);
  assert.doesNotMatch(plan.sql, /^select 2;/m);
});
test("changed SQL, unknown history, and changed historical sources refuse repair", () => {
  assert.throws(() => planHistory(project, [{ ...source, statements: ["changed"] }], files), /changed history/);
  assert.throws(() => planHistory(project, [{ ...source, version: "20260202000001" }], files), /Unrecognized/);
  assert.throws(() => planHistory(project, [source], [{ ...files[0], content: "changed" }, files[1]]), /Historical source changed/);
});
test("canonical history is idempotent and missing versions stay pending", () => {
  const canonical = files.map((file, index) => ({ version: `2026010100000${index + 1}`, name: `test_${index + 1}`, statements: [index === 0 ? source.statements[0] : file.content] }));
  assert.equal(planHistory(project, canonical, files).changed, 0);
  assert.equal(planHistory(project, canonical.slice(0, 1), files).pending.length, 1);
});
