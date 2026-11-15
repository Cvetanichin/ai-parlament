import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const hash = (algorithm, value) => createHash(algorithm).update(value).digest("hex");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statementHash = (row) => hash("md5", (row.statements ?? []).join("\n"));

export function planHistory(project, rows, files) {
  if (!Array.isArray(rows)) throw new Error("History export must be an array of version/name/statements rows.");
  const legacy = new Map(project.entries.map((entry) => [entry.sourceVersion, entry]));
  const canonical = new Map();
  for (const file of files) {
    const match = /^(\d{14})_(.+)\.sql$/.exec(file.path.split("/").at(-1));
    if (!match) throw new Error(`Invalid migration filename: ${file.path}`);
    if (canonical.has(match[1])) throw new Error(`Duplicate migration version: ${match[1]}`);
    canonical.set(match[1], { ...file, version: match[1], name: match[2], hashes: new Set([hash("md5", file.content)]) });
  }
  for (const entry of project.entries) {
    entry.targets.forEach((target, index) => {
      const file = files.find((candidate) => candidate.path === target.file);
      if (!file || hash("sha256", file.content) !== target.sha256) throw new Error(`Historical source changed: ${target.file}`);
      if (index === 0) canonical.get(file.path.split("/").at(-1).slice(0, 14)).hashes.add(entry.sourceStatementsMd5);
    });
  }
  const seen = new Set();
  const covered = new Set();
  const changes = [];
  for (const row of rows) {
    if (seen.has(row.version)) throw new Error(`Duplicate history version: ${row.version}`);
    seen.add(row.version);
    const actual = statementHash(row);
    const current = canonical.get(row.version);
    if (current && current.name === row.name && current.hashes.has(actual)) {
      covered.add(row.version);
      continue;
    }
    const entry = legacy.get(row.version);
    if (!entry || row.name !== entry.sourceName || actual !== entry.sourceStatementsMd5) {
      throw new Error(`Unrecognized or changed history row: ${row.version}. Inspect it; do not mark it applied.`);
    }
    const targets = entry.targets.map((target) => canonical.get(target.file.split("/").at(-1).slice(0, 14)));
    for (const target of targets) {
      if (covered.has(target.version)) throw new Error(`Overlapping legacy mappings: ${target.version}`);
      covered.add(target.version);
    }
    changes.push({ row, targets });
  }
  for (const change of changes) {
    for (const target of change.targets) {
      if (seen.has(target.version) && target.version !== change.row.version) throw new Error(`Target version already exists: ${target.version}`);
    }
  }
  const checks = rows.map((row) =>
    `if not exists (select 1 from supabase_migrations.schema_migrations where version=${literal(row.version)} and name=${literal(row.name)} and md5(coalesce(array_to_string(statements,E'\\n'),''))=${literal(statementHash(row))}) then raise exception 'History changed since export at version ${row.version}'; end if;`);
  const sql = [
    `-- Metadata-only reconciliation for ${project.ref}. No migration SQL is executed.`,
    "begin;",
    "select pg_advisory_xact_lock(hashtext('ai-parlament-migration-history'));",
    "lock table supabase_migrations.schema_migrations in access exclusive mode;",
    `do $guard$ begin if (select count(*) from supabase_migrations.schema_migrations) <> ${rows.length} then raise exception 'History row count changed since export'; end if;`,
    ...checks,
    "end $guard$;",
  ];
  // Move every changed key aside before assigning canonical versions. The
  // original row retains statements, created_by, idempotency_key and rollback.
  for (const { row } of changes) sql.push(`update supabase_migrations.schema_migrations set version=${literal(`legacy_reconcile_${row.version}`)} where version=${literal(row.version)};`);
  for (const { row, targets } of changes) {
    sql.push(`update supabase_migrations.schema_migrations set version=${literal(targets[0].version)},name=${literal(targets[0].name)} where version=${literal(`legacy_reconcile_${row.version}`)};`);
    // Staging originally applied 21–24 as one transaction. Keep the original
    // combined SQL on the first receipt and record the other applied versions.
    for (const target of targets.slice(1)) sql.push(`insert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(target.version)},${literal(target.name)},array[${literal(target.content)}]);`);
  }
  sql.push("commit;");
  return { sql: sql.join("\n") + "\n", changed: changes.length, pending: [...canonical.keys()].filter((version) => !covered.has(version)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  if (!args.includes("--project") || !args.includes("--history") || !args.includes("--out")) {
    throw new Error("Usage: node scripts/staging/history.mjs --project REF --history export.json --out repair.sql");
  }
  const manifest = JSON.parse(readFileSync(resolve(root, "supabase/staging/history-map.json"), "utf8"));
  const project = manifest.projects.find((candidate) => candidate.ref === option("--project"));
  if (!project) throw new Error("Project is not in the reviewed history map.");
  const files = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort().map((name) => {
    const path = `supabase/migrations/${name}`;
    return { path, content: readFileSync(resolve(root, path), "utf8") };
  });
  const exported = JSON.parse(readFileSync(resolve(option("--history")), "utf8"));
  const plan = planHistory(project, exported.rows ?? exported, files);
  writeFileSync(resolve(option("--out")), plan.sql, { mode: 0o600 });
  console.log(JSON.stringify({ project: project.ref, changedHistoryRows: plan.changed, pendingVersions: plan.pending, output: relative(process.cwd(), resolve(option("--out"))) }));
}
