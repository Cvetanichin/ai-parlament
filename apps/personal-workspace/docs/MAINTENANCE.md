# Support and maintenance

"Ongoing support" for a self-hosted, single-user tool means a defined routine, not a vendor. This file is that routine.

## 1. Versioning

- App version: `package.json` (semantic versioning). Shown in Settings > About.
- Data schema: `SCHEMA_VERSION` in `src/template.html`. Bump only when stored data changes shape, and add `MIGRATIONS[n]`.
- Backups record the app version; import runs migrations.

## 2. Release procedure

1. Edit `src/template.html` and/or `agents/*`.
2. `node scripts/build.mjs`
3. Run the tests: `NODE_PATH=$(npm root -g) node tests/smoke.cjs` and `node tests/sync.cjs`. If the database side changed, also run `supabase/tests/personal_workspace_sync.sql`.
4. Open the app manually: Dashboard, one agent Prompt Pack, Library save and history.
5. Update the changelog below and the version in `package.json`; rebuild.
6. Export a backup, then deploy or replace `index.html`. Data persists in the browser and migrates on load.
7. Rollback: restore the previous `index.html` from git. Data written by a newer schema may not load in an older build; keep the pre-update backup.

## 3. Routine maintenance

| Frequency | Task |
|---|---|
| Weekly | Export backup (file or encrypted) to a synced folder |
| Monthly | Check the Model ID still works; run each agent once; review Insights recommendations |
| Quarterly | Review agent prompts against ratings; prune unused agents and widgets; test restore from backup in a private window |
| On browser major update | Run the smoke and sync tests |
| After any change to migration 26 | Run the SQL test; keep client and database changes in one release |

## 4. Security hygiene

- Rotate the API key quarterly; keep a monthly spend limit.
- Do not host on an origin shared with other apps.
- Never paste client-confidential material into an agent unless your agreement with the client allows sending it to the AI provider.
- Keep the page free of third-party scripts; any addition needs a review.

## 5. Issue handling

| Severity | Example | Response |
|---|---|---|
| 1 | Data not saving or loading | Export what is visible, restore last backup, fix before further use |
| 2 | Agent run or import fails | Use Prompt Pack as workaround; fix within the week |
| 3 | Cosmetic or wording | Batch into the next release |

Record issues as GitHub issues in this repository with: steps, expected, actual, browser, app version.

## 6. Roadmap (candidate, not committed)

| Priority | Item | Value | Effort |
|---|---|---|---|
| 1 | End-to-end encryption for synced records (`SYNC.md`, section 7) | Removes the plain-text-in-the-cloud caveat | Medium |
| 2 | Autosave backup to a chosen folder (File System Access API) | Removes the main data-loss risk for users without sync | Small |
| 3 | Researcher with web search tool | Fresh, cited evidence | Medium; needs testing |
| 4 | Task inbox for automation (Make/Zapier webhook to JSON) | Live calendar and email capture | Medium |
| 5 | Recurring tasks | Fewer manual entries | Small |
| 6 | Streaming agent output | Better feel on long reads | Small |
| 7 | Optional proxy to hold the Anthropic key server-side | Safer key handling; enables sharing | Medium |

## 7. Changelog

### 1.1.0 (2026-11-09)
- Optional sign-in and cross-device sync (Supabase): migration 26, `workspace_push` RPC with last-write-wins, per-user row-level security, offline queue, token refresh, delete-cloud-data.
- Calendar events and tasks created from them now have deterministic ids, so importing one `.ics` on two devices does not duplicate them.
- New tests: `tests/sync.cjs` (browser, fake backend) and `supabase/tests/personal_workspace_sync.sql`.
- Data schema unchanged (1); new `sync` state defaults on load.

### 1.0.0 (2026-11-05)
- Dashboard, tasks, projects, calendar (.ics), Library with versions and search, Insights, Settings.
- Agents: Creative Writing, Research and Analysis, Project Drafting, Deadline Tracking; custom agents; Prompt Pack mode.
- Encrypted and plain backups; schema v1.
