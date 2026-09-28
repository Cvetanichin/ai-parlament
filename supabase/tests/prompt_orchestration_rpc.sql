-- Run after local migrations and seed:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prompt_orchestration_rpc.sql
-- Read-only contract assertions. No production credentials.
begin;

do $$
declare
  bundle jsonb;
  rules jsonb;
  assets jsonb;
  prompt jsonb;
  workflow_id uuid;
begin
  if has_function_privilege('anon', 'public.rpc_get_active_routing_rules()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.rpc_get_active_routing_rules()', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.v_workflow_steps_expanded', 'SELECT')
  then
    raise exception 'Internal read models are exposed to client roles';
  end if;

  if not has_function_privilege('service_role', 'public.rpc_get_active_routing_rules()', 'EXECUTE')
    or not has_table_privilege('service_role', 'public.v_workflow_steps_expanded', 'SELECT')
  then
    raise exception 'service_role cannot read the helper layer';
  end if;

  rules := public.rpc_get_active_routing_rules();
  if jsonb_array_length(rules) <> 3 then
    raise exception 'Expected three seeded routing rules, got %', jsonb_array_length(rules);
  end if;
  if rules -> 0 ->> 'priority' is null then
    raise exception 'Routing priority missing';
  end if;

  select id into workflow_id from public.workflow_definitions
    where name = 'Prompt Orchestration - M&E Framework' and version = 1;
  bundle := public.rpc_get_workflow_bundle(workflow_id);
  if jsonb_array_length(bundle -> 'steps') <> 11 then
    raise exception 'M&E transition count or JSONB expansion changed';
  end if;
  if bundle -> 'steps' -> 0 ->> 'step_order' <> '1'
    or bundle -> 'steps' -> 0 ->> 'trigger' <> 'instance_created'
  then
    raise exception 'Transition order changed';
  end if;
  if public.rpc_get_workflow_bundle(gen_random_uuid()) is not null then
    raise exception 'Unknown workflow should return null';
  end if;

  prompt := public.rpc_get_prompt_module_by_key('intent_classifier');
  if prompt ->> 'agent_id' is null or prompt ->> 'prompt_module_id' is null
    or prompt ->> 'strict_output_enabled' <> 'true'
  then
    raise exception 'Active classifier prompt contract changed';
  end if;
  if public.rpc_get_prompt_module_by_key('not_registered') is not null then
    raise exception 'Unknown agent should return null';
  end if;

  assets := public.rpc_get_context_assets_for_domain(null);
  if not exists (
    select 1 from jsonb_array_elements(assets) as asset
    where asset ->> 'name' = 'Global Control'
  ) then
    raise exception 'Global Control is absent from global context';
  end if;
end $$;

set local role service_role;
do $$
begin
  if jsonb_array_length(public.rpc_get_active_routing_rules()) <> 3
    or (select count(*) from public.v_workflow_steps_expanded s
        join public.workflow_definitions w on w.id = s.workflow_definition_id
        where w.name like 'Prompt Orchestration - %') <> 17
    or public.rpc_get_context_assets_for_domain(null) -> 0 ->> 'name' <> 'Global Control'
  then
    raise exception 'Service-role helper contract failed';
  end if;
end $$;
reset role;

rollback;
