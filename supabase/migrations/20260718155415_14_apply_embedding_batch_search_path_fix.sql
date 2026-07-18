-- Fix apply_embedding_batch (13_embedding_pipeline_support.sql): the function
-- was created with `set search_path = public`, but the `vector` type lives
-- in the `extensions` schema (per ADR-0006/0007's convention of keeping
-- extensions out of `public`). The `(r->>'embedding')::vector` cast inside
-- the function body therefore failed with `type "vector" does not exist`
-- on every real invocation — a latent bug never exercised until the first
-- successful embedding-pipeline-run backfill (18 Jul 2026), because every
-- prior invocation had already failed earlier at the OpenAI API call step
-- (bad/placeholder key, then billing) before ever reaching this RPC.
--
-- Fix: add `extensions` to the function's search_path. No signature or
-- behavioural change otherwise.

alter function public.apply_embedding_batch(text, text, timestamptz, jsonb)
  set search_path = public, extensions;

-- pg_net, enabled on staging this session to invoke embedding-pipeline-run
-- directly from Postgres (net.http_post) when outbound HTTPS to the
-- project's own functions URL wasn't reachable from the calling
-- environment. Already installed on production — this brings staging back
-- into parity rather than introducing new drift.
create extension if not exists pg_net with schema extensions;
