---
status: APPROVED — approved by Product Owner 12 July 2026 — see Security-Specification-v1.0.md
eas_reference: EAS v1.0 §9 (NFRs), §7.3 (Data protection)
---
# 16 — Security

Scope: authentication/authorization detail, role-based access control matrix,
multi-tenant isolation mechanism, PII filter design (pre-prompt redaction),
encryption at rest/in transit, secrets vault, GDPR right-to-erasure
implementation.

See `Security-Specification-v1.0.md` for the full spec. Resolves two open
items previously tracked against Platform Services (§8) and Database Schema
(§14 / §2): notification channel secret storage (Supabase Vault), and the
RBAC permission matrix (four-role Organisation-scoped enum plus the
platform-operator boundary).
