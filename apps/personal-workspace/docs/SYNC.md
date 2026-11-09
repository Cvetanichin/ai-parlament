# Sync and account (optional)

Adds sign-in and cross-device sync to the Personal Workspace. The app stays local-first: it works fully offline and without an account. Sync is a layer on top that you switch on in Settings.

## 1. What it does and does not do

| Does | Does not |
|---|---|
| Syncs tasks, projects, documents (with version history), calendar events, agent run history, custom agents and display settings | Sync your Anthropic API key, sign-in tokens, reminder bookkeeping or the notification preference |
| Works offline: changes queue and upload when you reconnect | Push while the page is closed (there is no background process) |
| Resolves conflicts per record, last write wins | Merge two edits to the same record (see limits) |
| Propagates deletes | Encrypt records end to end (see security) |
| Isolates every account with row-level security | Support magic-link or in-app password reset (use the project's existing reset flow) |

## 2. How it works

```
 device A ──┐                     ┌── Supabase Auth  (email + password)
            ├── HTTPS, fetch ─────┤
 device B ──┘  (no library)       └── PostgREST ── public.workspace_items (RLS)
                                                └─ rpc workspace_push()  (last-write-wins)
```

**Table** `public.workspace_items`, one row per record per user: `(user_id, kind, id)` is the key; `data` holds the record as JSON; `deleted` marks a tombstone; `client_updated_at` is the device's edit time (epoch ms); `server_updated_at` is set by the database on every write and is the pull cursor.

**Change detection (client).** Every save hashes each record (key-sorted JSON). A record whose hash changed, or that is new, is stamped with the current time and marked dirty. A record that disappeared becomes a tombstone. Because this runs on every save, the stamp is within a fraction of a second of the real edit.

**One sync cycle.** (1) detect local changes; (2) pull rows with `server_updated_at` at or after the cursor minus 10 seconds, in pages of 500, and apply them; (3) detect again; (4) push dirty records through `workspace_push` in batches. The 10-second overlap covers transactions that commit slightly out of timestamp order; applying a row twice is harmless.

**Applying a remote row.** Identical content is a no-op. If the local copy is newer (its stamp is later than the row's `client_updated_at`), the local copy is kept and its push wins. Otherwise the remote copy replaces the local one. A tie with different content goes to the remote copy.

**The server guard.** `workspace_push` only replaces a row when the incoming `client_updated_at` is at least the stored one, so a device that was offline for a week cannot overwrite newer work when it reconnects.

**First sync on a new device.** Before a device has completed its first pull it stamps its records with timestamp 1. Anything already in the cloud therefore wins, and genuinely new local records still upload. This is what stops a fresh install's default settings from overwriting your customised ones.

**Deterministic ids.** Calendar events, and tasks created from them, get ids derived from the event's UID and date, so importing the same `.ics` on two devices does not create duplicates.

**Triggers.** Sign-in, four seconds after a change, when the page regains focus, when the browser comes back online, and every minute if anything is pending or the last sync is over five minutes old. "Sync now" is in Settings.

## 3. One-time setup

You need a Supabase project. The app works with any project that has migration 26 applied.

**Which project?** The repository's own project (`zfadrhpnhejzbpnfizxu`) works. Be aware that it shares its user list with the Parliament platform: creating an account in the workspace creates a user there, and the existing signup trigger adds a `profiles` row for it. The workspace table is separate and each user sees only their own rows. If you prefer clean separation, create a second free project and apply the same migration; nothing else changes.

1. **Apply the migration** `supabase/migrations/20261109120000_26_personal_workspace_sync.sql`. Either:
   - Dashboard: SQL Editor, paste the file, Run; or
   - CLI: `supabase link --project-ref <ref>` then `supabase db push` (asks for the database password).
2. **Run the test** (recommended, same editor or `psql`): `supabase/tests/personal_workspace_sync.sql`. It runs in a transaction and rolls back. It prints a notice on success and raises an error on any failure.
3. **Find the two values** in Project Settings, API: the project URL and the publishable key (`sb_publishable_...`) or the legacy `anon` key. Both are designed to be public; row-level security is what protects the data. Never use the `service_role` key here.
4. **Check Auth settings**: Authentication, Providers, Email must be enabled. If "Confirm email" is on, new accounts must click the link in their email before the first sign-in.
5. In the app: Settings, Sync and account. Enter the URL and key, then Sign in or Create account. The first sync starts at once.

The repository's `.mcp.json` connects the Supabase tools read-only, so a coding session cannot apply it through that connection. For `cso-playground` it was applied on 2026-11-09 (section 6); for any other project, step 1 is yours to run.

## 4. Security

| Concern | Control |
|---|---|
| One user reading another's records | RLS on `workspace_items`: every policy is `user_id = (select auth.uid())`; the table is revoked from `anon` and `public`; tests cover cross-user read, update, delete and forged insert |
| Forged or spoofed metadata | `server_updated_at` and `user_id` are set or fixed by a trigger; the client cannot choose them |
| Stale device overwriting newer work | Last-write-wins guard inside `workspace_push` |
| Abuse and runaway clients | Allowed kinds, id pattern, 2 MiB per record, 500 items per call, 50,000 rows per user; unauthenticated calls refused; execute revoked from `anon` |
| Secrets in sync | The API key and tokens are excluded from synced data and from backups; a test scans everything the server received |
| Token theft | Tokens are kept in this browser's IndexedDB like the API key. Anyone with access to the browser profile can use them. Sign out on shared computers |
| Cloud copy readable by project admins | **Records are stored in plain text.** Anyone with admin or service-role access to the project can read them. Do not sync client-confidential material unless that is acceptable under your agreements. End-to-end encryption is the planned next step (section 7) |

The workspace calls only the project URL you enter. It accepts `https://` URLs, and `http://` only for `localhost`.

## 5. Behaviour to know about

- **Concurrent edits to one record: the later edit wins as a whole.** If you edit the same document on two devices before either syncs, the earlier device's changes to it are replaced, including any new versions it saved. Document history on the winning side is intact. Tasks and projects are small, so this rarely matters; for documents, sync before switching device.
- **Settings sync as one record.** Changing the theme on one device and the working hours on another within the same window keeps only the later change.
- **Device clocks decide "later".** A clock that is minutes wrong can make an older edit win. Keep automatic time on.
- **Restoring a backup while signed in** uploads the backup as the newest version. Records that are not in the backup return from the cloud on the next sync.
- **Erase everything** clears this device and signs it out; the cloud copy stays. **Delete cloud data** removes the cloud copy, keeps this device's data and switches automatic sync off, so nothing re-uploads until you turn it back on.
- **Switching accounts on one browser** asks before uploading the existing local data to the new account.
- Deletions are tombstones and are never purged; they hold no content.
- A record over about 1.9 MB is not synced and stays local; the status line says so.

## 6. Testing

| Test | What it proves | Run |
|---|---|---|
| `supabase/tests/personal_workspace_sync.sql` | Privileges, isolation, last-write-wins, tombstones, cursor, validation limits | `psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personal_workspace_sync.sql` |
| `apps/personal-workspace/tests/sync.cjs` | Three browsers against an in-memory fake of Auth and PostgREST: convergence, deletes, conflicts in both directions, offline queue, token refresh, 401 retry, automatic sync, account isolation, no secrets sent | `NODE_PATH=$(npm root -g) node tests/sync.cjs` |

Verification status:

- **Local:** the SQL ran and passed on PGlite (Postgres in WebAssembly) with stand-ins for the Supabase roles and `auth` schema, and was shown to fail when the last-write-wins guard, RLS, the anon revoke or tombstone clearing were removed. The browser test passes and was shown to fail when the newer-wins rule or the first-sync rule was removed.
- **Applied (2026-11-09):** migration 26 was applied to the `cso-playground` project (`zfadrhpnhejzbpnfizxu`) as `26_personal_workspace_sync`. Checked afterwards: RLS on, four policies all for `authenticated`, `anon` has no table privilege and cannot call the RPC, the trigger is enabled, both functions are `SECURITY INVOKER` with an empty search path. `supabase/tests/personal_workspace_sync.sql` passed on that database inside a rolled-back transaction, and a follow-up query confirmed it left no users, profiles or rows behind. The security advisor reported nothing about the new objects.
- **Not yet done:** a real sign-in and a real sync between two browsers against that project. The browser test uses a fake backend, so this is the first end-to-end check of the client against real Supabase Auth and PostgREST. Do it once before relying on sync.

The migration was applied through the Supabase tooling, so the remote history records its own timestamp (`20261109110904`) rather than the file's (`20261109120000`), as with earlier migrations in this repository.

## 7. Roadmap

| Priority | Item | Why |
|---|---|---|
| 1 | End-to-end encryption of `data` with a passphrase-derived key (AES-GCM, key never leaves devices) | Removes the plain-text-in-the-cloud caveat; the server cannot read content, search stays local |
| 2 | Per-field or per-version merge for documents | Removes the whole-record replacement on concurrent edits |
| 3 | Server-time offset for stamps | Removes dependence on device clocks |
| 4 | Magic-link sign-in and in-app password reset | Needs redirect URLs configured on the project |

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Invalid API key" | Wrong or truncated key | Copy the publishable key again from Project Settings, API |
| "Could not reach the project URL" | Typo in URL, offline, or blocker | Check the URL (`https://<ref>.supabase.co`), allow the domain |
| "Invalid login credentials" | Wrong password, or unconfirmed email | Confirm the email, or reset the password through the platform's forgot-password page |
| "Check your email to confirm" after Create account | Email confirmation is on | Click the link, then Sign in |
| Sync error mentioning `workspace_push` or `workspace_items` | Migration 26 not applied to this project | Apply it (section 3) |
| "Session expired. Sign in again." | Refresh token revoked or password changed | Sign in again; local data is untouched |
| A change did not arrive on the other device | Other page is closed or offline | Open it, or press Sync now |
| Pending count never reaches zero | Persistent server error | Read the status line, fix the cause; changes stay queued |

## 9. Rollback

In the app: Sign out, or switch automatic sync off. Nothing on the device is lost. In the database:

```sql
drop function public.workspace_push(jsonb);
drop table public.workspace_items;
drop function public.workspace_items_before_write();
```
