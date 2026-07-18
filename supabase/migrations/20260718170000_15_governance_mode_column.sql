-- ADR-0009 §4 Phase C.2/C.3: tag workflow_instances so a shadow-mode
-- verdict is unambiguously distinguishable from a future enforced-mode
-- verdict (§4 Phase C.3 flagged this as an open question for Claude Code
-- to raise, not decide -- raised and resolved with the Product Owner
-- ahead of Phase C.3's trigger wiring, as part of Phase C.2).
--
-- Nullable, not defaulted: only instances created by the automated
-- shadow/enforced invocation path (Phase C.3 onward) get a value here.
-- Manually/directly created instances (e.g. House of Parliament testing)
-- are outside the governance-cutover apparatus and stay NULL -- a
-- deliberate third bucket, not an omission.

alter table public.workflow_instances
  add column if not exists governance_mode text;

alter table public.workflow_instances
  add constraint workflow_instances_governance_mode_check
    check (governance_mode is null or governance_mode in ('shadow', 'enforced'));
