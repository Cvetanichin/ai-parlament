# Grant Studio

React/Vite frontend for Supabase Auth, organisation-scoped Postgres data and five
JWT-protected Grant Studio Edge Functions. Requires Node.js 24.

## Development

```sh
cp .env.example .env.local
# Set VITE_SUPABASE_PUBLISHABLE_KEY to the staging project's public key.
npm ci
npm test
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

The development backend is `ai-parlament-staging` (`dgwdtaoozlqfxgynrvkr`).
Existing `VITE_SUPABASE_ANON_KEY` configurations remain supported. Never put
service-role keys, secret keys, OAuth credentials or model keys in `VITE_`
variables. Startup/build rejects missing or unsafe public configuration.

`npm run build` type-checks and produces `dist/`. `npm run verify:backend`
checks Auth availability, anonymous data isolation, denied anonymous organisation
bootstrap, and CORS/authentication on these functions:

- `eligibility-report-get`
- `eligibility-report-run`
- `workflow-research-run`
- `workflow-governance-run`
- `workflow-gate-decide`

The connectivity check creates no accounts or records and sends no email. When
`VERCEL_URL` is set, it also uses a synthetic invalid recovery token to verify
that hosted Auth redirects to this preview's `/reset-password` page instead of
the default localhost URL. This is not a real password-reset acceptance test.

## Deploy

`vercel.json` builds this app, runs its tests and backend checks, and configures
SPA rewrites. Set Root Directory to `apps/grant-studio-web`, Node.js to 24, and
configure the public Supabase URL/key in the deployment environment. For API
source uploads, include the `apps/grant-studio-web/` path prefix and explicitly
set that root. A null root inherits the project's existing Personal Workspace
configuration and will build the wrong application.

The existing Vercel project is `ai-parlament`
(`prj_PPSdnlvD4XpnB34HrhBb9s3njK8I`, team `team_ri2JSMvi05DeLvAX5fOf4dEe`).
Use a Grant Studio preview override; retain the Personal Workspace production
configuration. Set the same public environment variables when building from Git.
Preview protection remains enabled and requires the user's Vercel sign-in.

## Account and password recovery

Create an account on this backend, confirm its email and sign in. First sign-in
atomically creates an owner organisation. An account from a different Supabase
project does not authenticate here.

Forgot password requests an email with the current origin's `/reset-password`
callback. The reset page waits for Auth initialization, validates two matching
password fields, then calls `updateUser` in the verified user's session.
`PASSWORD_RECOVERY` routes to that page rather than the normal application.

In Supabase Auth > URL Configuration, preserve existing Redirect URLs and add
the literal pattern below, without quotes or URL encoding:

```text
https://ai-parlament-*-vas-projects-d1a401e4.vercel.app/**
```

`%2A` is not a wildcard. The final `/**` is required for callback paths. For
production, allow exact trusted callback URLs rather than broad patterns.
Hosted Auth settings are not changed by a code deployment; `supabase/config.toml`
configures the local stack only.

If a previously issued email still opens localhost, request a fresh email. The
login page's masked **Email link opens the wrong page?** field can recover either
the original email link or an already-opened localhost recovery address. Only
this project's verification links and approved callback origins are accepted;
the SDK validates the one-time token/session with the configured backend.
Never paste recovery tokens into chat, logs or tickets.

## Verified staging snapshot — 15 November 2026

Preview: https://ai-parlament-41w5txpwh-vas-projects-d1a401e4.vercel.app/login
Deployment: `dpl_CBg7vbj7rXNjZYT8mJuLAgHPZ4wX` (READY).

Ten regression tests, TypeScript/Vite build, and eleven live backend checks
passed. The synthetic callback check confirmed that Supabase returns to the
preview's reset page rather than localhost. Public tables have RLS; anonymous
bootstrap and authenticated access to the internal embedding RPC are denied.

Actual user password changes and an authenticated grant workflow have not been
verified by these automated checks. Model-provider credentials remain unverified;
the existing backend uses mock output without a matching provider key.

Backend migration/bootstrap instructions and environment ownership belong in
`../../docs/19-Deployment/GRANT_STUDIO_STAGING.md`.
