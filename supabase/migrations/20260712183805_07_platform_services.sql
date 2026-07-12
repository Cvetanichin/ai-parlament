alter table public.prompt_modules add column author_id uuid references auth.users(id);
alter table public.prompt_modules add column approval_state text not null default 'draft'
  check (approval_state in ('draft','pending_review','approved','deprecated'));
alter table public.prompt_modules add column variables jsonb default '[]';
alter table public.prompt_modules add column test_cases jsonb default '[]';
alter table public.prompt_modules add column rolled_back_from uuid references public.prompt_modules(id);
create unique index prompt_modules_one_active_per_agent
  on public.prompt_modules (agent_id) where (status = 'active');

create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('institutional','organisation','project','proposal','working')),
  scope_id uuid,
  organisation_id uuid references public.organisations(id),
  content text not null,
  content_type text not null default 'fact' check (content_type in ('fact','decision','preference','risk_pattern')),
  embedding extensions.vector(1536),
  confidence numeric check (confidence between 0 and 1),
  source_agent_run_id uuid references public.agent_runs(id),
  superseded_by uuid references public.memory_entries(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index on public.memory_entries using hnsw (embedding extensions.vector_cosine_ops);
create index on public.memory_entries (tier, scope_id);
alter table public.memory_entries enable row level security;
create policy "memory_entries_select" on public.memory_entries for select
  to authenticated using (
    tier = 'institutional' or organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid())
    )
  );
revoke update on public.memory_entries from authenticated;

create table public.platform_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
  source_service text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.platform_events (organisation_id, event_type, created_at);
alter table public.platform_events enable row level security;
create policy "platform_events_select" on public.platform_events for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())
  ));
revoke update, delete on public.platform_events from authenticated;

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  user_id uuid references auth.users(id),
  channel_type text not null check (channel_type in ('email','slack','teams','push')),
  config jsonb not null,
  active boolean not null default true
);
alter table public.notification_channels enable row level security;
create policy "notification_channels_select" on public.notification_channels for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "notification_channels_insert" on public.notification_channels for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "notification_channels_update" on public.notification_channels for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
  channel_id uuid not null references public.notification_channels(id),
  delivery_mode text not null default 'immediate' check (delivery_mode in ('immediate','daily_digest','weekly_digest'))
);
alter table public.notification_rules enable row level security;
create policy "notification_rules_select" on public.notification_rules for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "notification_rules_insert" on public.notification_rules for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  platform_event_id uuid references public.platform_events(id),
  channel_id uuid not null references public.notification_channels(id),
  status text not null check (status in ('sent','failed','suppressed_digest_pending')),
  sent_at timestamptz,
  error_message text
);
alter table public.notification_log enable row level security;
create policy "notification_log_select" on public.notification_log for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
revoke update, delete on public.notification_log from authenticated;
