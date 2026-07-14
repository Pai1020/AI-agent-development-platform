# Agent Work Team Planning Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the gap where a Planning-stage soft-stop (BA clarification question, requirement-summary confirmation) only lives in session context — if the session is lost, the pending discussion cannot be recovered. Persist every Planning soft-stop to disk (`planning/checkpoint.json`), give soft-stops their own `state.json` status (`Pending Confirmation`, distinct from `Running`/`Blocked`/`Pending Approval`), add a dedicated `/agent-work-team-resume` command that lists all in-flight/blocked requests with their concrete stop reason and lets the user resume from a fresh session, add a `/agent-work-team-help` command listing all commands, and close the `RQ-ID` reuse hole (deleting the highest-numbered request folder causes the next request to reuse its id) with a per-request random `token` compared before any resume/branch-reuse action.

**Architecture:** `commands/agent-work-team.md` gains a new `token` generated at Step 1, and incremental `planning/checkpoint.json` writes at every BA question, the summary-confirmation gate, the spec-approval gate, and both subagent `BLOCKED` branches (PM, Plan/SA/SD) — always written *before* the corresponding `state.json` status flip (write-ordering invariant). A new `commands/agent-work-team-resume.md` scans all `state.json` files, classifies them Planning-owned / Dev-owned / Knowledge-owned by `current_stage`, shows a reason per request (from checkpoint or from pointers to existing Dev/Knowledge report files), gates on token consistency, and re-enters the live BA conversation or approval gate using the persisted checkpoint. A new `commands/agent-work-team-help.md` is a static command catalog. `agents/agent-work-team-pm.md` is extended to echo `token` into `pm-triage.json`. `commands/agent-work-team-develop.md` and `commands/agent-work-team-knowledge.md` each gain a lightweight token-consistency check to detect stale branches/artifacts from a reused id. Development/Knowledge's own resume logic is untouched — it already works.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code command/agent definitions — no build step, no automated test suite; verification is manual, prompt-driven).

## Global Constraints

- `/agent-work-team` remains "start a brand-new request only" — it must NOT gain any resume/state-reading behavior. Resuming an in-flight Planning request happens exclusively through `/agent-work-team-resume`.
- Every soft-stop write pair (checkpoint + state.json) must write the checkpoint file first, then flip `state.json`'s status — never the reverse — so a session death between the two writes always leaves the durable checkpoint at least as current as (or more current than) `state.json`.
- `Pending Confirmation` is reserved for live-conversation soft-stops with no finished artifact (BA question, summary confirmation). The three formal approval gates (`PENDING_SPEC_APPROVAL` and the Dev/Knowledge equivalents) keep `status: "Pending Approval"` — do not merge these two concepts.
- `current_stage`/`progress`/`current_agent` freeze during both `Pending Confirmation` and `Blocked`, exactly like the existing Blocked freeze rule — only `status`/`waiting_on` change.
- `token` is generated once per request at creation and never changes. It must be echoed into every per-request artifact that a resume/branch-reuse check reads: `state.json`, `pm-triage.json`, `planning/checkpoint.json`.
- Token mismatches must stop the flow and surface a clear warning to the user — never auto-resolve, auto-delete, or silently proceed with mismatched files.
- `/agent-work-team-resume` must NOT auto-pick the most-recently-updated request (unlike `/agent-work-team-develop`'s fallback) — the user invokes it specifically because they've lost track, so it must list everything and require an explicit pick.
- `/agent-work-team-resume` must route Dev-owned and Knowledge-owned requests to their existing commands rather than reimplementing any part of their resume logic.
- No hook changes are required or permitted as part of this plan — `hooks/sync-dashboard.mjs` already renders any `status` string verbatim, and `hooks/enforce-block.mjs` is scoped to `dev/progress.json` only. Verify this holds; do not add new hooks.

---

### Task 1: Add token generation, checkpoint writes, and `Pending Confirmation` to `/agent-work-team`

**Files:**
- Modify: `commands/agent-work-team.md`

**Interfaces:**
- Produces: `state.json.token`, `.agent-work-team/requests/{id}/planning/checkpoint.json` (created at BA entry, updated incrementally through BA questions, summary confirmation, spec-approval gate, and both `BLOCKED` branches).

- [x] **Step 1: Step 1 (建立新需求) generates a random `token` via Bash right after computing `request_id`, and writes it into the newly-created `state.json`.**

```bash
openssl rand -hex 4 2>/dev/null || printf '%04x%04x' $RANDOM $RANDOM
```

- [x] **Step 2: Step 2 (PM Agent) passes `token` in the dispatch prompt, and on `BLOCKED` creates `planning/checkpoint.json` (doesn't exist yet at this point) with `sub_step: "PM_TRIAGE"`, `pending: null`, `reason: "<PM's concrete blocked reason>"` before flipping `state.json.status` to `"Blocked"`.**

- [x] **Step 3: Step 3 (BA loop) creates `planning/checkpoint.json` on entry (empty `clarification_log`, `pending: null`), then before every question (after the first) appends the prior Q&A to `clarification_log`, sets `pending: {kind:"question", prompt, options}` and `reason`, writes checkpoint, THEN writes `state.json.status = "Pending Confirmation"` / `waiting_on = "Human"` — before actually asking. After the user answers, flips `state.json.status` back to `"Running"`.**

- [x] **Step 4: The summary-confirmation gate follows the same pattern with `pending.kind: "summary_confirmation"`. On approval, `clarification_log` is copied from the checkpoint (not re-typed) into `ba-requirement.json`; checkpoint is updated to `pending: null`, `sub_step: "SPEC_DRAFTING"` before `state.json` advances to `SPEC_DRAFTING`/30.**

- [x] **Step 5: Step 4 (Plan/SA/SD dispatch) on `BLOCKED` updates the existing checkpoint (`sub_step: "SPEC_DRAFTING"`, `pending: null`, `reason: "<concrete reason>"`) before flipping `state.json.status` to `"Blocked"`. On `DONE`/`DONE_WITH_CONCERNS`, checkpoint is updated to `sub_step: "PENDING_SPEC_APPROVAL"`, `pending: {kind:"spec_approval", prompt, artifact: plan-spec.md path}`, `reason: "Spec 待人工核准"` before `state.json` advances (status stays `"Pending Approval"`, NOT `"Pending Confirmation"`).**

- [x] **Step 6: Step 5 (Human Approval Gate) on approve sets checkpoint `pending: null`, `sub_step: "SPEC_APPROVED"` (file kept, not deleted) before `state.json` advances to `SPEC_APPROVED`/50.**

- [ ] **Step 7: Validate frontmatter and coverage**

Run: `head -1 commands/agent-work-team.md && grep -c '^description:' commands/agent-work-team.md && grep -c 'token' commands/agent-work-team.md && grep -c 'Pending Confirmation' commands/agent-work-team.md && grep -c 'checkpoint.json' commands/agent-work-team.md && grep -c '寫入順序不變式' commands/agent-work-team.md`
Expected: first line `---`, `description:` count `1`, `token` count `>= 8`, `Pending Confirmation` count `>= 3`, `checkpoint.json` count `>= 5`, `寫入順序不變式` count `>= 1`.

- [ ] **Step 8: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Persist Planning soft-stops to disk with a dedicated Pending Confirmation status"
```

---

### Task 2: Echo `token` through the PM Agent

**Files:**
- Modify: `agents/agent-work-team-pm.md`

- [x] **Step 1: Add `token` to the documented inputs (echoed verbatim, not generated or altered by the subagent) and to the `pm-triage.json` output schema (`id`/`token` fields).**

- [ ] **Step 2: Validate**

Run: `grep -c 'token' agents/agent-work-team-pm.md`
Expected: `>= 3`.

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-pm.md
git commit -m "PM Agent echoes the request token into pm-triage.json"
```

---

### Task 3: Token-consistency checks in Development and Knowledge entry commands

**Files:**
- Modify: `commands/agent-work-team-develop.md`
- Modify: `commands/agent-work-team-knowledge.md`

**Interfaces:**
- Consumes: `state.json.token`, `pm-triage.json.token` written by Tasks 1–2.

- [x] **Step 1: `agent-work-team-develop.md` Step 1 gains a 4th sub-step comparing `state.json.token` to `pm-triage.json.token` right after the fresh/resume classification, stopping with a clear warning on mismatch (covers the case before any branch exists).**

- [x] **Step 2: `agent-work-team-develop.md` Step 3.2 (branch-existence check) gains a token comparison before `git checkout` of an *existing* `agent-work-team/{id}` branch — refuses to switch onto a branch that might belong to a reused id.**

- [x] **Step 3: `agent-work-team-knowledge.md` Step 1 gains a 4th sub-step with the same `state.json.token` vs `pm-triage.json.token` comparison (Knowledge doesn't do its own branch checkout — the subagent commits on whatever branch is already checked out — so the check lives in Step 1 rather than at a checkout point).**

- [ ] **Step 4: Validate**

Run: `grep -c 'token 一致性檢查' commands/agent-work-team-develop.md commands/agent-work-team-knowledge.md && grep -c '疑似.*重用' commands/agent-work-team-develop.md commands/agent-work-team-knowledge.md`
Expected: each file has `>= 1` for both greps.

- [ ] **Step 5: Commit**

```bash
git add commands/agent-work-team-develop.md commands/agent-work-team-knowledge.md
git commit -m "Reject resuming Development/Knowledge stages when the RQ-ID token looks reused"
```

---

### Task 4: New `/agent-work-team-resume` command

**Files:**
- Create: `commands/agent-work-team-resume.md`

**Interfaces:**
- Consumes: `state.json`, `planning/checkpoint.json`, `pm-triage.json` written by Tasks 1–2.
- Produces: no new files — pure control-flow command that either re-enters `agent-work-team.md`'s BA loop / approval gate, or tells the user which other command to run.

- [x] **Step 1: Step 1 reads `.agent-work-team/dashboard.md` once and parses its table (falling back to Glob+Read of every `state.json` only if the dashboard file doesn't exist) to classify by `current_stage` into Planning-owned / Dev-owned / Knowledge-owned / DONE — avoiding a per-request `state.json` read for the initial listing. Any dashboard skipped-request warning is surfaced to the user. Step 3 (see below) re-reads the authoritative `state.json` for whichever request is picked, so this optimization never affects the actual routing decision — only the cost of the initial listing.**

- [x] **Step 2: Step 2 lists every in-flight request with id/name/current_stage/status/waiting_on plus a concrete reason line — Planning items read `planning/checkpoint.json`'s `reason`/`pending.prompt`; `Blocked` items (any stage) always show a reason (checkpoint for Planning, pointer to `dev/*-review.md`/`final-review.md` for Dev, pointer to re-running the command for Knowledge). Uses `AskUserQuestion` to let the user pick — does NOT auto-pick the latest-updated request.**

- [x] **Step 3: If the picked request is Dev-owned or Knowledge-owned, print the exact command to run (`/agent-work-team-develop <id>` or `/agent-work-team-knowledge <id>`) and stop — no further work here.**

- [x] **Step 4: Step 3 re-reads the full `state.json` (not just `token`) for the picked Planning-owned request — this is the authoritative copy Step 4 routes on, superseding whatever `current_stage`/`status` the dashboard-derived listing showed — plus `planning/checkpoint.json.token` and `pm-triage.json.token` (whichever exist), and stops with a clear warning on any token mismatch before touching anything else.**

- [x] **Step 5: Step 4 routes by the `current_stage` re-read in Step 3 (never the dashboard-derived value from Step 1): `BA_CLARIFYING` clears `Pending Confirmation`/`Blocked` back to `Running`, replays `clarification_log` + `pending.prompt` via `AskUserQuestion`, then continues exactly as `agent-work-team.md` Step 3's loop; `PENDING_SPEC_APPROVAL` re-enters the Step 5 approval gate; `SPEC_DRAFTING`/`PM_TRIAGE` show the persisted `reason` and offer to re-dispatch the relevant subagent; `CREATED` (no checkpoint possible) is treated as stranded — offers to start PM triage or delete the folder, never fabricates a pending question.**

- [x] **Step 6: A closing consistency note describes tolerating `checkpoint.sub_step` vs `state.json.current_stage` divergence — `current_stage` always wins for routing.**

- [ ] **Step 7: Validate**

Run: `head -1 commands/agent-work-team-resume.md && grep -c '^description:' commands/agent-work-team-resume.md && grep -c 'AskUserQuestion' commands/agent-work-team-resume.md && grep -c 'token' commands/agent-work-team-resume.md && grep -c 'BA_CLARIFYING' commands/agent-work-team-resume.md && grep -c 'PENDING_SPEC_APPROVAL' commands/agent-work-team-resume.md`
Expected: first line `---`, `description:` count `1`, all other counts `>= 1`.

- [ ] **Step 8: Commit**

```bash
git add commands/agent-work-team-resume.md
git commit -m "Add /agent-work-team-resume to recover in-flight Planning requests from a fresh session"
```

---

### Task 5: New `/agent-work-team-help` command

**Files:**
- Create: `commands/agent-work-team-help.md`

- [x] **Step 1: Static command listing all six commands (`/agent-work-team`, `/agent-work-team-resume`, `/agent-work-team-develop`, `/agent-work-team-knowledge`, `/agent-work-team-dashboard`, `/agent-work-team-help`) with a one-line description each, the `current_stage` lifecycle diagram, and the `status` legend including the new `Pending Confirmation` value.**

- [ ] **Step 2: Validate**

Run: `grep -c '/agent-work-team' commands/agent-work-team-help.md && grep -c 'Pending Confirmation' commands/agent-work-team-help.md`
Expected: `/agent-work-team` count `>= 6` (each command mentioned at least once), `Pending Confirmation` count `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-help.md
git commit -m "Add /agent-work-team-help command catalog"
```

---

### Task 6: Design docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Create: `docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Update the Planning spec's file-structure block to include `planning/checkpoint.json`, correct the stale progress table (0/10/30/60/90/100 → 10/20/30/40/50 matching the actual command), add `token` to the `state.json` schema, and add `Pending Confirmation` to the status enum with a cross-reference to the new spec.**

- [x] **Step 2: Write the new spec doc covering the `Pending Confirmation` status, `planning/checkpoint.json` schema, write-ordering invariant, `token` reuse-protection mechanism (including its known residual limitation), the resume/help command procedures, and hook-impact analysis (no hook changes needed).**

- [x] **Step 3: Update `CLAUDE.md`'s 目前狀態 section to mention `/agent-work-team-resume` and `/agent-work-team-help`, the `Pending Confirmation` status, and the checkpoint file.**

- [ ] **Step 4: Validate**

Run: `grep -c 'Pending Confirmation' docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md CLAUDE.md`
Expected: each file `>= 1`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md CLAUDE.md
git commit -m "Document Planning soft-stop persistence, resume, and help commands"
```

---

### Task 7: Manual testing checklist

**Files:**
- Modify: `docs/manual-testing-checklist.md`

- [ ] **Step 1: Add a new section covering: checkpoint accumulates incrementally during BA questions; `state.json.status` shows `Pending Confirmation` while a question is open and `dashboard.md` reflects it; closing the session mid-BA and running `/agent-work-team-resume` in a fresh session lists the request with its exact pending question and resumes correctly; `PENDING_SPEC_APPROVAL` resume path; a `Blocked` request (any stage) shows its reason; a stranded `CREATED` request is handled without crashing; `/agent-work-team-help` output; a deliberately mismatched `token` in `planning/checkpoint.json` causes `/agent-work-team-resume` to refuse and warn instead of resuming.**

- [ ] **Step 2: Commit**

```bash
git add docs/manual-testing-checklist.md
git commit -m "Add manual test checklist for Planning resume, help, and token reuse protection"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (manual verification only).

- [ ] **Step 1: Run through the full new checklist section from Task 7 in a real test project, including the deliberate session-loss scenario (start `/agent-work-team`, answer 1–2 BA questions, close the terminal/session entirely, open a fresh session, run `/agent-work-team-resume`, confirm the exact pending question reappears and the flow continues to `SPEC_APPROVED` without any lost Q&A).**

This step is manual because installing and invoking a plugin's slash commands, and observing a multi-session resume scenario, is not something scriptable via Bash.
