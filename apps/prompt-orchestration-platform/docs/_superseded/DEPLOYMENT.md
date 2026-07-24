# DEPLOYMENT.md

## 1. Environments

`local` (Supabase CLI local stack) → `staging` (separate Supabase project) → `production` (separate Supabase project). Never develop directly against production. Migrations are applied to `local` first, then `staging`, then `production` — same migration files, same order, no environment-specific SQL.

## 2. Deploy steps (Edge Function)

```
supabase functions deploy orchestrate-task --project-ref <staging-ref>
# verify against staging fixtures (TESTING_STRATEGY.md §5)
supabase functions deploy orchestrate-task --project-ref <production-ref>
```

## 3. Migration discipline

- One concern per migration file, sequentially numbered (`DATABASE.md` §2 shows the pattern).
- Every migration is reversible in principle — write a corresponding rollback note in the migration file's header comment even if Supabase's migration tooling doesn't auto-generate a down-migration.
- Seed data migrations (`002_seed_core_modules.sql`) are idempotent — use `insert ... on conflict do nothing` or equivalent, so re-running against an already-seeded environment doesn't error or duplicate.

## 4. Frontend deploy

React app on Vercel, pointed at the Supabase project's public URL and anon key (never the service-role key — that's Edge Function only). Standard Vercel git-push-to-deploy for `staging`; manual promote for `production`.

## 5. Rollback

Edge Function: redeploy the previous version (`supabase functions deploy` from the prior git tag). Database: prefer forward-fixing with a new migration over reverting a migration in place, since `task_runs`/`run_steps` data may already reference schema added by the migration in question — a hard rollback risks orphaning run history.

## 6. Pre-deploy checklist (every phase gate, not just final launch)

- [ ] All tests for modules touched in this phase pass (`TESTING_STRATEGY.md`).
- [ ] RLS policies reviewed for any new table or column (`SECURITY_MODEL.md`).
- [ ] No secret values committed or logged (`SECURITY_MODEL.md` §4).
- [ ] Migration applied cleanly to a fresh `local` stack from zero, not just incrementally on a dev database that's drifted from what a new environment would look like.
