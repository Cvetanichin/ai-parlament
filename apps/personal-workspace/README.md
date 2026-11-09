# Personal Workspace

A local-first workspace for managing personal and professional tasks, projects and deadlines, with four prompt-defined AI agents. One HTML file, no runtime dependencies, no backend required. Data stays in your browser unless you turn on optional sync to your own Supabase project.

## Quick start

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari), or host it on any static host.
2. Follow the Getting Started checklist on the Dashboard, or open the Guide.
3. Optional: add an Anthropic API key in Settings to run agents inside the workspace. Without one, every agent offers a **Prompt Pack** (system prompt plus message) to paste into Claude.

## What is included

| # | Requirement | Where | Status |
|---|---|---|---|
| 1 | Dashboard, notifications, reminders | Dashboard, Settings | Built. Reminders fire only while the page is open; calendar alarms cover the closed case |
| 2 | Creative writing agent | AI agents | Built (prompt: `agents/writer.md`) |
| 3 | Research and analysis agent | AI agents | Built. Cannot browse; works from sources you paste |
| 4 | Project drafting agent | AI agents | Built. Imports tasks in one click |
| 5 | Deadline tracking agent | AI agents, Dashboard | Built. Local triage works offline; AI proposals need your approval |
| 6 | Calendar integration | Calendar | Partial: `.ics` import and export. Live two-way sync is not possible in a static app (see ARCHITECTURE) |
| 7 | Storage, search, version control | Library, Settings > Sync | Built for text and Markdown (binary files are not stored). Optional account and cross-device sync via Supabase: see `docs/SYNC.md` |
| 8 | Progress updates and metrics | Insights, Dashboard | Built. Weekly review document, agent effectiveness table |
| 9 | Interface and customisation | Settings | Built: themes, density, accent, widget order and visibility, agent toggles, custom agents |
| 10 | Support and maintenance | `docs/MAINTENANCE.md` | Process defined; versioned schema with migrations |

## Repository layout

```
apps/personal-workspace/
  index.html            Built, deployable file (committed)
  src/template.html     App source (HTML, CSS, JS)
  agents/registry.json  Agent metadata, input forms, message templates
  agents/*.md           System prompts (edit these)
  scripts/build.mjs     Compiles agents + version into index.html
  tests/smoke.cjs       Headless-browser smoke test (needs Playwright)
  tests/sync.cjs        Sync test: three browsers against a fake Supabase
  docs/                 USER_GUIDE, AGENTS, ARCHITECTURE, MAINTENANCE
```

## Develop

```bash
node scripts/build.mjs                      # rebuild index.html after editing src/ or agents/
NODE_PATH=$(npm root -g) node tests/smoke.cjs   # smoke test
NODE_PATH=$(npm root -g) node tests/sync.cjs    # sync test
```

## Limits to know before relying on it

- Without sync, data lives in one browser profile; clearing site data deletes it. Export backups weekly. With sync on, records are also stored, unencrypted, in your Supabase project (`docs/SYNC.md`).
- The API key is stored unencrypted in that browser profile and the request goes straight from the browser to Anthropic. Fine for a personal machine with a spend-limited key; not suitable for shared computers or teams.
- Agent output can be wrong. The prompts forbid invented facts and citations, but you must still verify.
