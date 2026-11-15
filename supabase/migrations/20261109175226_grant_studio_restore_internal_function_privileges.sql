-- Restore restrictions overwritten by migration 21's blanket grants.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.apply_embedding_batch(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_embedding_batch(text, text, timestamptz, jsonb) to service_role;
