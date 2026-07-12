---
document: Regulatory Knowledge Layer Specification
version: 1.1
status: APPROVED — approved by Product Owner 12 July 2026; no open items remain (§12)
parent: ../../00-EAS-v1.0.md (EAS §6 — first-class platform service, §13 priority 2)
existing_assets: Internal Knowledge Assistant (Gemini Gem persona), PRAG 2025 full text, Standard Grant Contract annexes, EU application forms, EU AI Act governance blueprint
---

# Regulatory Knowledge Layer — Specification v1.1

## 0. Note on Source Grounding

Unlike the Parliament Core spec, this one is grounded directly in the actual
source documents already present in the project workspace — they were read
for this spec, not assumed from a description. Specifically inspected:
`PRAG_2025_full_version_en.md` (10,664 lines, confirmed to use a decimal
section-numbering scheme — `1`, `1.1`, `2.5.9`, etc. — with a repeating
`PRAG 2025 <page>` header/footer artifact from the source PDF conversion, and
no markdown heading markup) and `Internal Knowledge Assistant.md` (the Gemini
Gem's full system prompt, 140 lines). The structural detail in §4.1 and the
precedence model in §3 are both derived from these actual files, not from the
earlier chatgpt-audit description of what such a layer should look like.

## 1. Purpose and Position in the Architecture

This is one of the two or three most important services in the platform (EAS
§6) and the reason the platform is defensible in front of a donor auditor
rather than merely convenient. It is a Layer 3 service (EAS §3.3), consumed by
every ministry in Layer 2, and it enforces the platform's most important
architectural rule:

```
Prompt → Regulatory Knowledge Layer → Prompt        (correct)
Prompt → [PRAG text pasted inline]                    (forbidden)
```

No ministry, no Agent (Parliament Core spec §3.1), and no Prompt Version
(`docs/04-`) is permitted to embed regulatory text directly. Every compliance
claim a ministry makes must be traceable to a specific clause this service
returned, with a citation — never to text baked into a prompt at authoring
time, which cannot be updated centrally when PRAG or a donor's Guidelines
change.

## 2. Source Corpus

### 2.1 Wave 1 — already available in the project workspace, ready to ingest

| Document | Category | Notes |
|---|---|---|
| `PRAG_2025_full_version_en.md` | EU — PRAG | 10,664 lines; decimal section numbering (§4.1) |
| Standard Grant Contract (Special Conditions) | EU — Contract | |
| Annex A1 — Grant application form, Concept Note | EU — Application | |
| Annex A2 — Grant application form, Full Application | EU — Application | |
| Annex C — Logical Framework | EU — Application | Also the template Logframe Studio (Grant Studio §6) builds against |
| Annex IV — Procurement rules for beneficiaries | EU — Contract | |
| Annex V — Standard request for payment | EU — Contract | |
| Annex VI (1) — Model interim narrative report | EU — Contract | Reporting Studio's mandatory template (Grant Studio §9) |
| Annex VI (2) — Model final narrative report | EU — Contract | Reporting Studio's mandatory template (Grant Studio §9) |
| Annex VII-A — Expenditure verification / report of factual findings ToR | EU — Contract | |
| Annex VII-B — Third-party assessment ToR for assessors | EU — Contract | |
| Annex VIII — Model financial guarantee | EU — Contract | |
| Annex IX — Standard template, transfer of ownership | EU — Contract | Feeds Consortium Builder post-award, Grant Studio §4.2 |
| Annex H — Declaration of honour on exclusion and selection criteria | EU — Contract | Feeds Consortium Builder pre-award, Grant Studio §4.1 |
| Annex J — Tax regime applicable to grant contracts | EU — Contract | |
| Annex L — Self-evaluation questionnaire on SEA-H | EU — Contract | Sexual exploitation, abuse and harassment safeguarding |
| Guidelines for Grant Applicants (a specific call) | EU — Guidelines | Per-call, highest authority per §3; this is one example instance, not the general case — every call has its own |
| Privacy Statement (EN) | EU / Organisation | |
| Internal Knowledge Assistant system prompt | Internal | Source of the precedence model, §3 |
| ProposalAI Pro Governance Blueprint | AI Governance | Source of §9's AI-risk obligations, cross-referenced with `docs/17-AI-Governance/` |

### 2.2 Not yet available — gaps to flag, not silently work around

- **Organisational policy** (HR, finance, travel, procurement, brand, SOPs,
  templates) — the corpus is empty, but the ingestion target is no longer
  undefined: a dedicated "Organisational Policy Corpus" Google Drive
  folder has been created, with six subfolders (HR, Finance, Travel,
  Procurement, Brand, SOPs and Templates) matching this precedence model's
  own category slots. Do not synthesise organisational policy content to
  fill this gap — populating it is an editorial task for whoever owns each
  category's real documents, not an architectural one (same pattern as
  `docs/06-Knowledge-Platform/`'s seed-corpus resolution).
- **National law** (procurement, labour, tax, NGO legislation, country-specific
  requirements) — confirmed out of scope for Wave 1 by default. Not a
  standing question requiring an answer now: revisit via a new ADR the
  moment a specific country need is identified (e.g. active IPA III /
  Western Balkans work), rather than speculatively pulling jurisdictions
  forward with no active grant to justify them.
- **Older PRAG versions** — only PRAG 2025 is in the corpus. Rather than
  requiring an answer to "does the organisation currently have active
  legacy-PRAG grants" before this layer can be trusted, the safe default is
  specified directly: every `Project` (docs/11-Database-Schema §5.1) is
  assumed governed by PRAG 2025 unless explicitly marked otherwise. A new
  `projects.prag_version` column (nullable, defaults to the current
  corpus version) lets a specific project be flagged if it turns out to
  predate PRAG 2025 — any Compliance Finding generated against a project
  so flagged returns `status: needs_review` with a `legacy_prag_pending`
  note instead of silently applying PRAG 2025 rules, until that version is
  actually ingested. This closes the open question architecturally: no
  legacy version needs to be ingested speculatively, and no project is
  silently mis-checked if one turns out to exist.

## 3. Normative Hierarchy (Precedence Model)

Ported directly from the Internal Knowledge Assistant's system prompt, which
already encodes this correctly — this is adopted as policy, not redesigned:

1. **Guidelines for Grant Applicants** + the specific grant/contract (Special
   Conditions, General Conditions, annexes) + applicable law — highest
   authority.
2. **PRAG 2025** and related official EU guidance (procurement/grant
   guidelines for external actions, Financial Regulation principles).
3. **Organisational internal procedures** — operationalise donor rules; may
   not contradict them. Where there is tension, donor rules prevail and the
   Compliance Engine must say so explicitly, not silently pick one.

Additional behavioural rules carried over as binding on the Rule Extractor and
Citation Engine (§4), not merely as the old Gem's conversational style:

- Different calls, instruments, or management modes (direct/indirect/shared)
  may introduce derogations or stricter rules. The Citation Engine must flag
  when a returned rule has a known possible derogation and note that the
  specific call's contract package should be checked — this is a structured
  `flags[]` entry on the Compliance API response (§6), not a caveat buried in
  prose.
- **Conservative by default**: where more than one interpretation is
  plausible, the Rule Extractor's confidence scoring must bias toward the
  interpretation safest for donor compliance, audit exposure, and
  reputational risk — never toward the interpretation most convenient for the
  drafting ministry.
- **No loophole logic, ever.** The Rule Extractor and Citation Engine must not
  surface "workaround" framings even if a source document's ambiguity would
  technically support one. This is a hard constraint on prompt design for the
  extraction pipeline (§4.4), not just a response-time filter.
- When a rule is genuinely context-dependent (thresholds, country-specific
  derogations), the Compliance API response must say so explicitly
  (`status: "context_dependent"`, §6) rather than guessing a value.

## 4. Ingestion Pipeline

```
Document Parser → Chunking → Metadata Extraction → Embeddings → Knowledge Graph
   → Rule Extractor → Clause Extractor → Semantic Index → Citation Engine → Compliance API
```

### 4.1 Document Parser

Source-format-specific. For PRAG 2025 specifically (confirmed from the actual
file, §0): strip the repeating `PRAG 2025 <page number>` header/footer
artifact before chunking — it is a page-break remnant from the source PDF, not
content, and left in place it would pollute embeddings and confuse the
Citation Engine's page/section attribution. For Annex/contract documents
(shorter, 28–650 lines each), no equivalent artifact was observed, but the
parser should not assume this holds for every future ingested document —
detect repeating short lines at regular intervals as a generic artifact-strip
heuristic, not a PRAG-specific hardcode.

### 4.2 Chunking

Primary chunk boundary: the decimal section-numbering scheme confirmed in
PRAG 2025 (`N`, `N.N`, `N.N.N` — e.g. `2.5.9 Procedure with a suspensive
clause`). This gives naturally-sized, citable chunks that align with how a
human would reference the document ("PRAG §6.5") — critical, since the whole
point of this layer is that every Compliance Finding cites a specific,
human-checkable clause. Documents without this numbering convention (most
Annexes, which are templates/forms rather than rule text) are chunked by
logical section (form field groups, template sections) instead — the Rule
Extractor (§4.4) applies to PRAG and the Guidelines primarily; Annexes are
more often consumed as templates by the Proposal/Reporting/Budget Studio
modules than as rule sources, though Annex IV (procurement rules) and Annex
VIII (financial guarantee) do contain extractable rules and should go through
the same Rule Extractor pass as PRAG.

### 4.3 Metadata Extraction

Every chunk is tagged with: source document, document version, section number
(where applicable), page (approximate, given the header/footer artifact),
effective date, jurisdiction (EU-wide vs. instrument-specific — e.g. IPA III
vs. NDICI-Global Europe), and document category (EU/Organisation/National/
Internal/AI Governance, per §2).

### 4.4 Rule Extractor

An LLM-assisted extraction pass (via the Agent Runtime, Parliament Core spec
§3, never a direct model call) that identifies chunks containing an actual
obligation, prohibition, threshold, or procedural requirement — as opposed to
narrative/explanatory text. Output: a candidate `RegulatoryRule` (§5) with a
confidence score. Low-confidence extractions are flagged `needs_human_review`
(§8), never silently discarded or silently trusted.

**Explicit example, grounded in the real document:** PRAG §2.4.2 ("Exclusion
criteria") and §2.5.7 ("Anti-fraud strategy") are exactly the kind of section
this stage must extract as rules with high confidence; a section like §2.1
("Overview") is narrative and should extract nothing, or extract with very
low confidence correctly flagged for review.

### 4.5 Clause Extractor

Refines a `RegulatoryRule` into one or more atomic `RegulatoryClause` records
(§5) — a single section may contain several independently-citable
obligations. Also resolves internal cross-references (PRAG frequently reads
"see section X" — the Clause Extractor must resolve these into explicit
`relatedClauses` links, not leave them as unresolved prose pointers, since a
Compliance Finding citing a clause that itself says "see also §Y" is
incomplete without §Y's content also being retrievable).

### 4.6 Embeddings + Knowledge Graph

Standard semantic embedding per clause (co-located with the Knowledge Platform,
`docs/06-`, using the same vector store per EAS §3.4/§14's open vector-DB
decision) plus explicit graph edges for: clause→clause references (§4.5),
clause→document, and — critically — clause→**Compliance Finding usage**, so
the platform can eventually answer "which proposals were affected when PRAG
§6.5's indirect cost ceiling was last updated" (see §7).

### 4.7 Semantic Index + Citation Engine

The Semantic Index supports both keyword and embedding search over clauses.
The Citation Engine is the component that assembles a full citation object —
document, version, section/article, page, paragraph, effective date,
jurisdiction, source, confidence, relationships — for every clause a
Compliance API response references. This is the concrete implementation of
the response shape already fixed in EAS §6.3; this spec does not change that
shape, only defines how it gets populated.

### 4.8 Compliance API

The externally-consumed layer — see §6.

## 5. Data Contracts

Extends the entities already named in EAS §4.

```json
// RegulatoryDocument
{
  "id": "string",
  "title": "string",
  "category": "eu_prag | eu_contract | eu_guidelines | eu_application | organisation_policy | national_law | internal_learned | ai_governance",
  "version": "string",
  "effectiveDate": "date",
  "supersedes": "documentId, nullable",
  "jurisdiction": "string",
  "sourceUrl": "string, nullable",
  "ingestedAt": "timestamp"
}

// RegulatoryClause
{
  "id": "string",
  "documentId": "string",
  "documentVersion": "string",
  "section": "string, e.g. '2.5.9'",
  "page": "integer, nullable — approximate",
  "text": "string",
  "obligationType": "mandatory | recommended | prohibited | context_dependent",
  "extractionConfidence": "number 0-1",
  "relatedClauses": ["clauseId"],
  "supersededBy": "clauseId, nullable",
  "reviewStatus": "auto_confirmed | needs_human_review | human_confirmed"
}

// ComplianceFinding
{
  "id": "string",
  "requestContext": { "artefactType": "proposal|budget|logframe|report|partner", "artefactId": "string" },
  "clauseId": "string",
  "rule": "string — human-readable statement of the rule",
  "source": "string — formatted citation, e.g. 'Guidelines for Applicants, Section 2.3'",
  "severity": "mandatory | recommended | info",
  "status": "pass | warning | fail | context_dependent | needs_review",
  "flags": [{ "type": "possible_derogation | context_dependent | low_confidence", "note": "string" }]
}
```

## 6. Regulatory APIs

Per EAS §6.3, the shape is fixed:

```json
{
  "rule": "Gender mainstreaming required",
  "source": "Guidelines for Applicants, Section 2.3",
  "severity": "mandatory",
  "status": "missing"
}
```

Endpoints, each a thin, purpose-named wrapper over the same Clause/Finding
model (not eight separately-implemented rule engines): `Compliance API`
(general-purpose, used by Compliance Studio, Grant Studio §8), `Eligibility
API` (used by the Eligibility Engine, Grant Studio §3), `Procurement API`
(Annex IV-grounded, used pre-award for consortium procurement planning and
post-award for Project Operations), `Budget API` (indirect cost ceilings,
eligible cost categories — used by Budget Studio, Grant Studio §7), `Reporting
API` (Annex VI templates and rules, used by Reporting Studio, Grant Studio
§9), `Visibility API`, `Contract API` (Standard Grant Contract General/Special
Conditions), `Annex API` (template structure lookups — e.g. "what fields does
Annex A2 require" — for the Proposal Builder, Grant Studio §5).

**Every endpoint returns the same finding shape.** A ministry calling
`Budget API` and a ministry calling `Reporting API` get structurally identical
responses — this is what lets the Compliance Engine's specialised validators
(Grant Studio §8: PRAG Validator, Budget Validator, Procurement Validator,
etc.) be thin clients rather than each reimplementing response handling.

### 6.1 Context-dependent responses

Per §3's conservative-by-default rule, a query that cannot be answered
generically returns `status: "context_dependent"` with a note on what the
caller must confirm (contract, specific PRAG text, donor communication) rather
than a best-guess PASS or FAIL. Grant Studio's Compliance Studio (§8) must
treat this status as requiring human judgement at the Polish Gate, not as a
soft PASS.

## 7. Versioning & Change Management

- **Document supersession**: a new PRAG version (or a call's Guidelines
  update) creates a new `RegulatoryDocument` with `supersedes` pointing to the
  prior version; clauses are re-extracted, not patched in place.
- **Active-grant protection**: a `Proposal` or `Project` records which
  document versions were authoritative at the time its Compliance Findings
  were generated (via the `ComplianceFinding.clauseId` → `documentVersion`
  chain). A PRAG update does not retroactively invalidate findings on an
  already-submitted proposal. For the legacy-PRAG case specifically (§2.2),
  `projects.prag_version` plus the `legacy_prag_pending` finding status is
  the decided mechanism — no second PRAG version needs to already exist in
  the corpus for this protection to hold.
- **Change notification**: when a clause is superseded, any `WorkflowInstance`
  (Parliament Core spec §2.6) currently `awaiting_human` or `rewriting` and
  referencing the old clause should receive a flag — not automatically
  invalidated, since a human is already in the loop at that state, but
  visibly warned before they approve.

## 8. Confidence & Escalation

Mirrors the Internal Knowledge Assistant's own behaviour, now structured
rather than conversational:

- `extractionConfidence` below **0.6 (decided)** sets `reviewStatus: needs_
  human_review` — the clause is usable but every `ComplianceFinding` citing
  it inherits a `low_confidence` flag (§5). This is now the platform-wide
  reference default — both `docs/06-Knowledge-Platform/`'s Template
  Detection pass and any future extraction-confidence-gated feature should
  reuse 0.6 rather than introducing a separately-tuned threshold, absent a
  specific reason to diverge.
- A human reviewer confirming or correcting a flagged clause is itself logged
  (EAS §2 principle 8) — this is how the corpus improves over time instead of
  silently accumulating uncorrected extraction errors.

## 9. AI Governance Cross-Reference

This layer's own operation is itself subject to `docs/17-AI-Governance/`
(EAS §7): the Rule Extractor and Citation Engine are AI-assisted functions
that produce content feeding donor-facing compliance judgements, and per the
ProposalAI Pro Governance Blueprint's precedent (adopted as baseline, EAS §8),
should be registered in the AI App Register with the same rigor as the
Writing Ministry's drafting Agent — a hallucinated compliance citation is
exactly the "fabricated Commission Regulation reference" failure mode that
blueprint documents as a real, already-observed incident class.

## 10. Migration from the Internal Knowledge Assistant

1. The precedence model (§3) is extracted into the Rule Extractor's scoring
   logic and the Citation Engine's `context_dependent` handling — done in this
   spec, not deferred.
2. The Gem's attached PRAG/EU documents become the Wave 1 source corpus (§2.1)
   — already true, since those documents live in this project workspace.
3. The Gem's conversational form (a chat interface answering procurement
   questions) is **retired once the Compliance API covers the same ground
   with citations** — not before. Until the API has sufficient corpus
   coverage, the Gem remains the practical fallback for questions the
   platform can't yet answer structurally, and Claude Code should not treat
   its retirement as implied by this spec's approval alone.

## 11. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Zero fabrication** | A Compliance Finding without a resolvable `clauseId` must not be returned — no endpoint may answer from general model knowledge when the corpus has no matching clause. Return `needs_review` instead. |
| **Latency** | Compliance API calls happen inline during drafting (Grant Studio's Continuous Compliance model, §8 of that spec) — target sub-second for cached/indexed clause lookups; extraction-time latency (new document ingestion) is not user-facing and can be slower. |
| **Auditability** | Every Compliance Finding is retained even after the artefact it was checked against is superseded — required for the 5-year audit retention NFR (EAS §9). |
| **Corpus completeness signalling** | The API must be able to say "no rule found" distinctly from "rule found, status PASS" — silence is not compliance. |

## 12. Resolved Decisions (formerly Open Items)

All four items originally listed here are now resolved, 12 July 2026:

- **Legacy PRAG versions** — decided: a fallback mechanism (§2.2's
  `projects.prag_version` + `legacy_prag_pending` finding status) handles
  both cases — no answer about the organisation's actual grant portfolio
  was required to close this architecturally. If a legacy-PRAG project is
  later identified, it self-flags via that mechanism rather than being
  silently mis-checked against PRAG 2025.
- **Organisational policy corpus** — decided: a dedicated "Organisational
  Policy Corpus" Google Drive folder exists (§2.2), structured by category.
  Populating it remains an editorial task, not an architectural one, and is
  not tracked as a spec blocker.
- **Extraction confidence threshold** (§8) — decided: 0.6, now the
  platform-wide reference default.
- **National law** — decided: out of scope for Wave 1 by default; revisit
  via ADR only when a specific country need is actually identified.

No open items remain in this spec. Any future change to these decisions
goes through a new ADR, per the standard governance workflow.
