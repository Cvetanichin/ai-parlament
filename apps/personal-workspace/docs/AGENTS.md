# Agents: design, prompts and tuning

## 1. How an agent is defined

An agent has three parts:

1. **System prompt**: `agents/<name>.md`. Role, inputs, rules, method, output structure, quality check.
2. **Registry entry**: `agents/registry.json`. `id`, `name`, `description`, input `fields`, a `template` that turns form values into the user message (`{{key}}` placeholders), and optional flags.
3. **Contract with the app** (optional): a fenced JSON block at the end of the answer that the app can act on.

| Flag | Effect |
|---|---|
| `includeContext` | Workspace snapshot ticked by default |
| `emitsTasks` | App looks for a `workspace-tasks` block and offers Import |
| `emitsUpdates` | App looks for a `workspace-updates` block and offers Apply |

The build script validates that every `{{placeholder}}` has a matching field and that ids are unique.

## 2. Contracts

`workspace-tasks`: array of `{title, due (YYYY-MM-DD), effort (hours), priority (1-3), notes}`.
`workspace-updates`: array of `{id, due?, priority?, note?}`; ids must exist in the snapshot.

The app validates both: invalid dates are dropped, unknown ids are ignored, titles are length-capped. Nothing is applied without a button press.

## 3. Prompt design principles used

| Principle | Where it shows |
|---|---|
| Never invent facts or citations | Writer: `[VERIFY]` markers. Researcher: cites only pasted sources; labels training knowledge |
| Separate fact, assumption, interpretation, recommendation | Researcher, Drafter |
| Separate outcome, output, activity, indicator, baseline, target, means of verification | Drafter (logframe template) |
| Human approval for any change | Deadline agent proposes; app applies on click |
| Exact output structure | Every agent, so results are comparable and importable |
| Built-in self-check | Writer quality check; Deadline agent evidence rule |
| British English, concise institutional tone | All |

## 4. Tuning workflow

1. Run the agent on three representative inputs. Rate each Yes or No.
2. Read the Insights table. Low "Used" share means the output is not usable as is.
3. Edit the prompt in `agents/*.md` (or copy it into a custom agent for an experiment). Change one thing at a time.
4. Rebuild (`node scripts/build.mjs`) and rerun the same three inputs.
5. Keep the change only if the ratings improve. Commit with the reason in the message.

Common fixes:
- Generic prose: add a style guide and a sample paragraph to the Writer input.
- Padded research: shorten OUTPUT to "One-page brief"; add scope exclusions.
- Over-long plans: add a task cap or horizon in CONSTRAINTS.

## 5. Adding an agent

Quick (no code): Settings > Agents > Add custom agent. It gets a single "Request" box. Stored in your browser.

Permanent: add `agents/<name>.md`, add an entry to `agents/registry.json`, run the build, add a line to this file. Keep the prompt under about 70 lines; move long reference material into the user's input, not the system prompt.

## 6. Known limits

- No web browsing or file reading by agents. Planned extension: enable Claude's web search tool for the Researcher (not built; untested).
- Single-turn only: no follow-up conversation. Re-run with edited input, or use the Prompt Pack in a chat.
- The model ID is user-set; check it against Anthropic's current model list when runs fail.
