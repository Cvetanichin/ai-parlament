-- Local-dev-only dummy data. Deliberately lives in supabase/seed.sql, NOT a
-- numbered migration: seed.sql only ever runs on `supabase start`/`db reset`
-- against the local stack — it can never ride along into a staging/
-- production migration promotion (ADR-0007), unlike anything under
-- supabase/migrations/. Applied after all schema migrations.
--
-- Fictional demo organisation ("Riverside Civil Society Alliance") and
-- fictional project/donor/opportunity data throughout — chosen specifically
-- to be unmistakable as synthetic, never confusable with the real
-- production data mentioned in this project's own history (the real "HERA
-- VOL 2" project on the live Supabase project).
--
-- Deliberately NOT seeded here: regulatory_documents / regulatory_clauses /
-- compliance_findings. Every compliance verdict in this codebase must
-- trace to a real, cited rule (Grant Studio §3) — those three tables stay
-- empty until real PRAG/Annex source text is supplied and run through
-- regulatory-document-ingest-run. Seeding plausible-looking rule text here
-- would make Eligibility/Budget/Compliance checks look tested while
-- actually testing against fiction.
--
-- Login credentials for exercising the frontend (all password:
-- DemoPassword123!):
--   owner@demo.quorum.test   — organisation_members.role = 'owner'
--   admin@demo.quorum.test   — role = 'admin', profiles.is_platform_operator = true
--                              (MFA is NOT enrolled — House of Parliament /
--                              GDPR-erasure-gated actions still need real
--                              TOTP enrollment through the UI/API, which a
--                              plain SQL seed can't do)
--   member@demo.quorum.test  — role = 'member'
--
-- ID scheme: fixed UUIDs, last 12 hex digits only, grouped by entity so
-- cross-references below are easy to follow: users =...0000000000a1-a3,
-- clients =...0201-0202, donors =...0301-0303, opportunities =...0401-0406,
-- proposals =...0501-0503, budgets =...0601-0602, partners =...0701-0703,
-- projects =...0801-0802, notification channel =...0901.

-- ---------------------------------------------------------------------
-- Auth users (auth.users + auth.identities) — minimal valid GoTrue rows.
-- ---------------------------------------------------------------------
-- confirmation_token/recovery_token/email_change_token_new/email_change are
-- nullable at the DB level but GoTrue's own Go struct scans them as plain
-- strings, not nullable — a NULL here breaks every future login with
-- "converting NULL to string is unsupported" (confirmed via
-- `docker logs supabase_auth_...`), not just an RLS/permissions issue.
-- Explicit '' avoids that; the other similar columns already default to ''
-- at the schema level and don't need repeating here.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner@demo.quorum.test', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"email_verified":true}', false, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'admin@demo.quorum.test', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"email_verified":true}', false, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'member@demo.quorum.test', crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"email_verified":true}', false, now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"owner@demo.quorum.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"admin@demo.quorum.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"member@demo.quorum.test"}', 'email', now(), now(), now())
on conflict (provider, provider_id) do nothing;

insert into public.profiles (id, is_platform_operator)
values
  ('00000000-0000-0000-0000-0000000000a1', false),
  ('00000000-0000-0000-0000-0000000000a2', true),
  ('00000000-0000-0000-0000-0000000000a3', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Organisation + membership.
-- ---------------------------------------------------------------------
insert into public.organisations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Riverside Civil Society Alliance (Demo)')
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'member')
on conflict (organisation_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- Clients + donors.
-- ---------------------------------------------------------------------
insert into public.clients (id, organisation_id, name, areas_of_interest, created_by)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Riverside Youth Network', 'Youth empowerment, digital literacy', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'Delta Women''s Cooperative', 'Gender equality, livelihoods', '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.donors (id, organisation_id, name, official_website, region, funder_type, donor_status, pipeline_stage, priority, relevance, areas_of_interest, relationship_owner)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'European Union — DG NEAR (Demo)', 'https://example.org/dg-near', 'EU', 'institutional', 'current_donor', 'monitoring', 'high', 'high', 'civil society, rule of law', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'UNDP Regional Hub (Demo)', 'https://example.org/undp', 'Global', 'multilateral', 'warm_prospect', 'engaging', 'medium', 'medium', 'governance, youth', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 'Nordic Solidarity Fund (Demo)', 'https://example.org/nordic-fund', 'Nordic', 'foundation', 'cold_prospect', 'identified', 'medium', 'medium', 'gender, livelihoods', '00000000-0000-0000-0000-0000000000a3')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Opportunities (Opportunity Intelligence). Narrative/score fields are
-- plausible synthetic Ministry output — advisory business content, not
-- compliance rule text, so none of this touches the anti-fabrication
-- boundary that regulatory_clauses/compliance_findings must respect.
-- ---------------------------------------------------------------------
insert into public.opportunities (
  id, organisation_id, donor_id, external_id, cluster, is_new, title, description, tags, region,
  funding_type, application_type, amount_min, amount_max, currency, deadline, status,
  strategic_narrative, risk_score, relevance_score, flags, version
) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'demo-ext-001', 'civil-society', false, 'Civil Society Resilience Call 2026', 'Support for CSO institutional capacity and civic space.', ARRAY['civil-society','capacity-building'], 'EU', 'grant', 'full_application', 80000, 300000, 'EUR', current_date + interval '90 days', 'open', 'Strong fit with our youth and governance track record; deadline gives comfortable runway.', 25, 82, '[]', 1),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'demo-ext-002', 'youth', true, 'Youth Digital Futures Fund', 'Digital literacy and youth employability programming.', ARRAY['youth','digital-literacy'], 'Global', 'grant', 'concept_note', 40000, 120000, 'USD', current_date + interval '45 days', 'open', 'Good alignment; concept-note-only stage lowers upfront drafting cost.', 30, 74, '[]', 1),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', 'demo-ext-003', 'gender', false, 'Women''s Economic Empowerment Grant', 'Livelihoods and cooperative development for women.', ARRAY['gender','livelihoods'], 'Nordic', 'grant', 'full_application', 50000, 150000, 'EUR', current_date + interval '120 days', 'forthcoming', 'Directly matches Delta Women''s Cooperative''s existing programming.', 35, 79, '[]', 1),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'demo-ext-004', 'civil-society', false, 'Rule of Law Partnership Facility', 'Legal aid and rule-of-law monitoring.', ARRAY['rule-of-law','monitoring'], 'EU', 'grant', 'full_application', 100000, 400000, 'EUR', current_date + interval '10 days', 'rolling', 'Very short runway remaining — flagged as time-pressured.', 65, 55, '["short_deadline"]', 1),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'demo-ext-005', 'governance', false, 'Local Governance Innovation Award', 'Municipal-level governance innovation pilots.', ARRAY['governance','local'], 'Global', 'grant', 'full_application', 20000, 60000, 'USD', current_date - interval '5 days', 'closed', 'Deadline has passed — retained for institutional record only.', 20, 60, '[]', 1),
  ('00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', 'demo-ext-006', 'gender', true, 'Gender-Responsive Budgeting Initiative', 'Technical assistance for gender-responsive public budgeting.', ARRAY['gender','budgeting'], 'Nordic', 'technical_assistance', 'full_application', 30000, 90000, 'EUR', current_date + interval '60 days', 'open', 'Niche fit — worth Research sign-off before committing drafting time.', 45, 58, '[]', 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Proposals + sections (pre-award).
-- ---------------------------------------------------------------------
insert into public.proposals (id, organisation_id, opportunity_id, client_id, stage, status, version)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 'full_application', 'draft', 1),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000201', 'concept_note', 'draft', 1),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000202', 'full_application', 'draft', 1)
on conflict (id) do nothing;

insert into public.proposal_sections (organisation_id, proposal_id, section_key, content)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'problem_analysis', 'This project addresses the widening civic space gap facing youth-led organisations in Riverside district. Our approach directly incorporates community consultation throughout implementation, ensuring beneficiary voice shapes every activity.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'methodology', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000502', 'problem_analysis', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000503', 'problem_analysis', 'Delta Women''s Cooperative members report persistent barriers to formal credit access. This proposal directly incorporates cooperative-led savings mechanisms throughout implementation, building on five years of demonstrated cooperation.')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Budgets.
-- ---------------------------------------------------------------------
insert into public.budgets (id, organisation_id, proposal_id, line_items, indirect_cost_rate, currency)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501',
    '[{"category":"staff","description":"Project Coordinator (12 months)","amount":24000},{"category":"staff","description":"Field Officer (12 months)","amount":15000},{"category":"travel","description":"Local field visits","amount":3000},{"category":"equipment","description":"Laptops and field kits","amount":4500}]'::jsonb,
    7, 'EUR'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000503',
    '[{"category":"staff","description":"Cooperative Development Officer","amount":18000},{"category":"grants_to_third_parties","description":"Cooperative seed capital sub-grants","amount":40000}]'::jsonb,
    10, 'EUR')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Partners (Consortium Builder).
-- ---------------------------------------------------------------------
insert into public.partners (id, organisation_id, proposal_id, legal_name, role, lef_status, fif_status, due_diligence_status, subcontract_value, performance_rating)
values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'Riverside Legal Aid Trust', 'co_applicant', 'valid', 'valid', 'passed', 22000, 4),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000503', 'Delta Microfinance Partners', 'associate', 'valid', 'pending', 'passed', 8000, null),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000001', null, 'Northbridge Vendor Services', 'associate', null, null, 'not_started', null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Projects (post-award) + indicators/activities/risks/documents.
-- ---------------------------------------------------------------------
insert into public.projects (id, organisation_id, client_id, name, domain, status, start_date, end_date, budget_total, budget_spent, donor, grant_reference, created_by, stage)
values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Riverside Civic Space Programme', 'governance', 'active', current_date - interval '5 months', current_date + interval '7 months', 46500, 21000, 'European Union — DG NEAR (Demo)', 'DEMO-EU-2025-0142', '00000000-0000-0000-0000-0000000000a1', 'post_award'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'Delta Cooperative Livelihoods Project', 'livelihoods', 'active', current_date - interval '2 months', current_date + interval '10 months', 58000, 9000, 'Nordic Solidarity Fund (Demo)', 'DEMO-NSF-2026-0007', '00000000-0000-0000-0000-0000000000a2', 'post_award')
on conflict (id) do nothing;

insert into public.indicators (organisation_id, project_id, level, unit, baseline, target, actual, status)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', 'output', 'people trained', 0, 200, 85, 'on_track'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', 'outcome', '% reporting increased civic participation', 12, 40, null, 'behind'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000802', 'output', 'cooperatives supported', 0, 15, 6, 'on_track')
on conflict do nothing;

insert into public.activities (organisation_id, project_id, title, status, responsible, output)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', 'Baseline civic participation survey', 'completed', 'Field Officer', '312 respondents surveyed across 4 wards'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', 'Youth leadership training cohort 1', 'in_progress', 'Project Coordinator', null),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000802', 'Cooperative governance training', 'in_progress', 'Cooperative Development Officer', null)
on conflict do nothing;

insert into public.risks (organisation_id, project_id, category, likelihood, impact, risk_level, mitigation, status)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', 'operational', 'medium', 'high', 'high', 'Diversify training venues; maintain community liaison contact list.', 'open'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000802', 'financial', 'low', 'medium', 'low', 'Monthly cooperative treasury reconciliation.', 'open')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Reports — one per submission_status value plus a plain internal
-- monthly_report, so the Report Submission Human Gate in the frontend
-- has something to act on immediately without generating anything first.
-- ---------------------------------------------------------------------
insert into public.reports (project_id, organisation_id, title, report_type, content, period_start, period_end, generated_by, submission_status)
values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', 'Monthly M&E Brief — Month 5', 'monthly_report', '(demo) 85 of 200 target beneficiaries trained to date. Civic participation outcome indicator behind target — recommend revised outreach strategy.', current_date - interval '30 days', current_date, '00000000-0000-0000-0000-0000000000a3', null),
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', 'Interim Narrative Report — Riverside Civic Space Programme', 'interim_narrative', '(demo) Draft interim narrative covering the first reporting period. Requires review before donor submission.', current_date - interval '90 days', current_date, '00000000-0000-0000-0000-0000000000a3', 'internal_draft'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', 'Interim Narrative Report — Delta Cooperative Livelihoods Project', 'interim_narrative', '(demo) Draft awaiting owner/admin sign-off before it can be marked ready for the donor.', current_date - interval '60 days', current_date, '00000000-0000-0000-0000-0000000000a3', 'pending_human_review'),
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', 'Compliance Review — Q2', 'compliance_review', '(demo) Overall compliance: AMBER. Visibility materials on file; log frame and budget documents complete; annexes pending.', current_date - interval '90 days', current_date, '00000000-0000-0000-0000-0000000000a3', null)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Knowledge Hub documents (none are "regulatory" categories — the
-- document_type CHECK here has no such option, so there's no ambiguity
-- with the regulatory-content boundary noted above).
-- ---------------------------------------------------------------------
insert into public.knowledge_documents (organisation_id, title, content, document_type, tags, source_type, review_status)
values
  ('00000000-0000-0000-0000-000000000001', 'Lessons Learned — 2024 Governance Pilot', 'Community consultation before finalising indicators improved buy-in significantly. Recommend a minimum 3-week consultation window on future proposals.', 'lessons_learned', ARRAY['governance','me'], 'manual_upload', 'human_confirmed'),
  ('00000000-0000-0000-0000-000000000001', 'SOP — Field Data Collection', 'Standard procedure for collecting indicator data in the field, including consent and data-handling steps.', 'sop', ARRAY['me','data'], 'manual_upload', 'human_confirmed'),
  ('00000000-0000-0000-0000-000000000001', 'Kickoff Meeting Notes — Delta Cooperative Livelihoods Project', 'Discussed cooperative onboarding timeline and initial training cohort sizing.', 'meeting_notes', ARRAY['delta','kickoff'], 'manual_upload', 'auto_confirmed')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Cost rollups (Observability & Cost Service, AI-Governance spec §1.2) —
-- normally written by cost-rollup-recompute-run; seeded directly here so
-- the Executive Dashboard's Cost card isn't empty on a fresh local stack.
-- Plain token-cost figures, not compliance content — no fabrication
-- concern (see the regulatory-content boundary noted above).
-- ---------------------------------------------------------------------
insert into public.cost_rollups (organisation_id, scope_type, scope_id, period_start, period_end, total_token_cost, total_invocations, confidence_distribution)
values
  ('00000000-0000-0000-0000-000000000001', 'project', '00000000-0000-0000-0000-000000000801', date_trunc('month', current_date)::date, current_date, 4.82, 63, '{"high":40,"medium":18,"low":5}'),
  ('00000000-0000-0000-0000-000000000001', 'project', '00000000-0000-0000-0000-000000000802', date_trunc('month', current_date)::date, current_date, 1.97, 21, '{"high":15,"medium":6,"low":0}'),
  ('00000000-0000-0000-0000-000000000001', 'proposal', '00000000-0000-0000-0000-000000000501', date_trunc('month', current_date)::date, current_date, 0.64, 9, '{"high":6,"medium":3,"low":0}')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Memory Engine entries — feeds Context Engine (contextEngine.ts) with
-- real, non-empty institutional/organisation-tier content so its
-- assembled-context output is actually visible in agent_runs.input_data
-- instead of an empty sources[] array.
-- ---------------------------------------------------------------------
insert into public.memory_entries (tier, scope_id, organisation_id, content, content_type, justification)
values
  ('institutional', null, null, 'Donor visibility requirements are consistently the most-cited compliance gap across past EU-funded proposals — check Annex visibility guidelines early, not at Polish Gate.', 'risk_pattern', 'Pattern observed across multiple past proposals'),
  ('organisation', null, '00000000-0000-0000-0000-000000000001', 'Riverside Civil Society Alliance''s strongest track record is youth governance programming in EU-funded calls — lead with this in strategic narratives.', 'fact', 'Confirmed by portfolio review'),
  ('organisation', null, '00000000-0000-0000-0000-000000000001', 'Decision: prioritise EU and Nordic donors over US-based funders for 2026, per board strategy session.', 'decision', 'Board strategy session, 2026')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Notification Engine — one channel (no secret configured, so
-- notification-dispatch-run exercises its mock-delivery path exactly like
-- llmGateway.ts's mock LLM fallback), plus rules for the Event Bus event
-- types actually published (workflow-gate-decide, workflowEngine.ts's
-- veto-failure publish, submission-package-submit).
-- ---------------------------------------------------------------------
insert into public.notification_channels (id, organisation_id, channel_type, config, active)
values ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', 'slack', '{"label":"#demo-compliance-alerts"}', true)
on conflict (id) do nothing;

insert into public.notification_rules (organisation_id, event_type, channel_id, delivery_mode)
values
  ('00000000-0000-0000-0000-000000000001', 'gate_decision', '00000000-0000-0000-0000-000000000901', 'immediate'),
  ('00000000-0000-0000-0000-000000000001', 'veto_failed', '00000000-0000-0000-0000-000000000901', 'immediate'),
  ('00000000-0000-0000-0000-000000000001', 'submission_submitted', '00000000-0000-0000-0000-000000000901', 'daily_digest')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- AI App Register — one organisation-scoped entry (the 5 platform-wide
-- template rows are already seeded by migration 20 and untouched here).
-- ---------------------------------------------------------------------
insert into public.ai_app_register (organisation_id, application_or_ministry, owner, purpose, vendor_model, risk_tier, oversight_matrix_ref, review_cadence)
values ('00000000-0000-0000-0000-000000000001', 'Procurement Ministry — decision rationale drafting', '00000000-0000-0000-0000-0000000000a1', 'Drafts subcontract/vendor selection rationale for human review before recording.', 'LLM Gateway — multi-provider', 'limited', 'internal draft-only, no autonomous write', 'quarterly')
on conflict do nothing;
