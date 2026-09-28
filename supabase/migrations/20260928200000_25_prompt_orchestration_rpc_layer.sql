-- Internal read models and RPC helpers for the Prompt Orchestration runner.
-- See docs/12-APIs/Prompt-Orchestration-RPC-Contract.md.
-- The service-role Edge Function authenticates the project caller before use.

create view public.v_workflows_expanded
with (security_invoker = true) as
select
  w.id as workflow_definition_id,
  w.name,
  w.version,
  w.states,
  w.transitions,
  w.vote_of_no_confidence_threshold,
  w.gates
from public.workflow_definitions as w;

create view public.v_workflow_steps_expanded
with (security_invoker = true) as
select
  w.id as workflow_definition_id,
  step.ordinality::integer as step_order,
  step.transition ->> 'from' as from_state,
  step.transition ->> 'to' as to_state,
  step.transition ->> 'trigger' as trigger,
  step.transition ->> 'agentSlug' as agent_slug,
  step.transition ->> 'outputKey' as output_key,
  step.transition
from public.workflow_definitions as w
cross join lateral jsonb_array_elements(w.transitions)
  with ordinality as step(transition, ordinality);

create view public.v_routing_rules_expanded
with (security_invoker = true) as
select
  r.id as rule_id,
  r.rule_name,
  r.priority,
  r.match_logic_json,
  r.selected_workflow_definition_id,
  r.specialist_override_agent_id,
  r.validator_override_agent_id,
  r.formatter_override_agent_id,
  r.active
from public.routing_rules as r;

revoke all on public.v_workflows_expanded from public, anon, authenticated;
revoke all on public.v_workflow_steps_expanded from public, anon, authenticated;
revoke all on public.v_routing_rules_expanded from public, anon, authenticated;
grant select on public.v_workflows_expanded to service_role;
grant select on public.v_workflow_steps_expanded to service_role;
grant select on public.v_routing_rules_expanded to service_role;

create function public.rpc_get_workflow_bundle(p_workflow_definition_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'workflow', jsonb_build_object(
      'id', w.workflow_definition_id,
      'name', w.name,
      'version', w.version,
      'states', w.states,
      'vote_of_no_confidence_threshold', w.vote_of_no_confidence_threshold,
      'gates', w.gates
    ),
    'steps', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'step_order', s.step_order,
          'from_state', s.from_state,
          'to_state', s.to_state,
          'trigger', s.trigger,
          'agent_slug', s.agent_slug,
          'output_key', s.output_key,
          'transition', s.transition
        ) order by s.step_order
      )
      from public.v_workflow_steps_expanded as s
      where s.workflow_definition_id = w.workflow_definition_id
    ), '[]'::jsonb)
  )
  from public.v_workflows_expanded as w
  where w.workflow_definition_id = p_workflow_definition_id
$$;

create function public.rpc_get_prompt_module_by_key(p_agent_slug text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'agent_id', a.id,
    'prompt_module_id', p.id,
    'model_provider', p.model_provider,
    'model_name', p.model_name,
    'strict_output_enabled', p.strict_output_enabled,
    'output_schema_json', p.output_schema_json
  )
  from public.ai_agents as a
  join public.prompt_modules as p on p.agent_id = a.id
  where a.slug = p_agent_slug and p.status = 'active'
$$;

create function public.rpc_get_context_assets_for_domain(p_domain text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'context_type', c.context_type,
      'domain', c.domain,
      'content', c.content,
      'content_json', c.content_json,
      'source_reference', c.source_reference
    ) order by c.name, c.id
  ), '[]'::jsonb)
  from public.context_assets as c
  where c.active
    and (cardinality(c.domain) = 0
      or (p_domain is not null and p_domain = any(c.domain)))
$$;

create function public.rpc_get_active_routing_rules()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.rule_id,
      'rule_name', r.rule_name,
      'priority', r.priority,
      'match_logic_json', r.match_logic_json,
      'selected_workflow_definition_id', r.selected_workflow_definition_id,
      'specialist_override_agent_id', r.specialist_override_agent_id,
      'validator_override_agent_id', r.validator_override_agent_id,
      'formatter_override_agent_id', r.formatter_override_agent_id
    ) order by r.priority, r.rule_id
  ), '[]'::jsonb)
  from public.v_routing_rules_expanded as r
  where r.active
$$;

revoke execute on function public.rpc_get_workflow_bundle(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_get_prompt_module_by_key(text) from public, anon, authenticated;
revoke execute on function public.rpc_get_context_assets_for_domain(text) from public, anon, authenticated;
revoke execute on function public.rpc_get_active_routing_rules() from public, anon, authenticated;
grant execute on function public.rpc_get_workflow_bundle(uuid) to service_role;
grant execute on function public.rpc_get_prompt_module_by_key(text) to service_role;
grant execute on function public.rpc_get_context_assets_for_domain(text) to service_role;
grant execute on function public.rpc_get_active_routing_rules() to service_role;
