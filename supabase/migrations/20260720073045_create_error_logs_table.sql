/*
# Create error_logs table for application error logging

1. Purpose
   This table persists client-side errors so they can be reviewed later,
   forming the "error logging" pillar of the error handling strategy.
   It is intentionally single-tenant (no auth, no user_id) — the demo
   app has no sign-in screen, so every read/write runs as the `anon`
   role and the data is intentionally shared/public.

2. New Tables
   - `error_logs`
     - `id`            (uuid, primary key, auto-generated)
     - `kind`           (text, not null) — category: 'network' | 'api' | 'validation' | 'runtime' | 'unknown'
     - `message`        (text, not null) — user-facing message shown at the time of the error
     - `technical`      (text, nullable) — underlying technical detail (stack trace, response body, etc.)
     - `url`            (text, nullable) — page URL where the error occurred
     - `status`         (integer, nullable) — HTTP status code when applicable
     - `retryable`      (boolean, not null, default false) — whether the operation can be retried
     - `resolved`       (boolean, not null, default false) — marked resolved by a reviewer
     - `created_at`     (timestamptz, default now())

3. Security
   - Enable RLS on `error_logs`.
   - Allow anon + authenticated full CRUD because the data is intentionally
     shared/public in this single-tenant demo (no sign-in screen).

4. Indexes
   - `error_logs_created_at_idx` on `created_at` descending for recent-first listing.
   - `error_logs_kind_idx` on `kind` for filtering by category.

5. Important Notes
   - No `user_id` column: the app has no auth, so `auth.uid()` would be null
     and an `authenticated`-only policy would make the table unreadable.
   - `USING (true)` is acceptable here precisely because this is a
     single-tenant, no-auth, intentionally-public demo table.
*/

CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('network','api','validation','runtime','unknown')),
  message text NOT NULL,
  technical text,
  url text,
  status integer,
  retryable boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_error_logs" ON error_logs;
CREATE POLICY "anon_select_error_logs" ON error_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_error_logs" ON error_logs;
CREATE POLICY "anon_insert_error_logs" ON error_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_error_logs" ON error_logs;
CREATE POLICY "anon_update_error_logs" ON error_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_error_logs" ON error_logs;
CREATE POLICY "anon_delete_error_logs" ON error_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_kind_idx ON error_logs (kind);
