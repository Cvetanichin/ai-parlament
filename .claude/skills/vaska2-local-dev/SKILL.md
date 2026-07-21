---
name: vaska2-local-dev
description: Use whenever working on this repo's Supabase/Deno backend or the Vite/React frontend — implementing or verifying an Edge Function, running deno lint/test/check, seeding or resetting the local stack, testing an MFA- or platform-operator-gated endpoint, or touching anything related to regulatory/compliance content. Covers operational tricks this project's dev environment needs that aren't obvious from the code alone.
---

# Working on vaska2 (Quorum Engine backend + frontend) locally

This is project-specific operational knowledge for `supabase/` (Deno Edge Functions +
Postgres migrations) and `frontend/` (Vite/React). Read `CLAUDE.md` first for architecture;
this skill is about *how to actually exercise and verify changes* in this repo's environment,
which has a few non-obvious gotchas.

## Hard rule before anything else

**Never seed, mock, or hardcode regulatory/compliance rule text** —
`regulatory_documents`/`regulatory_clauses`/`compliance_findings` must stay empty until real
PRAG/Annex/Standard Grant Contract source text is supplied and run through
`regulatory-document-ingest-run`. Every validator in this codebase (`eligibilityEngine.ts`,
`budgetEngine.ts`, `complianceStudio.ts`) is designed to return `context_dependent` rather than
a fabricated pass specifically because no real source text exists in this repo. This applies to
test fixtures too — general dummy data (projects, budgets, partners, opportunities…) is fine and
encouraged; fabricated-looking rule citations are not, ever.

## No standalone `deno` CLI in some sandboxed environments

Check first: `which deno`. Supabase's local edge-runtime container ships `edge-runtime`, not a
general-purpose `deno` binary — `docker exec <edge-runtime-container> which deno` will come back
empty even though the stack is running fine. If there's no `deno` on `PATH`:

1. Docker Desktop is usually still reachable even when the sandboxed shell can't resolve host
   paths for bind mounts. Pull `denoland/deno:latest` and use a **long-lived container +
   `docker cp`**, not `docker run -v <host-path>:...` — bind mounts from a sandboxed shell's
   `$(pwd)` frequently resolve to an empty directory inside the container (silently — no error,
   just nothing there) because the sandbox's filesystem view and the Docker daemon's view of
   "the same" path aren't guaranteed to match.

   ```bash
   docker create --name deno-runner -w /work denoland/deno:latest sleep 3600
   docker start deno-runner
   docker exec deno-runner mkdir -p /work
   docker cp "supabase/functions/_shared/." deno-runner:/work/   # note trailing /. and /
   docker exec deno-runner ls /work                              # VERIFY it's actually populated
   docker exec -w /work deno-runner deno test -A vetoEngine_test.ts
   docker exec -w /work deno-runner deno lint
   docker exec -w /work deno-runner deno check some-function/index.ts
   docker rm -f deno-runner   # clean up when done
   ```

2. Always verify the copy actually landed (`docker exec ... ls /work`) before trusting a
   downstream command's output — an empty mount/copy doesn't error, it just runs against nothing.
3. `deno check` on a single Edge Function needs its `_shared/` imports alongside it in the same
   relative layout, not just the one file — copy the whole `_shared/` directory plus the target
   function's directory, not a single file in isolation.
4. This is genuinely running the tests for real (not tracing by hand) — treat "written but never
   executed" as materially weaker evidence than this, and say so explicitly if you can't run it.

## Local auth users beyond the seeded demo accounts

`supabase/TEST_ACCOUNTS.txt` has the three standing demo logins (owner/admin/member,
password `DemoPassword123!`, org "Riverside Civil Society Alliance (Demo)"). For a throwaway
test user instead:

```bash
SERVICE_KEY=$(supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
ANON_KEY=$(supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -d '{"email":"x@example.com","password":"Test123!","email_confirm":true}'
# then add organisation_members / profiles rows via REST with the service key, and
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"email":"x@example.com","password":"Test123!"}'
```

`resolveCaller`'s `service_role` fast path resolves to `role: "system"` — fine for testing
`system`-permitted paths, but useless for testing `owner`/`admin`-gated logic (it will correctly
get rejected). For that you need a real session token from a real `organisation_members` row, as
above.

**A raw SQL seed insert into `auth.users` needs four columns explicitly set to `''`, not left
NULL**, even though they're nullable at the DB level: `confirmation_token`, `recovery_token`,
`email_change_token_new`, `email_change`. GoTrue's own Go code scans these as plain strings, not
nullable — a NULL breaks every future login with `"converting NULL to string is unsupported"`,
a 500 that only shows up in `docker logs supabase_auth_<project>`, not in the client response.
Check that log first if a seeded user can't log in.

## Testing an `is_platform_operator`/MFA-gated endpoint

`resolvePlatformOperator()` requires `aal2` in the JWT, not just `profiles.is_platform_operator
= true`. TOTP enroll/verify are disabled by default locally (`supabase/config.toml`
`[auth.mfa.totp]`). To test for real: temporarily flip `enroll_enabled`/`verify_enabled` to
`true`, `supabase stop && supabase start` (full restart, not just a lint-level config re-read),
enroll a factor, compute a valid code (no `pyotp` installed — use stdlib `hmac`/`base64`/`struct`
TOTP by hand, ~10 lines), verify to get an `aal2` session token, test, then **flip the config
back and restart again** — don't leave MFA enabled for the whole team's local stack.

## Reset/seed cycle

`supabase db reset` re-applies all migrations then `supabase/seed.sql` (local-dev-only dummy
data; never promoted to staging/production because it's not a numbered migration file). If you
add new seed rows, check real `CHECK` constraint values first (`pg_get_constraintdef` against
`information_schema`/`pg_constraint`) rather than guessing — several tables here have narrower
enums than a spec's illustrative examples imply (Database Schema doc drift, see `CLAUDE.md`).
Also: UUID literals must be valid hex (`0-9a-f` only) — `o`, `p`, `r`, `n`, `s`, `t` etc. are not
hex digits and will fail with `invalid input syntax for type uuid`.

## Ministry Adapter pattern, if adding a new one

Every ministry is `buildPrompt`/`mockRun`(or `mockDraft`)/optional `parseResponse` — see
`research.ts`/`writing.ts` for the pattern, `agentRuntime.ts`'s `invokeAgent()` for how it's
wired. If the spec set doesn't name a concrete data contract for a ministry's task (check EAS
§3.2 *and* the relevant detail spec, e.g. Grant Studio §4.3's ownership table) — don't invent
one. Write an ADR (`docs/21-ADRs/`) proposing a contract, same as ADR-0011 did for the Development
ministry, and leave it unimplemented pending sign-off.
