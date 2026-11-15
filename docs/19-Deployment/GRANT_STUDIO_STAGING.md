# Reproducing Grant Studio staging

The repository is the schema and application source of truth. Supabase Auth
dashboard settings, environment secrets and Vercel protection are external
configuration and must be provisioned separately.

## Targets

| Component | Target | Scope |
| --- | --- | --- |
| Grant Studio staging | `dgwdtaoozlqfxgynrvkr` (`ai-parlament-staging`) | Database, Auth and five Grant Studio functions |
| Personal Workspace legacy integration | `zfadrhpnhejzbpnfizxu` (`cso-playground`) | Existing personal sync; not the Grant Studio backend |
| Grant Studio production | `nricmdtcflpihwrdvdih` | Not changed by this setup |
| Frontend preview | Vercel `ai-parlament`, root `apps/grant-studio-web` | Per-preview override; retain Personal Workspace production settings |

`supabase/staging/project.json` pins the staging project, CLI and function list.
`.mcp.json` targets staging in read-only mode. Changing it does not retarget the
Supabase GitHub integration; that integration currently belongs to the legacy
project. Its preview check is additional evidence, not the staging deployment.

## Fresh database: no hosted credentials

Use Node.js 24, Docker and Supabase CLI **3.1.0**. The pinned GitHub workflow
`.github/workflows/staging-reproducibility.yml` runs this same local rebuild on
an isolated runner. There are no hosted database credentials in that job.

```sh
supabase --version
supabase db start --help
supabase db reset --help
supabase db start
supabase db reset --local
docker exec -i supabase_db_ai-parlament psql --username=postgres \
  --dbname=postgres --set=ON_ERROR_STOP=1 < supabase/tests/staging_reproducibility.sql
node scripts/staging/history.test.mjs
```

`db reset --local` resets only the disposable local stack. Never substitute a
hosted target. Migrations include registry seed data; the nonexistent separate
`seed.sql` dependency is disabled. The test's synthetic users, organisation
memberships and project are rolled back.

The chain contains 36 migrations as of this change, including two exported
historical staging receipts (the sample notes table and internal-function
permissions), the already-merged Gmail queue schema, and the new permissions
migration created by CLI 3.1.0. The sample notes are historical setup data with
RLS, not a new product workflow.

The final permissions migration preserves staging's stricter boundary: profile
trigger and embedding helper are internal, and shared error logs cannot be read
or written by application clients. This intentionally supersedes the old
error-handling demo's public-log policies on platform stacks. A separate demo
deployment must not assume that public logging is a platform capability.

## Hosted migration history reconciliation

Historical SQL was applied through APIs that assigned new timestamps, so the
hosted versions did not match repository filenames. Staging also applied
migrations 21–24 as one transaction. Re-running their DDL is incorrect.

`supabase/staging/history-map.json` records reviewed source versions, names,
statement fingerprints, target filenames and file hashes for both projects.
`scripts/staging/history.mjs` generates a **metadata-only** repair transaction.
It locks migration history, checks every exported row, preserves original SQL
and receipt metadata, and refuses unknown/changed rows or historical files.
For the bundled 21–24 receipt, the original combined SQL remains on receipt 21;
the three already-applied versions receive separate history entries. No
application tables or records are changed by that transaction.

To inspect a target, export the result rows of this read-only query as a private
JSON array with fields `version`, `name`, `statements`:

```sql
select version, name, statements
from supabase_migrations.schema_migrations order by version;
```

The pinned CLI supports `supabase db query --remote=PROJECT_REF --read-only
--output=json` for the query. Then generate a plan:

```sh
node scripts/staging/history.mjs --project dgwdtaoozlqfxgynrvkr \
  --history /private/path/history.json --out /private/path/repair.sql
```

Inspect the generated transaction and execute it through the same target's
authorised SQL client. It has snapshot guards and is not a schema migration.
Pending versions in the plan must be applied separately only after validating
their schema effects. Do not mark missing schema as applied. Re-export and run
the planner again: an aligned staging database reports zero changed rows and
zero pending versions. Keep raw history exports and repair SQL out of Git.

## Existing function deployment

```sh
node scripts/staging/deploy-functions.mjs
# Provision SUPABASE_ACCESS_TOKEN through your secret manager, then:
node scripts/staging/deploy-functions.mjs --apply
```

The default is a dry run. The script checks CLI 3.1.0 and explicitly targets
staging; it deploys only the five existing Grant Studio functions. JWT
verification is explicit in `supabase/config.toml`. It does not deploy Gmail,
create workflows, prune functions or target production. Supabase supplies the
hosted internal keys. Provider keys belong in server-side function secrets;
without them, existing model calls use the gateway's mock fallback.

## Frontend and hosted Auth

Follow `apps/grant-studio-web/README.md`. Use a public publishable key for the
staging URL, build from the committed app folder and retain Vercel sign-in
protection. Run `npm test`, `npm run build` and `npm run verify:backend`.

Hosted Auth Redirect URLs must contain this literal pattern for the existing
project previews (preserve all other entries):

```text
https://ai-parlament-*-vas-projects-d1a401e4.vercel.app/**
```

Do not URL-encode `*` as `%2A`. Production should use exact trusted callbacks.
The backend check uses an invalid synthetic token to verify the preview's
recovery redirect without sending email or changing a password.

## Verified state and remaining work

On 15 November 2026:

- Grant Studio frontend CI passed ten tests and its TypeScript/Vite build.
- A fresh CLI database replayed all 36 migrations and passed permission,
  idempotent bootstrap, profile trigger and cross-organisation isolation checks.
- Hosted staging passed that same rolled-back SQL test.
- Staging history was normalized and the missing RPC, sync-schema and final
  permissions migrations were applied. Re-exported history reports **zero
  changes and zero pending versions**.
- Legacy `cso-playground` history was normalized without applying schema changes
  or touching user data. Its four pending repository migrations remain pending;
  the GitHub preview integration can test them on its disposable branch.
- Staging retained one real user, one organisation membership, zero projects
  and zero queued actions. Synthetic test identities were rolled back.
- The prior live preview passed Auth, data isolation, function CORS/JWT and
  hosted recovery-redirect checks. Production was not deployed.

An authenticated user grant workflow and an actual user-completed reset remain
separate acceptance tests. The merged Gmail owner/digest code still requires
its own controlled deployment and mailbox configuration before a Gmail pilot;
this setup does not enable additional workflows or Gmail sends.

The security advisor still reports intentional authenticated access to the
organisation bootstrap RPC, closed RLS tables with no client policies, and
[disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
