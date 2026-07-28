---
adr: 0014
title: Self-Serve Organisation Bootstrap on First Sign-Up
status: Accepted
date: 2026-07-26
amends: ../11-Database-Schema/Database-Schema-Specification-v1.0.md §1, ../../supabase/migrations/20260712183616_01_multi_tenancy.sql
---

> **Update, 2026-07-28 (local-dev verification):** this ADR's design was
> written and applied to the hosted project, but never actually exercised
> live end-to-end there — the hosted project requires email confirmation,
> so `useAuth.tsx`'s bootstrap branch never ran against a real session
> until local dev (email confirmation off by default) made that possible.
> Two real bugs surfaced and were fixed (migrations 21, 22 — see
> `docs/README.md`'s session log for the full account):
> 1. Local Postgres via `supabase start` doesn't replicate the hosted
>    platform's automatic table-privilege grants to `anon`/`authenticated`/
>    `service_role` — every table needed an explicit `GRANT`, added for
>    both local and hosted (hosted's was a harmless no-op).
> 2. The original client code read the new organisation's `id` back via
>    `.insert(...).select("id").single()`. Postgres raises an RLS error on
>    `INSERT ... RETURNING` when the new row isn't visible under any
>    `SELECT` policy — true here, since `organisations_select` requires an
>    `organisation_members` row that doesn't exist until the *next* insert.
>    Fixed by generating the id client-side (`crypto.randomUUID()`) so no
>    read-back is needed. Separately, `organisation_members_insert_bootstrap`'s
>    zero-members subquery (below) caused Postgres to detect infinite
>    recursion, since it queried the very table the policy is defined on —
>    fixed by moving that check into a `SECURITY DEFINER` function
>    (`organisation_has_no_members`), which evaluates without re-triggering
>    the calling policy. The decision below (zero-members check as the
>    security boundary) is unchanged; only its implementation mechanism is.

> **Update, 2026-07-29 (code review finding — superseded again):** a direct
> review of the PR carrying the above fixes found a third, distinct bug:
> the two client-side inserts (organisation, then membership) had no
> protection against two concurrent executions for the *same* user — e.g.
> opening the app in two tabs right after signup. The zero-members check
> only blocks inserting into an org someone *else* already owns; nothing
> stopped this same user's two racing attempts from each generating their
> own fresh UUID and each successfully creating a brand-new organisation,
> leaving the user owning two orgs (one permanently orphaned, since
> `useOrganisation.ts` only ever looks at `memberships[0]`).
>
> Fixed (migration 23) by replacing **both** RLS insert policies and the
> `organisation_has_no_members` function from the update above with a
> single `SECURITY DEFINER` RPC, `bootstrap_own_organisation()`: it
> serializes concurrent calls for the same user via a transaction-scoped
> `pg_advisory_xact_lock` keyed on their user id, re-checks for an existing
> membership *inside* that lock, and only then creates the organisation and
> membership row together. It is idempotent (returns the existing org id on
> a repeat call) and takes no arguments (nothing for a caller to manipulate
> — `auth.uid()` is read from the JWT context internally). Verified with 5
> genuinely concurrent `curl` calls for one user: all returned the same
> organisation id, exactly one row created.
>
> **This means `organisations_insert`, `organisation_members_insert`
> (originally `organisation_members_insert_bootstrap`), and
> `organisation_has_no_members` — all described as the live mechanism in
> the "Decision" section and the update above — no longer exist.** They
> were dropped by migration 23. `apps/grant-studio-web/src/hooks/
> useAuth.tsx` now calls `supabase.rpc("bootstrap_own_organisation")`
> instead of doing two separate `.insert()` calls. The "Decision" and
> "Alternatives" sections below are kept as-written for the historical
> reasoning (why a zero-members check is the right security boundary at
> all — that part is still true) but no longer describe the actual
> mechanism enforcing it; treat this note as the current source of truth
> for *how* it's enforced today. Migrations 20 and 22 remain in the repo's
> migration history as applied-and-then-superseded steps — each was
> individually correct at the time, and are not rewritten or squashed, per
> this project's convention of not editing already-applied migrations.

# ADR-0014: Self-Serve Organisation Bootstrap on First Sign-Up

## Context

Migration `01_multi_tenancy` gave every *pre-existing* user (one with rows
already in `projects`/`clients`) a one-time backfilled `organisations` row
and an `organisation_members` row with `role = 'owner'`. It created no
ongoing path for a *new* signup to get an organisation: `organisations` and
`organisation_members` only ever had `select` policies (`organisations_select`,
`organisation_members_select`), both scoped to rows the user is already a
member of. There is no `insert` policy on either table.

This was never exercised as a defect because every session to date has
worked against pre-seeded test users. It became a real, blocking gap the
moment `apps/grant-studio-web`'s Login page needed a working sign-up flow
(this session, after the `cso-playground` project had to be recreated from
scratch): a brand-new `auth.users` row has zero `organisation_members` rows,
every RLS policy in the schema gates on `organisation_members`, and the
app has no UI concept of "create your organisation" — so a freshly
signed-up user would see an empty, permanently-broken app with no
recovery path.

## Decision

Add exactly two `insert` policies, matching the shape ADR-0005's
multi-tenancy model already uses everywhere else (gate on `auth.uid()`,
nothing more elaborate):

- `organisations_insert`: any authenticated user may insert an
  `organisations` row. This is not a privilege-sensitive operation on its
  own — the row is invisible to everyone (including its creator) until an
  `organisation_members` row also exists pointing at it, per the existing
  `select` policy. Mirrors the already-accepted pattern for `clients_insert`
  in the base Intelligence Workspace schema (`with check (true)`, scoped
  implicitly by the sibling table's select policy).
- `organisation_members_insert`: an authenticated user may insert a row
  **only for themselves** (`user_id = (select auth.uid())`), **only as
  `'owner'`** (`role = 'owner'`), **and only into an organisation that
  currently has zero members** (checked via the `SECURITY DEFINER`
  helper function `organisation_has_no_members(organisation_id)` — see the
  2026-07-28 update above for why this can't be a plain subquery). The third
  clause is the actual
  security boundary: without it, `role = 'owner'` alone would let any
  authenticated user self-insert as owner into *any* `organisation_id`,
  including one that already belongs to someone else, as a privilege
  escalation. The zero-members check means self-bootstrap only ever
  succeeds against a brand-new, still-unclaimed organisation — once an
  organisation has its first (owner) member, this policy can never insert
  into it again, by construction. Adding a teammate to an existing
  organisation (`role = 'member'`, inserted by an existing owner) is a
  distinct, not-yet-built feature and is out of scope for this ADR — it
  needs its own policy (`user_id != auth.uid()`, gated on the inserter
  already being an owner of that `organisation_id`), deferred until an
  actual invite-teammate UI exists.

Client-side (`apps/grant-studio-web/src/hooks/useAuth.tsx`): when a session
is authenticated and its `organisation_members` query returns zero rows,
the app inserts one `organisations` row (named from the user's email, same
convention migration 01 used for the backfill) and one
`organisation_members` row (`role: 'owner'`) before rendering the rest of
the app. This runs once per brand-new user, is idempotent in effect (a user
who already has a membership never re-enters this branch), and requires no
new Edge Function — both inserts are covered by the RLS policies above.

## Consequences

- Every new sign-up gets exactly one organisation, and is its owner. There
  is still no multi-organisation-per-user concept (`useOrganisation.ts`'s
  existing "first membership is the organisation" comment stays accurate)
  and no self-serve way to join an *existing* organisation — that's a
  future invite flow, not this ADR.
- No existing table, policy, or edge function is touched. This is additive:
  two new `insert` policies, one new client-side bootstrap branch.
- The zero-members check on `organisation_members_insert` closes the
  privilege-escalation gap a naive `role = 'owner'` check alone would leave
  open (see Alternatives) without needing a trigger or Edge Function.

## Alternatives considered

- **Do the bootstrap entirely server-side (a new Edge Function or a
  `handle_new_user`-style trigger on `auth.users`, mirroring how `profiles`
  rows are auto-created).** More robust long-term (no client-trusted
  insert path at all), but a strictly larger change for a dev-environment
  unblock, and the zero-members check already closes the escalation risk a
  purely client-trusted `role = 'owner'` policy would otherwise have.
  Flagged as a good follow-up once an invite-teammate flow is built anyway
  (that work will need server-side membership management regardless).
- **`organisation_members_insert` constrained only by `user_id = auth.uid()
  and role = 'owner'`, no zero-members check.** Rejected — this would let
  any authenticated user self-insert as `'owner'` into an
  `organisation_id` that already belongs to someone else, an instant
  privilege escalation into any organisation whose UUID they can observe
  or guess. The zero-members check (this ADR's actual decision) closes
  that: self-bootstrap only ever succeeds against a still-unclaimed
  organisation, by construction, not by relying on UUIDs being unguessable.
