---
status: APPROVED — approved by Product Owner 12 July 2026 — see Deployment-Specification-v1.0.md
eas_reference: EAS v1.0 §9 (NFRs), §3.4 (Layer 4), ADR-0007
---
# 19 — Deployment

Full specification: `Deployment-Specification-v1.0.md` — the runbook ADR-0007
made mandatory but never wrote down. Formalizes the staging-validation gate
every migration touching a real, live table must pass before reaching
production.

**Provisioned, not just specified:** a real staging Supabase project
(`Consultancy Dashboard - Staging`, ref `urhocsijfzkepebsmstx`, `eu-west-1`,
$0/month) exists, seeded with the same three migration files production
runs, confirmed at structural parity (12 tables, RLS enabled on all,
matching production). This is Option C from the original trade-off analysis
— the account is on Supabase's Free plan, which doesn't support native
Branching (Pro-only) — with Option D (upgrade to Pro, use a real Branch)
documented as the target state to graduate to, not a requirement now.

A first real validation finding already surfaced from standing this up:
the `vector` extension installed in the `public` schema, and a mutable
`search_path` on `handle_new_user()` — both tracked as open items (spec §8)
rather than silently fixed, since one touches an Approved spec's DDL
(`docs/11-Database-Schema/`).
