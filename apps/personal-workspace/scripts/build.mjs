// Inlines agents/registry.json + agents/*.md and the package version into src/template.html
// and writes ./index.html (the single deployable file). No dependencies.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const registry = JSON.parse(read('agents/registry.json'));
const agents = registry.map(({ prompt, ...def }) => {
  if (!prompt) throw new Error(`Agent ${def.id} has no prompt file`);
  return { ...def, system: read(`agents/${prompt}`).trim() };
});
const ids = new Set();
for (const a of agents) {
  if (ids.has(a.id)) throw new Error(`Duplicate agent id ${a.id}`);
  ids.add(a.id);
  const missing = (a.template.match(/{{(\w+)}}/g) || []).map((m) => m.slice(2, -2))
    .filter((k) => !a.fields.some((f) => f.key === k));
  if (missing.length) throw new Error(`Agent ${a.id}: template uses unknown fields ${missing}`);
}
const version = JSON.parse(read('package.json')).version;
// Escape "<" so prompt text can never close the inline <script> block.
const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

let html = read('src/template.html');
for (const [token, value] of [['"__AGENTS__"', safe(agents)], ['"__VERSION__"', safe(version)]]) {
  if (!html.includes(token)) throw new Error(`Token ${token} not found in template`);
  html = html.replace(token, () => value);
}
writeFileSync(join(root, 'index.html'), html);
// Static hosts (Vercel with Root Directory = apps/personal-workspace) run `npm run build` and then serve ./public.
// Only the one file is published there: docs, prompts and tests are not served. ./public is generated and git-ignored;
// the committed ./index.html stays the copy you can open straight from disk.
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'index.html'), html);
console.log(`Built index.html (${(html.length / 1024).toFixed(0)} KB, ${agents.length} agents, v${version})`);
