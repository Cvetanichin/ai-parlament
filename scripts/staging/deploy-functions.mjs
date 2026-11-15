import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const config = JSON.parse(readFileSync(resolve(root, "supabase/staging/project.json"), "utf8"));
const cli = process.env.SUPABASE_CLI || "supabase";
const run = (args, capture = false) => execFileSync(cli, args, { cwd: root, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
if (run(["--version"], true).trim().replace(/^v/, "") !== config.supabaseCliVersion) {
  throw new Error(`Install Supabase CLI ${config.supabaseCliVersion} before deploying staging.`);
}
run(["functions", "deploy", "--help"]);
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ project: config.stagingProjectRef, functions: config.functions, action: "dry-run; pass --apply to deploy these existing functions" }, null, 2));
} else {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("Set SUPABASE_ACCESS_TOKEN using your secret manager or environment settings.");
  for (const name of config.functions) run(["functions", "deploy", name, `--remote=${config.stagingProjectRef}`]);
}
