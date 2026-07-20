-- Grant Studio spec §4.1 (Consortium Builder, pre-award). Adds the
-- remaining mandatory-document checklist columns this table was missing
-- (lef_status/fif_status/declaration_of_honour_status already existed) plus
-- capacity scoring, mirroring the existing column-per-document-type
-- pattern already on this table rather than introducing a new checklist
-- table -- Database Schema spec §0's "extend the real table" rule.
--
-- Free text, no CHECK constraints -- matches lef_status/fif_status/
-- due_diligence_status on this same table, none of which are enumerated.
-- capacity_score is a new pre-award field, distinct from the existing
-- post-award performance_rating (ADR-0001).

alter table public.partners add column if not exists mandate_letter_status text;
alter table public.partners add column if not exists statutes_status text;
alter table public.partners add column if not exists co_financing_status text;
alter table public.partners add column if not exists cvs_status text;
alter table public.partners add column if not exists capacity_score numeric;
alter table public.partners add column if not exists past_cooperation_notes text;
