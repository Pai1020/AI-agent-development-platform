# Agent Work Team Develop Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/agent-work-team-develop` branch off the user's current branch before implementing anything, instead of committing directly to whatever branch happens to be checked out.

**Architecture:** Step 3 of the existing command gains branch creation/reuse logic before the per-task loop begins; `dev/progress.json` gains a `base_branch` field recording what to merge back into later. No auto-merge — the approval message at the end just reports which branch the work landed on.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code command — no build step).

## Global Constraints

- New branch name: `agent-work-team/{request_id}` (e.g. `agent-work-team/RQ-001`).
- `base_branch` is whatever branch `git branch --show-current` reports at the start — never assumed to be `main` or any fixed name.
- If the branch already exists (e.g. resuming after a prior `Blocked` run), switch to it — never recreate or overwrite.
- No automatic merge/push at any point — this plugin never performs operations that affect shared branch state without the user doing it themselves.
- The final `DEV_APPROVED` approval message must state both the working branch name and `base_branch`.

---

### Task 1: Add branch creation to `/agent-work-team-develop`

**Files:**
- Modify: `commands/agent-work-team-develop.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `dev/progress.json`'s `base_branch` field, and the `agent-work-team/{request_id}` git branch that all of Step 4/5's dispatched subagents will find themselves working on (no changes needed to the Developer/Reviewer subagents themselves — they just inherit whatever branch is checked out).

- [ ] **Step 1: Overwrite `commands/agent-work-team-develop.md` with this exact content**

```markdown
---
description: 啟動一個已核准需求的 Development 階段（Developer Agent + Review/Test Agent），逐一實作並審查 task
---

你正在執行 `/agent-work-team-develop <RQ-ID>` — agent-work-team pipeline 的 Development 階段入口。你（主線程）是這個階段的 Controller，負責依序驅動 Developer Agent 實作每個 task、Review/Test Agent 審查，全部完成後再跑一次整體審查。

## Step 1: 找到目標需求

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"SPEC_APPROVED"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有處於 SPEC_APPROVED 狀態的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`。若 `current_stage` 不是 `"SPEC_APPROVED"`，告訴使用者目前實際的 `current_stage` 是什麼，然後停止，不要繼續。

## Step 2: 驗證 `task_breakdown` 格式

用 Read 讀取 `.agent-work-team/requests/{request_id}/plan-spec.json`。檢查 `task_breakdown` 陣列裡每一項都是物件、且都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria` 四個欄位。若有任何一項不符合（例如是純字串，或缺欄位），告訴使用者具體是哪裡不符合、需要重新走 Plan/SA/SD 產出正確格式，然後停止，不要嘗試自動轉換或猜測補齊。

## Step 3: 建立開發分支並初始化 Development 狀態

1. 用 Bash 取得目前分支名稱：`git branch --show-current`，記錄為 `base_branch`（這可能是 `main`、`develop`、`feature/xyz` 或任何分支，不要假設一定是 `main`）。
2. 用 Bash 檢查分支 `agent-work-team/{request_id}` 是否已存在：
   - 若不存在：`git checkout -b agent-work-team/{request_id}` 建立並切換過去。
   - 若已存在（例如上次執行 Blocked 後重新執行 `/agent-work-team-develop`）：`git checkout agent-work-team/{request_id}` 直接切換過去繼續，不要覆蓋或重建。
3. 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
4. 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`（若這個檔案已經存在，代表是恢復執行，不要覆蓋既有內容），`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`，並記錄 `base_branch`：

```json
{
  "base_branch": "{base_branch}",
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

## Step 4: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）做以下事情：

1. 用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-developer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）、這個 task 的完整物件、`plan-spec.json` 的 `technical_design`。
3. 若回報 `NEEDS_CONTEXT`：把 `dev/progress.json` 這個 task 的 `needs_context_rounds` +1。
   - 若 `needs_context_rounds` 超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 4 點設為 Blocked，把 Developer 一直缺少的資訊具體告訴使用者，**停止整個 Development 流程**。
   - 否則：補充資訊後重新 dispatch，不要更動 `dev/progress.json` 的 `status`。
4. 若回報 `BLOCKED`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"blocked"`，把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，**停止整個 Development 流程**，後面的 task 不處理。
5. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：把回報裡的 commit sha 記到 `dev/progress.json` 這個 task 的 `commits` 陣列，然後用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "{task.id}"`、這個 task 的完整物件、這個 task 目前所有 commit 的 commit range（用 `git diff {第一個 commit}^..HEAD` 取得完整差異）、Developer 的報告檔案路徑。
6. Reviewer 回報 `Approved`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"done"`，繼續下一個 task。
7. Reviewer 回報 `Needs fixes`（有 Critical 或 Important 問題）：
   - 把 `dev/progress.json` 這個 task 的 `fix_rounds` +1。
   - 若 `fix_rounds` 超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 4 點設為 Blocked，把還沒解決的 Critical/Important 問題列給使用者，**停止整個 Development 流程**。
   - 否則：重新 dispatch `agent-work-team-developer`（同一個 task），prompt 裡附上 Reviewer 這輪的具體問題清單，修完後回到第 5 點重新走一次 review。

## Step 5: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、完整 commit range——用 `git diff {dev/progress.json 裡第一個 task 的第一個 commit}^..HEAD` 取得從 Development 階段開始到現在的完整差異，涵蓋所有 task 的 commit。
3. Reviewer 回報 `Needs fixes`：把 `dev/progress.json` 的 `final_review_fix_rounds` +1。
   - 若超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`（讓 dashboard 正確反映目前又在修改程式碼），把問題依內容對應到相關的 task，回到 Step 4 對應的 task 重新處理，修完後回到本步驟第 1 點重新走一次整體審查。
4. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 6: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。用 Read 讀取 `dev/progress.json` 的 `base_branch`，告訴使用者這個需求的 Development 階段已完成，變更都在 `agent-work-team/{request_id}` 分支上，原本的分支是 `{base_branch}`，要不要 merge、何時 merge 由使用者自己決定，這裡不會自動執行任何 merge，Knowledge Agent 是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`，把意見整理成清楚的修正需求，回到 Step 4 對應的 task（或視需要重新走一次整體 review），修完後重新走一次 Step 5。
```

- [ ] **Step 2: Validate frontmatter and branching coverage**

Run: `head -1 commands/agent-work-team-develop.md && grep -c '^description:' commands/agent-work-team-develop.md && grep -c 'agent-work-team/{request_id}' commands/agent-work-team-develop.md && grep -c 'base_branch' commands/agent-work-team-develop.md && grep -c 'git checkout -b' commands/agent-work-team-develop.md && grep -c 'git checkout agent-work-team' commands/agent-work-team-develop.md && grep -c 'merge' commands/agent-work-team-develop.md`
Expected: first line `---`, `description:` count `1`, `agent-work-team/{request_id}` count `>= 3`, `base_branch` count `>= 3`, `git checkout -b` count `1`, `git checkout agent-work-team` count `1`, `merge` count `>= 1` (the "no auto-merge" statement in the approval message).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-develop.md
git commit -m "Branch off the current branch before Development stage work instead of committing directly to it"
```

---

### Task 2: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Task 1.

- [ ] **Step 1: Confirm the branching instructions are present and self-consistent**

Run: `grep -n 'checkout' commands/agent-work-team-develop.md`
Expected output includes both:
```
2. 用 Bash 檢查分支 `agent-work-team/{request_id}` 是否已存在：
   - 若不存在：`git checkout -b agent-work-team/{request_id}` 建立並切換過去。
   - 若已存在（例如上次執行 Blocked 後重新執行 `/agent-work-team-develop`）：`git checkout agent-work-team/{request_id}` 直接切換過去繼續，不要覆蓋或重建。
```

- [ ] **Step 2: Manually walk through branch creation in a scratch test project (user-driven, not scriptable)**

In a scratch project where this plugin is installed and updated with this change, on a non-`main` branch (e.g. create and check out a throwaway branch first, to prove `base_branch` isn't assumed to be `main`):

1. Run `/agent-work-team "測試需求"` through to `SPEC_APPROVED` on that branch.
2. Run `/agent-work-team-develop {request_id}` — confirm (`git branch --show-current`) that it switched to `agent-work-team/{request_id}`, and that `dev/progress.json`'s `base_branch` correctly recorded the non-`main` branch you started on.
3. Let it run through to `DEV_APPROVED` — confirm the approval message names both the working branch and the correct `base_branch`, and that no merge happened (`git log` on the original branch shows no new commits).
4. Manually check out the original `base_branch` — confirm it's unaffected (doesn't contain the Development-stage commits).
5. Simulate a resume: check out `agent-work-team/{request_id}` manually, then re-run `/agent-work-team-develop {request_id}` for the same (now further-progressed or blocked) request — confirm it switches to the existing branch rather than erroring or recreating it.

This step is manual because installing and invoking a plugin's slash commands, and inspecting live git branch state across a multi-turn pipeline, is not something scriptable via Bash.
