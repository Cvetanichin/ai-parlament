-- Repo-hygiene capture: this migration was applied directly to
-- urhocsijfzkepebsmstx (cso-playground) on 2026-07-20 without a
-- corresponding committed file. This file backfills that gap so the
-- migration history in git matches the live database exactly.
--
-- Purpose: consolidate every public-schema RLS policy onto the
-- Supabase performance-advisor pattern -- wrap auth.uid() as
-- `(select auth.uid())` so it evaluates once per query instead of
-- once per row -- without changing any policy's authorization logic.
-- Reconstructed verbatim from pg_policies on the live database; this
-- is a historical record, not intended to be re-run (every statement
-- is a DROP POLICY IF EXISTS followed by an equivalent CREATE POLICY).

drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists agent_runs_delete on public.agent_runs;
create policy agent_runs_delete on public.agent_runs for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists agent_runs_insert on public.agent_runs;
create policy agent_runs_insert on public.agent_runs for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists agent_runs_update on public.agent_runs;
create policy agent_runs_update on public.agent_runs for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists ai_agents_select on public.ai_agents;
create policy ai_agents_select on public.ai_agents for SELECT to authenticated using (true);

drop policy if exists ai_app_register_select on public.ai_app_register;
create policy ai_app_register_select on public.ai_app_register for SELECT to authenticated using (((organisation_id IS NULL) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists budgets_insert on public.budgets;
create policy budgets_insert on public.budgets for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists budgets_update on public.budgets;
create policy budgets_update on public.budgets for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for DELETE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = created_by));

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for UPDATE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists compliance_findings_insert on public.compliance_findings;
create policy compliance_findings_insert on public.compliance_findings for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists compliance_findings_select on public.compliance_findings;
create policy compliance_findings_select on public.compliance_findings for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists cost_rollups_select on public.cost_rollups;
create policy cost_rollups_select on public.cost_rollups for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists deliverables_delete on public.deliverables;
create policy deliverables_delete on public.deliverables for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists deliverables_insert on public.deliverables;
create policy deliverables_insert on public.deliverables for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists deliverables_update on public.deliverables;
create policy deliverables_update on public.deliverables for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists donors_insert on public.donors;
create policy donors_insert on public.donors for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists donors_select on public.donors;
create policy donors_select on public.donors for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists donors_update on public.donors;
create policy donors_update on public.donors for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists eligibility_reports_insert on public.eligibility_reports;
create policy eligibility_reports_insert on public.eligibility_reports for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists eligibility_reports_select on public.eligibility_reports;
create policy eligibility_reports_select on public.eligibility_reports for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists indicators_delete on public.indicators;
create policy indicators_delete on public.indicators for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists indicators_insert on public.indicators;
create policy indicators_insert on public.indicators for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists indicators_select on public.indicators;
create policy indicators_select on public.indicators for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists indicators_update on public.indicators;
create policy indicators_update on public.indicators for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert on public.knowledge_chunks for INSERT to authenticated with check ((knowledge_document_id IN ( SELECT knowledge_documents.id
   FROM knowledge_documents
  WHERE (knowledge_documents.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select on public.knowledge_chunks for SELECT to authenticated using ((knowledge_document_id IN ( SELECT knowledge_documents.id
   FROM knowledge_documents
  WHERE (knowledge_documents.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists knowledge_document_links_insert on public.knowledge_document_links;
create policy knowledge_document_links_insert on public.knowledge_document_links for INSERT to authenticated with check ((knowledge_document_id IN ( SELECT knowledge_documents.id
   FROM knowledge_documents
  WHERE (knowledge_documents.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists knowledge_document_links_select on public.knowledge_document_links;
create policy knowledge_document_links_select on public.knowledge_document_links for SELECT to authenticated using ((knowledge_document_id IN ( SELECT knowledge_documents.id
   FROM knowledge_documents
  WHERE (knowledge_documents.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert on public.knowledge_documents for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists knowledge_documents_select on public.knowledge_documents;
create policy knowledge_documents_select on public.knowledge_documents for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists knowledge_documents_update on public.knowledge_documents;
create policy knowledge_documents_update on public.knowledge_documents for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists logframe_narratives_insert on public.logframe_narratives;
create policy logframe_narratives_insert on public.logframe_narratives for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists logframe_narratives_select on public.logframe_narratives;
create policy logframe_narratives_select on public.logframe_narratives for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists logframe_narratives_update on public.logframe_narratives;
create policy logframe_narratives_update on public.logframe_narratives for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists memory_entries_select on public.memory_entries;
create policy memory_entries_select on public.memory_entries for SELECT to authenticated using (((tier = 'institutional'::text) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists notification_channels_insert on public.notification_channels;
create policy notification_channels_insert on public.notification_channels for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists notification_channels_select on public.notification_channels;
create policy notification_channels_select on public.notification_channels for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists notification_channels_update on public.notification_channels;
create policy notification_channels_update on public.notification_channels for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists notification_rules_insert on public.notification_rules;
create policy notification_rules_insert on public.notification_rules for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists notification_rules_select on public.notification_rules;
create policy notification_rules_select on public.notification_rules for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists organisation_members_select on public.organisation_members;
create policy organisation_members_select on public.organisation_members for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists organisations_select on public.organisations;
create policy organisations_select on public.organisations for SELECT to authenticated using ((id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists partners_insert on public.partners;
create policy partners_insert on public.partners for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists partners_update on public.partners;
create policy partners_update on public.partners for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists platform_events_select on public.platform_events;
create policy platform_events_select on public.platform_events for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles for UPDATE to public using ((id = ( SELECT auth.uid() AS uid)));

drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile" on public.profiles for SELECT to public using ((id = ( SELECT auth.uid() AS uid)));

drop policy if exists project_documents_delete on public.project_documents;
create policy project_documents_delete on public.project_documents for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists project_documents_insert on public.project_documents;
create policy project_documents_insert on public.project_documents for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists project_documents_update on public.project_documents;
create policy project_documents_update on public.project_documents for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for DELETE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = created_by));

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for UPDATE to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists prompt_modules_select on public.prompt_modules;
create policy prompt_modules_select on public.prompt_modules for SELECT to authenticated using (true);

drop policy if exists proposal_sections_insert on public.proposal_sections;
create policy proposal_sections_insert on public.proposal_sections for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists proposal_sections_select on public.proposal_sections;
create policy proposal_sections_select on public.proposal_sections for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists proposal_sections_update on public.proposal_sections;
create policy proposal_sections_update on public.proposal_sections for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists proposals_update on public.proposals;
create policy proposals_update on public.proposals for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists regulatory_clauses_select on public.regulatory_clauses;
create policy regulatory_clauses_select on public.regulatory_clauses for SELECT to authenticated using (true);

drop policy if exists regulatory_documents_select on public.regulatory_documents;
create policy regulatory_documents_select on public.regulatory_documents for SELECT to authenticated using (true);

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists risks_delete on public.risks;
create policy risks_delete on public.risks for DELETE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists risks_insert on public.risks;
create policy risks_insert on public.risks for INSERT to authenticated with check ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))));

drop policy if exists risks_select on public.risks;
create policy risks_select on public.risks for SELECT to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists risks_update on public.risks;
create policy risks_update on public.risks for UPDATE to authenticated using (((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.created_by = ( SELECT auth.uid() AS uid)))) OR (organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists submission_packages_insert on public.submission_packages;
create policy submission_packages_insert on public.submission_packages for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists submission_packages_select on public.submission_packages;
create policy submission_packages_select on public.submission_packages for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists workflow_definitions_select on public.workflow_definitions;
create policy workflow_definitions_select on public.workflow_definitions for SELECT to authenticated using (true);

drop policy if exists workflow_instance_history_insert on public.workflow_instance_history;
create policy workflow_instance_history_insert on public.workflow_instance_history for INSERT to authenticated with check ((workflow_instance_id IN ( SELECT workflow_instances.id
   FROM workflow_instances
  WHERE (workflow_instances.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists workflow_instance_history_select on public.workflow_instance_history;
create policy workflow_instance_history_select on public.workflow_instance_history for SELECT to authenticated using ((workflow_instance_id IN ( SELECT workflow_instances.id
   FROM workflow_instances
  WHERE (workflow_instances.organisation_id IN ( SELECT organisation_members.organisation_id
           FROM organisation_members
          WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists workflow_instances_insert on public.workflow_instances;
create policy workflow_instances_insert on public.workflow_instances for INSERT to authenticated with check ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists workflow_instances_select on public.workflow_instances;
create policy workflow_instances_select on public.workflow_instances for SELECT to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));

drop policy if exists workflow_instances_update on public.workflow_instances;
create policy workflow_instances_update on public.workflow_instances for UPDATE to authenticated using ((organisation_id IN ( SELECT organisation_members.organisation_id
   FROM organisation_members
  WHERE (organisation_members.user_id = ( SELECT auth.uid() AS uid)))));
