---
document: Deployment Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026
parent: ../../00-EAS-v1.0.md (EAS §9 NFRs, §3.4 Layer 4)
related_adrs: ../21-ADRs/0007-supabase-as-layer-4-backbone.md
related_specs: ../11-Database-Schema/Database-Schema-Specification-v1.0.md, ../15-Infrastructure/README.md
---

# Deployment — Specification v1.0

## 0. Why This Spec Exists

ADR-0007 made a staging-branch (or cloned staging project) validation gate
**mandatory**, not optional, before any migration touches the real
Intelligence Workspace tables — because that project now also carries the
whole platform's new Layer 3/4 schema, and it is a live, billed product
(Paddle is active). Every Approved spec that includes DDL
(`docs/04-Platform-Services/`, `docs/06-Knowledge-Platform/`,
`docs/08-Project-Operations/`, `docs/11-Database-Schema/`) inherits this
requirement. Until this document existed, that requirement was a sentence
in an ADR with no runbook behind it — this spec is that runbook.

## 1. The Constraint That Shapes Everything Below

The organisation's Supabase account is on the **Free plan**
(confirmed directly against the account, 12 July 2026). This matters
architecturally, not just operationally:

- Native Supabase Branching (Git-integrated preview branches, or a
  persistent branch used as a long-lived staging environment) **requires
  the Pro plan** — currently unavailable.
- The Free plan permits **2 active projects** per organisation. The
  organisation is using 1 of 2 (`Consultancy Dashboard`, the live
  Intelligence Workspace project, `eu-west-1`).

This spec therefore adopts **Option C from the original trade-off
analysis — a separate, persistent staging Supabase project** — as the v1
mechanism, not the Branching feature ADR-0007's text mentions as an
example. ADR-0007 explicitly anticipated this fallback ("a Supabase branch
**or a cloned staging project**"), so this is not a deviation from that
ADR, it's the fulfillment of its stated alternative.

## 2. The Staging Project (Provisioned)

| Property | Value |
|---|---|
| Name | `Consultancy Dashboard - Staging` |
| Project ref | `urhocsijfzkepebsmstx` |
| Region | `eu-west-1` (matches production, for EU data-residency consistency — EAS §3.4 Security row) |
| Organisation | same org as production (`vaskac@gmail.com's Org`) |
| Cost | **$0/month** — confirmed via Supabase's cost API before creation, second free-tier project slot |
| Status | `ACTIVE_HEALTHY`, provisioned 12 July 2026 |

**Schema parity confirmed.** The staging project has been seeded with the
exact same three migration files currently in
`supabase/migrations/` in the live repo
(`20260609000001_initial_schema.sql`, `20260609000002_fix_rls_performance_
and_indexes.sql`, `20260617000001_profiles.sql`), applied in the same
order, plus `create extension if not exists vector;` (ADR-0006). A direct
table-by-table comparison against production confirms structural parity:
12 identical tables, RLS enabled on all 12 in both projects. Data is
intentionally **not** synced — staging holds only the same seeded
`ai_agents` reference rows production was seeded with; every other table
is empty. This is schema parity, not data parity, by design (§5).

**First real findings, already surfaced and fixed on staging.** Running a
security-advisor check against the freshly-seeded staging project
surfaced two findings not present on production's own advisor report:
`vector` extension installed in the `public` schema (a known Supabase
anti-pattern — extensions should live in a dedicated schema), and
`handle_new_user()`'s mutable `search_path`. Fixing those cleared the
noise and revealed a third: `handle_new_user()` was still callable via
RPC by `PUBLIC` (not just `anon`/`authenticated` individually — the actual
grant was on the Postgres `PUBLIC` pseudo-role, confirmed via a direct
`information_schema.routine_privileges` query, not the advisor cache,
which lagged behind the fix). All three are now fixed and verified at the
database level on staging (migrations `20260609000004` through `...006`).

**Not yet promoted to production.** Per §3's runbook, this fix is staged,
validated, and ready — but applying it to `jorpfsrvhnelnboupiyx` is held
for explicit Product Owner go-ahead rather than auto-promoted, even though
the change is low-risk (schema/permission hardening, no data or RLS
policy touched). `docs/11-Database-Schema/`'s `create extension if not
exists vector;` statements (§4, §11) should also be amended to install
into a dedicated schema rather than `public`, matching this fix, before
those migrations are first applied anywhere.

## 3. The Runbook

Every migration that touches a real, live table — meaning every migration
in `docs/11-Database-Schema/` §1, §3, or §5 (the sections extending
`clients`, `projects`, `activities`, `indicators`, `risks`, `deliverables`,
`project_documents`, `reports`, `ai_agents`, `prompt_modules`,
`agent_runs`) — follows this sequence. Migrations that only create
genuinely new tables with no foreign-key dependency on a real table (most
of §4, §11, §13) carry lower risk but go through the same gate for
consistency; a single, unconditional rule is easier to follow correctly
than a rule with exceptions.

1. **Author the migration** as a numbered file under `supabase/migrations/`
   in the live repo, following the existing naming convention
   (`YYYYMMDDHHMMSS_description.sql`) — per `docs/11-Database-Schema/` §8,
   the Supabase CLI convention already in use, not a new tool.
2. **Local dry-run (optional but recommended, free).** `supabase start`
   (Docker-based local Postgres) and `supabase db push` against it first,
   for fast syntax/logic iteration before touching any billable
   infrastructure at all. Catches typos and logic errors for free; does
   **not** catch production-scale issues (see step 3).
3. **Apply to the staging project (mandatory gate).** Run the migration
   against `urhocsijfzkepebsmstx` via the Supabase CLI or MCP
   `apply_migration`. This is the real gate — it runs against an actual
   hosted Postgres instance with the same extensions, same Postgres
   version, and the same table shapes production has, which a local
   Docker instance may drift from over time.
4. **Validate.** Run `get_advisors` (both `security` and `performance`
   types) against the staging project and confirm no new findings beyond
   what's already tracked as accepted (§2's two flagged items, until
   fixed). Run a `list_tables` diff against production to confirm no
   unexpected structural drift crept in between the last sync and now.
   Where the migration is additive to a table an edge function reads or
   writes (per `docs/08-Project-Operations/` §1.2's table), manually
   invoke that function against the staging project and confirm it still
   succeeds — this is the "smoke-test the four real edge functions"
   requirement already named in `docs/11-Database-Schema/` §8's migration
   strategy, made concrete here.
5. **Promote.** Once validated, apply the identical migration file to the
   production project (`jorpfsrvhnelnboupiyx`). Not a copy-and-modify — the
   exact same file that passed staging, so what was validated is what
   ships.
6. **Re-sync staging.** No action needed for the promoted migration itself
   (staging already has it, from step 3) — but confirm no other drift
   accumulated (§2's parity check) at a regular cadence (§4), not only
   when a new migration is being shipped.

**What this deliberately does not require:** a pull request, a CI
pipeline, or a second approver. At current team size (a single
consultancy), those would be process overhead without a corresponding risk
reduction — EAS principle 5's operational-simplicity reasoning, applied
here the same way it was applied to ADR-0006's vector-store choice. §6
covers when to add them back.

## 4. Ongoing Parity Maintenance

Staging and production schemas will drift if migrations are ever applied
directly to one and not the other (a mistake, not a designed path — §3
step 5 is the only sanctioned route to production). A monthly parity check
(`list_tables` diff, both projects) is the minimum cadence; run it
immediately after any manual `execute_sql` debugging session against
production, since ad hoc production fixes are exactly the kind of
un-migrated change that causes drift.

## 5. Data — Deliberately Not Synced

Staging never receives a copy of production's real client/donor/project
data. Two reasons, both binding: GDPR — real CSO client and beneficiary
data has no reason to exist in a second, lower-scrutiny environment; and
because schema parity is what this gate needs to validate, not data-driven
behaviour, so an empty (but structurally identical) staging database is
sufficient and safer than a production clone. If a future need arises for
realistic test data (e.g. load-testing a Workflow Engine migration), it
should be synthetic/seeded, never a production export — a decision for
whoever owns that testing need at the time, not pre-built here.

## 6. Documented Upgrade Path — Option D

This is the target state to graduate to, not a requirement to build now.
When migration/PR volume actually justifies the cost (a judgement call for
the Product Owner, not a fixed threshold specified here):

1. Upgrade the organisation to the **Pro plan** ($25/mo floor).
2. Convert the existing separate staging project into a Supabase
   **persistent Branch** of production instead (`git_branch` unset,
   `persistent: true`), or connect GitHub and let Supabase auto-create a
   preview branch per pull request — either uses the native Branching
   feature this spec's §1 constraint currently rules out.
3. **Advantage over the current mechanism:** a Branch is created *with a
   snapshot of production's data* by default (configurable), which
   `execute_sql`/`apply_migration`-based smoke tests (§3 step 4) benefit
   from directly — no separate synthetic-data effort (§5) needed for
   realistic testing, while the GDPR concern (§5) is mitigated by the
   Branch's shorter lifecycle and tighter access scope compared to a
   permanent second project.
4. **Cost, for comparison:** a short-lived, per-PR preview branch runs
   roughly $0.40 for a typical PR's lifetime; a persistent branch used as
   a permanent staging environment runs roughly $9.70/month (both on top
   of the $25/mo Pro floor) — confirmed against Supabase's current
   published branch-compute pricing, not estimated.
5. This upgrade does **not** change §3's runbook shape — it changes which
   infrastructure primitive step 3 targets (a Branch instead of a second
   project) and adds automation (steps 1-4 can become a CI job rather than
   a manually-run sequence) — the validate-before-promote discipline stays
   identical.

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **No direct-to-production migrations** | Structurally enforced by convention, not by a technical lock (no CI gate exists yet at this team size) — §3 is the complete authority on how a migration reaches production; a migration applied any other way is a process violation to flag, not a normal path. |
| **Region consistency** | Any future additional environment (§6's Branch, or otherwise) must be provisioned in `eu-west-1`, matching production, for EU data-residency consistency. |
| **Advisor findings tracked, not ignored** | Every new `get_advisors` finding surfaced by a staging validation run (§3 step 4) is either fixed before promotion or explicitly logged as an accepted, tracked exception (§2's two current items) — never silently dismissed. |
| **Cost visibility** | Because Branch/staging usage isn't covered by any Supabase spend cap (confirmed, §6), the Product Owner should review actual monthly cost after any upgrade to Option D, not assume the estimate in §6 holds indefinitely as usage grows. |

## 8. Open Items for Product Owner

- **Promote the staging hardening fix to production** (§2) — the migration
  is written, validated, and already applied on staging; only the "apply
  to `jorpfsrvhnelnboupiyx`" step (§3 step 5) is pending explicit
  go-ahead. Low risk, no data/RLS impact, but a live-production action
  this spec deliberately doesn't auto-execute.
- **Option D trigger** (§6) — no fixed threshold is specified for when to
  upgrade; left as an explicit judgement call rather than an arbitrary
  number (e.g. "after 10 migrations") that wouldn't actually reflect
  whether the manual runbook has become a real bottleneck.
