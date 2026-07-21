-- Notification Engine — Vault-backed secret storage for
-- notification_channels.config (Security spec §5, ADR-0010's "narrow
-- gateway" pattern applied here to Vault instead of an LLM provider):
-- the sensitive part of a channel's config (webhook URL, SMTP password)
-- is never written to the plain jsonb `config` column directly. This
-- SECURITY DEFINER function is the sole write path into `vault.secrets`
-- for notification channels — PostgREST cannot call functions in the
-- `vault` schema directly (it only exposes `public` by default), so this
-- wraps vault.create_secret/vault.update_secret and, in the same
-- transaction, points notification_channels.config_secret_id at the
-- result. Restricted to service_role only: this is invoked exclusively
-- from notification-channel-upsert-run (an Edge Function, always
-- service-role), never directly by an authenticated end-user client.
create or replace function public.notification_channel_set_secret(p_channel_id uuid, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_secret_id uuid;
  v_secret_id uuid;
begin
  select config_secret_id into v_existing_secret_id
  from public.notification_channels
  where id = p_channel_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_secret);
    v_secret_id := v_existing_secret_id;
  else
    v_secret_id := vault.create_secret(p_secret, 'notification_channel:' || p_channel_id::text);
    update public.notification_channels set config_secret_id = v_secret_id where id = p_channel_id;
  end if;

  return v_secret_id;
end;
$$;

revoke all on function public.notification_channel_set_secret(uuid, text) from public;
grant execute on function public.notification_channel_set_secret(uuid, text) to service_role;

-- Read-side companion: returns the decrypted secret for a channel, again
-- service_role only (notification-dispatch-run's delivery step). Never
-- exposed to authenticated directly — a client-facing channel read must
-- only ever see config_secret_id's existence, never the plaintext
-- (Security spec §5: "never plaintext" at the read API).
create or replace function public.notification_channel_get_secret(p_channel_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select config_secret_id into v_secret_id
  from public.notification_channels
  where id = p_channel_id;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_secret_id;
  return v_secret;
end;
$$;

revoke all on function public.notification_channel_get_secret(uuid) from public;
grant execute on function public.notification_channel_get_secret(uuid) to service_role;
