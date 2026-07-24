# Superseded — standalone Prompt Orchestration Platform design

Everything in this folder (including `ADR/001`–`015`) describes Prompt
Orchestration Platform as originally planned: its own Supabase project, its
own `orchestrate-task` Edge Function, an 11-table fresh schema, its own
deployment/testing/security model. **ADR-0011
(`../../../../docs/21-ADRs/0011-prompt-orchestration-platform-as-parliament-core-extension.md`)
decided against building any of that** — POP was absorbed into Parliament
Core instead, reusing its Workflow Engine, Agent Runtime, and the real
`cso-playground` Supabase project.

None of this was ever built as written. It's kept, not deleted, because:

- **`ADR/010-openai-integration.md`** and the sibling **`PROMPT_ENGINE.md`
  reference in the parent folder** are both named directly in ADR-0012's own
  `amends:` front-matter as the design this repo's ADR series formally
  superseded — deleting the target of a recorded amendment breaks that
  trail.
- The rest is a real, coherent design exercise — the module registry,
  prompt contracts, and validation design in particular remain a reasonable
  reference for *what* each specialist/validator/formatter is meant to do,
  even though *how* it's wired changed entirely (ADR-0011 is the source of
  truth for that now).

If you're looking for what actually got built, start at
[`../README.md`](../README.md) instead.
