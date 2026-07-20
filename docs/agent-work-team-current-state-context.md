# Agent Work Team Current-State Context

> Snapshot date: 2026-07-20  
> Scope: Existing Claude Code plugin `ai-agent-dev-platform` v0.1.0  
> Intended reader: A future AI coding session that must understand the current tool before working on GitHub Copilot compatibility.  
> Hard boundary: This file is an as-is inventory. It contains no target architecture, migration plan, gap solution, or proposed Copilot implementation.

## 1. One-paragraph model

The repository currently implements a Claude Code plugin whose slash-command prompts make the main Claude Code conversation act as a workflow Controller. The Controller dispatches specialized subagents and persists each request under the user's project-level `.agent-work-team/`. The workflow has three sequential, human-gated phases: Planning ends at `SPEC_APPROVED`, Development ends at `DEV_APPROVED`, and Knowledge ends at `DONE`. Most orchestration is expressed as command/agent Markdown instructions; deterministic Node.js hooks rebuild the dashboard and enforce Development retry limits.

## 2. Scope rules for future sessions

Treat this document as a compact orientation map, not as the authority when code and prompts have changed.

Authority order for current behavior:

1. `commands/agent-work-team*.md` for Controller routing and state transitions.
2. `agents/agent-work-team-*.md` for subagent input, behavior, output, and report contracts.
3. `hooks/*.mjs` plus `hooks/hooks.json` for deterministic hook behavior.
4. `.claude-plugin/plugin.json` for Claude plugin identity and version.
5. `README.md` and `CLAUDE.md` for repository-level summary and development rules.

Explicit exclusion: `docs/manual-testing-checklist.md` is obsolete. Ignore it entirely; do not use its checkboxes or scenarios as current behavior, coverage, or maturity evidence.

Do not infer a GitHub Copilot conversion design from this file. Before modifying this repository, obey `CLAUDE.md`: create a separate branch and do not edit directly on `main`.

## 3. Plugin identity and runtime shape

```yaml
name: ai-agent-dev-platform
version: 0.1.0
host: Claude Code
interaction: slash commands plus human replies
controller: main Claude Code conversation
subagents: 5
state_location: <user-project>/.agent-work-team/
state_storage: JSON and Markdown files
git_usage: per-request Development branch and per-task commits
dashboard: generated Markdown
human_gates: spec, final development review, knowledge report
```

This is not currently a standalone executable service, API server, or Web application. The request data belongs to the project where the plugin is used, not to this plugin repository.

## 4. User-visible entry points

| Entry point | Ownership and behavior |
|---|---|
| `/agent-work-team "<description>"` | New Planning request only. Creates RQ-ID and token; runs PM, BA, Plan/SA/SD; stops after spec approval at `SPEC_APPROVED`. |
| `/agent-work-team-resume [RQ-ID]` | Planning resume and all-in-progress listing. It does not execute Dev or Knowledge logic; it routes those requests to their owning command. |
| `/agent-work-team-develop <RQ-ID>` | Starts or resumes Development from disk; creates/reuses the request branch; performs per-task development/review and final review; stops after human approval at `DEV_APPROVED`. |
| `/agent-work-team-knowledge <RQ-ID>` | Starts or resumes wiki extraction after Development approval; stops at `DONE` after human approval. |
| `/agent-work-team-dashboard` | Force-rebuild fallback for the generated dashboard. |
| `/agent-work-team-help` | Static command and state reference. |

Important selection difference:

- `develop` and `knowledge` may auto-select the latest eligible request when no ID is supplied.
- `resume` lists all active requests and requires the user to select; it must not auto-select the latest request.

## 5. Agent inventory

| File | Role | Key constraint | Outputs |
|---|---|---|---|
| `agents/agent-work-team-pm.md` | PM Agent | Classification only; no clarification or design | `pm-triage.json/.md` |
| `agents/agent-work-team-plan-sd.md` | Combined Plan/SA/SD Agent | Reads approved BA input; no user dialogue; no invented missing context | `plan-spec.json/.md` |
| `agents/agent-work-team-developer.md` | Developer Agent | One task at a time; normally only task files; test and commit | `dev/Tn-report.json/.md`, git commits |
| `agents/agent-work-team-reviewer.md` | Review/Test Agent | Read-only for product code; independently inspects diff | `dev/Tn-review.json/.md`, `dev/final-review.json/.md` |
| `agents/agent-work-team-knowledge.md` | Knowledge Agent | Deduplicate/update wiki before creating notes; commit wiki changes | wiki notes, request hub/index, `knowledge-report.json/.md` |

BA is not a sixth subagent. BA clarification is executed directly by the main Controller so it can have one-question-at-a-time human dialogue.

## 6. State machine

```text
Planning:
CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING
→ PENDING_SPEC_APPROVAL → SPEC_APPROVED

Development:
SPEC_APPROVED → DEVELOPING → TESTING
→ PENDING_FINAL_APPROVAL → DEV_APPROVED

Knowledge:
DEV_APPROVED → PENDING_KNOWLEDGE_APPROVAL → DONE
```

Status semantics:

| Status | Meaning |
|---|---|
| `Running` | Controller or subagent active. |
| `Pending Confirmation` | Planning conversational soft stop; no completed artifact is being approved. |
| `Pending Approval` | A completed disk artifact awaits explicit human review. |
| `Blocked` | Human intervention is required because of missing information, agent block, or retry limit. |
| `Approved` | Planning or Development gate approved. |
| `Completed` | Entire lifecycle complete. |

`state.json` is authoritative. `dashboard.md` is a generated cache/view. A resume operation may use the dashboard to list requests, but must reread the selected request's `state.json` before routing.

## 7. Persistent data contracts

Per-request root:

```text
.agent-work-team/requests/<RQ-ID>/
```

Key artifacts:

| Path | Purpose | Mutable after creation? |
|---|---|---|
| `state.json` | Authoritative lifecycle state | Yes |
| `pm-triage.json/.md` | PM classification | Normally no |
| `planning/checkpoint.json` | Planning pending question/approval, clarification log, block reason, token | Yes |
| `ba-requirement.json/.md` | Human-confirmed summary and acceptance criteria | Rewritten if requirement feedback returns to BA |
| `plan-spec.json/.md` | Technical design and task breakdown | Rewritten after spec feedback |
| `task-summary.md` | Static snapshot at spec approval | No; do not use as live progress |
| `dev/progress.json` | Live per-task statuses, commits, counters, base branch | Yes |
| `dev/Tn-report.json/.md` | Developer work and test evidence for one task | Yes, append fix commits |
| `dev/Tn-review.json/.md` | Per-task review evidence | Yes, latest review result |
| `dev/final-review.json/.md` | Whole-requirement review evidence | Yes if final review repeats |
| `knowledge/knowledge-report.json/.md` | Wiki changes and knowledge commit | Yes after human feedback |
| `.agent-work-team/dashboard.md` | Generated cross-request summary | Rebuilt from all `state.json` files |

Critical `plan-spec.json.task_breakdown[]` shape:

```json
{
  "id": "T1",
  "description": "...",
  "files": ["path/or/module"],
  "acceptance_criteria": "..."
}
```

Development rejects old or malformed task entries instead of guessing or converting them.

Initial Development progress shape:

```json
{
  "base_branch": "<branch-at-development-start>",
  "tasks": [
    {
      "id": "T1",
      "status": "pending",
      "commits": [],
      "fix_rounds": 0,
      "needs_context_rounds": 0
    }
  ],
  "final_review_fix_rounds": 0
}
```

## 8. Planning behavior that must not be flattened

- `/agent-work-team` is new-request-only; existing Planning work belongs to `/agent-work-team-resume`.
- New requests receive sequential `RQ-NNN` IDs and random lifecycle tokens.
- PM types are exactly: `New Feature`, `Bug Fix`, `Refactor`, `Performance`, `Security`, `Documentation`, `Research`.
- BA asks one question at a time and persists after every answer/next-question transition.
- When checkpoint and state are updated together for a soft stop or approval gate, checkpoint is written first, then state.
- Requirement summary and Acceptance Criteria require explicit human confirmation.
- Spec approval requires the human to open the actual `plan-spec.md`; a chat summary is insufficient.
- Requirement feedback returns to BA; purely technical-design feedback returns directly to Plan/SA/SD.
- Spec approval produces `task-summary.md`, but that file is not live Development progress.

## 9. Development behavior that must not be flattened

- Token consistency and task schema are checked before work begins/resumes.
- Branch name is `agent-work-team/<RQ-ID>`; an existing branch is reused after token checks.
- The branch active before Development is stored as `base_branch`; it is not assumed to be `main`.
- Tasks execute sequentially. Completed tasks are skipped on resume.
- Developer commits every successful task/fix round; fix commits are new commits, not amended commits.
- Reviewer independently reads the supplied commit range and diff; it does not trust only the Developer report.
- Critical and Important issues cause `Needs fixes`; Minor issues do not block approval.
- Final review covers the full Development commit range after all task statuses are `done`.
- Human final approval requires review of `dev/final-review.md`.
- The workflow never automatically merges back to `base_branch`.
- A counter greater than 2 causes `Blocked`: task `fix_rounds`, task `needs_context_rounds`, or `final_review_fix_rounds`.
- Re-running the command is the resume signal, including after a human resolves a Blocked condition.

## 10. Knowledge behavior that must not be flattened

- Knowledge starts only after `DEV_APPROVED` and keeps progress at 100.
- Wiki root is read from the user's `CLAUDE.md` when specified; otherwise it is `.agent-work-team/wiki/`.
- Candidate categories are Decision, Architecture, Lessons Learned, New Rule, and Common Solution. Not every request must produce every category.
- Search spans the entire wiki, not only the candidate category folder.
- Same-topic knowledge updates an existing note and appends `source_requests`.
- Clearly overlapping content from distinct topics may be extracted to `Shared/`; uncertain overlap must not trigger aggressive refactoring.
- Related but non-overlapping notes use a `## 相關` section with Obsidian wikilinks.
- Each request gets/updates a request Hub and `Requests/_Index.md`.
- Wiki changes are committed on the current branch; no additional branch is created.
- Human feedback causes focused note edits and a new commit, not a full wiki rebuild.
- There is no automatic Reviewer or retry counter in this phase; the human gate owns acceptance.

## 11. Resume ownership matrix

| Current stage | Owning resume entry |
|---|---|
| `CREATED`, `PM_TRIAGE`, `BA_CLARIFYING`, `SPEC_DRAFTING`, `PENDING_SPEC_APPROVAL` | `/agent-work-team-resume` |
| `SPEC_APPROVED`, `DEVELOPING`, `TESTING`, `PENDING_FINAL_APPROVAL` | `/agent-work-team-develop` |
| `DEV_APPROVED`, `PENDING_KNOWLEDGE_APPROVAL` | `/agent-work-team-knowledge` |
| `DONE` | No resume needed |

Planning resume tolerates checkpoint/state write interruption by routing on authoritative `state.json.current_stage` and using checkpoint only for details. Token mismatch is different: it is a hard stop requiring human inspection.

## 12. Deterministic hooks

`hooks/hooks.json` registers both scripts on Claude Code `PostToolUse` for `Write`:

1. `hooks/sync-dashboard.mjs`
   - Filters for `.agent-work-team/requests/*/state.json`.
   - Rebuilds `.agent-work-team/dashboard.md` from all parseable state files.
   - Sorts rows by `updated` descending.
   - Reports skipped malformed states in a dashboard warning.
   - Supports `--force` for `/agent-work-team-dashboard`.

2. `hooks/enforce-block.mjs`
   - Filters for `.agent-work-team/requests/*/dev/progress.json`.
   - Blocks when any guarded counter is greater than 2.
   - Updates state to `Blocked`, sets `waiting_on` to `Human`, rebuilds dashboard, and tells the Controller to stop.

These scripts are code-enforced behavior. The remaining workflow is predominantly prompt-enforced through command and agent Markdown files.

## 13. Current known boundaries

- No parallel task execution.
- No automatic branch merge.
- No standalone Web dashboard.
- No existing command-level GitHub Issue, Pull Request, Jira, CI/CD, or deployment integration identified in the Claude plugin surface.
- No automatic Knowledge reviewer.
- `skills/example-planning/SKILL.md` is still a scaffold/loading placeholder, not a production workflow skill.
- Plan, SA, and SD are combined in one MVP agent.

These are observations, not requirements for a future target.

## 14. Validation evidence boundary

`docs/manual-testing-checklist.md` is obsolete and must be ignored. Its checked or unchecked items are not valid evidence of current behavior, coverage, or maturity.

This snapshot records behavior defined by the current command prompts, agent prompts, hooks, and repository documentation. It does not claim that every described path has current end-to-end validation evidence. When validation status matters, inspect executable tests and run fresh behavior-scoped checks against the then-current implementation.

## 15. Fast re-orientation checklist for a new session

Before reasoning about current behavior:

1. Read `CLAUDE.md` and check the current Git branch.
2. Read `.claude-plugin/plugin.json` for the current version.
3. Read the specific owning command, not all commands indiscriminately.
4. Read the dispatched agent files for that command.
5. If state/dashboard/retry behavior matters, read the two hook scripts.
6. Compare this snapshot date with recent Git history or file changes; refresh this document if behavior has changed.
7. Keep current-state findings separate from any future GitHub Copilot conversion design.

## 16. Source index

```text
Repository rules and summary
  CLAUDE.md
  README.md
  .claude-plugin/plugin.json
  .claude-plugin/marketplace.json

User commands
  commands/agent-work-team.md
  commands/agent-work-team-resume.md
  commands/agent-work-team-develop.md
  commands/agent-work-team-knowledge.md
  commands/agent-work-team-dashboard.md
  commands/agent-work-team-help.md

Subagents
  agents/agent-work-team-pm.md
  agents/agent-work-team-plan-sd.md
  agents/agent-work-team-developer.md
  agents/agent-work-team-reviewer.md
  agents/agent-work-team-knowledge.md

Deterministic hooks
  hooks/hooks.json
  hooks/sync-dashboard.mjs
  hooks/enforce-block.mjs
  hooks/sync-dashboard.test.mjs
  hooks/enforce-block.test.mjs

Excluded obsolete material
  docs/manual-testing-checklist.md (ignore; not a current-state or validation source)
```
