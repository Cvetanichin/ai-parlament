-- Match the existing Grant Studio staging security boundary on fresh stacks.
-- Migration 21 re-granted internal functions; restore their original scope.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.apply_embedding_batch(text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_embedding_batch(text, text, timestamptz, jsonb)
  to service_role;

-- The error-handling demo's public logging policies are not suitable for the
-- shared platform. Hosted staging already has no client-facing log policies.
drop policy if exists "anon_select_error_logs" on public.error_logs;
drop policy if exists "anon_insert_error_logs" on public.error_logs;
drop policy if exists "anon_update_error_logs" on public.error_logs;
drop policy if exists "anon_delete_error_logs" on public.error_logs;
revoke all on public.error_logs from anon, authenticated;
grant all on public.error_logs to service_role;
