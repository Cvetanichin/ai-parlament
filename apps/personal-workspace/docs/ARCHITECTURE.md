# Architecture

## 1. Problem and smallest valuable outcome

**User:** one independent consultant managing client and personal work.
**Problem:** deadlines, drafts and research are scattered; AI help is ad hoc and unmeasured.
**Smallest valuable outcome:** one place that shows what needs attention today, with agents that produce structured, reusable outputs and a record of whether they helped.

## 2. Design decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| Delivery | Single static HTML file | Zero hosting, zero accounts, instant use | No background jobs |
| Storage | IndexedDB (localStorage fallback) | Private, offline, large quota | Per-browser unless sync is on; user must back up |
| Sync (optional) | Supabase Auth and PostgREST over `fetch`; one row per record; last-write-wins; RLS per user | Cross-device without a server of our own; no library; stays local-first | Records stored unencrypted in the project; later edit wins as a whole record; needs a Supabase project. See `SYNC.md` |
| Agents | Prompt files + registry, compiled in | Prompts are the product; editable, diffable, reviewable | Rebuild needed to change built-ins (custom agents need no rebuild) |
| AI access | Direct browser call to Anthropic with user key | No server to secure or pay for | Key sits in the browser; single-user only |
| Output handling | Fenced JSON contracts, validated, applied on click | Agents act without being trusted | Models can omit or malform blocks; the app then just shows text |
| Calendar | `.ics` import/export | Works with every calendar, no OAuth | Not live; recurring events not expanded |
| Dependencies | None | Nothing to patch or break | Hand-written Markdown renderer covers a subset |

## 3. Components

```
 Browser tab
 ┌───────────────────────────────────────────────────────────┐
 │ Views: Dashboard · Tasks · Projects · Calendar · Agents   │
 │        Library · Insights · Settings · Guide · Search     │
 ├───────────────────────────────────────────────────────────┤
 │ Domain logic: triage · workload · reminders · ICS ·       │
 │   metrics/insights · search · line diff · migrations      │
 ├───────────────────────────────────────────────────────────┤
 │ Agent runtime: registry → buildPrompt → callClaude        │
 │   → extractBlock (tasks/updates) → user approval          │
 ├───────────────────────────────────────────────────────────┤
 │ State S (one object) ── debounce ──► IndexedDB            │
 └──────────────┬────────────────────────────────────────────┘
                │ HTTPS, only on "Run agent"
                ▼
        api.anthropic.com
```

## 4. Data model (schema version 1)

The sync state (`sync`: URL, publishable key, session, per-record bookkeeping, cursor) is additive and defaults on load, so it needs no schema bump. The cloud table `workspace_items` and its protocol are described in `SYNC.md`.

| Entity | Key fields |
|---|---|
| task | id, title, notes, projectId, due, effort (h), priority 1-3, status, created, completedAt, source (`manual`, `agent`, `calendar`), icsKey |
| project | id, name, goal, due, status |
| doc | id, title, tags[], created, versions[{ts, content, note}] (max 30) |
| event | id, key (uid+date), title, start, time |
| run | id, agent, ts, mode (`api`, `pack`), ms, inTok, outTok, rating, accepted, error |
| customAgent | id, name, description, system |
| settings | theme, accent, density, widgets, hiddenWidgets, disabledAgents, apiKey, model, maxTokens, notify, leadDays, hoursPerDay, icsDeadlineRegex |

Migrations: `MIGRATIONS[n]` upgrades n-1 to n; unknown settings keys are defaulted on load.

## 5. Deadline logic (deterministic, no AI)

- Urgency: overdue = 100 + 3 per day late (capped at 20 days); otherwise `max(0, 70 - 7 x days left)`; no date = treated as 30 days away.
- Score = urgency x (0.6 + 0.2 x priority). Buckets: overdue, now (<= 1 day), week (<= 7), later.
- Workload: hours of effort due within 7 days (overdue included) against `weekdays x hoursPerDay`.
- Flags: tasks without effort (understates load), three or more deadlines on one day.
- The AI agent receives the same snapshot and may propose changes; it never writes directly.

## 6. Security model

| Asset | Threat | Control |
|---|---|---|
| Tasks, documents | Other people on the machine | Browser profile separation; optional encrypted export. Data at rest in IndexedDB is not encrypted |
| API key | Theft from browser profile, XSS | Local only, excluded from backups; no third-party scripts; Markdown output is HTML-escaped before formatting; links limited to http(s). Use a spend-limited key |
| Agent output | Prompt injection via pasted sources | Agents cannot act; imports and updates are validated and need a click; review panel shows proposed changes |
| Backup files | Disclosure | Encrypted option (PBKDF2-SHA256 250k iterations, AES-GCM) |

With sync on, the same applies to the sign-in tokens, and the cloud copy of your records is plain text readable by project admins (`SYNC.md`, section 4).

Residual risk: anyone who can run script in this origin can read the key. Do not host the page alongside other apps on the same origin.

## 7. Scaling path

Build in this order; stop when the need is met.

| Stage | Trigger | Change |
|---|---|---|
| 0 (now) | One person, one browser | As built |
| 1 | Want a second device | **Built as optional sync (`SYNC.md`).** Without it: export to a synced folder weekly, or File System Access API autosave |
| 2 | Want live calendar and email | Add automation (Make or Zapier): calendar event with a label creates a task via a webhook-to-JSON inbox; page polls an inbox file or small endpoint |
| 3 | Want the key off the device, or a team | Thin proxy (edge function) holding the key; auth; shared store (Supabase or Airtable). Keep the agent registry and contracts unchanged |
| 4 | Want agents with tools | Server-side agent loop with web search and document tools; keep human-approval contracts |

## 8. Integrations

| Tool | Now | Next |
|---|---|---|
| Google, Outlook, Apple Calendar | `.ics` import; `.ics` export with alarms | Make/Zapier scenario: new event matching a label creates a task in the inbox |
| Notion, Airtable, Google Drive | Export Markdown/JSON and import manually | Scenario syncing the Library to a Drive folder |
| Email | Paste into agent inputs | Scenario forwarding labelled emails to the task inbox |

These are designs, not built features.

## 9. Assumptions and risks

**Assumptions:** single user; modern browser; user accepts manual backups; user supplies sources to the Researcher.
**Risks:** data loss through cleared site data (medium, high impact; mitigated by backup prompts, not enforced); model ID drift (low); hallucinated content reaching clients (medium, high impact; mitigated by prompts and VERIFY markers, not eliminated); reminders missed when page closed (high likelihood; mitigated by calendar alarms).
