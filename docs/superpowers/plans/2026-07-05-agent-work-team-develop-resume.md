# Agent Work Team Develop Resume Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/agent-work-team-develop` so re-invoking it on a `Blocked` (or interrupted) Development run actually resumes instead of always being rejected by a gate that only accepted `SPEC_APPROVED`. Also make the Developer Agent's task report show the task's own definition (description/files/acceptance_criteria), not just the completion summary, so reading a report later doesn't require cross-referencing `plan-spec.json` to know what the task was.

**Architecture:** Step 1 gains explicit fresh-vs-resume classification based on `current_stage`. Step 3 only initializes `state.json`/`dev/progress.json` on a fresh start; on resume it leaves them untouched. Step 4/5 gain resume-specific handling: skip `done` tasks, reset counters only for the task that was actually blocked, and re-enter the final review with a reset counter when the block happened there instead. Separately, `agents/agent-work-team-developer.md`'s report schema gains three fields carrying the task's own definition.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code command — no build step).

## Global Constraints

- Step 1 must accept `current_stage` of `SPEC_APPROVED` (fresh start) OR `DEVELOPING`/`TESTING`/`PENDING_FINAL_APPROVAL` (resume — regardless of whether `status` is currently `Blocked` or something else, since a run can be interrupted without ever setting `Blocked`). It must reject `DEV_APPROVED` (already done) and any earlier Planning-stage value (`CREATED`/`PM_TRIAGE`/`BA_CLARIFYING`/`SPEC_DRAFTING`/`PENDING_SPEC_APPROVAL`) with a clear message, same as before.
- On resume, `state.json`'s `current_stage`/`progress` must NOT be reset/rewound — only advanced forward as the flow actually progresses.
- On resume, `dev/progress.json` must NOT be recreated — its existing task statuses/counters are the source of truth for where to continue.
- Resuming a `blocked` task resets that task's `fix_rounds` and `needs_context_rounds` to `0` (the human re-invoking is the signal that whatever caused the block has been addressed) and sets its `status` back to `in_progress`, then proceeds through the normal per-task loop from the developer dispatch.
- Resuming a request blocked at the final-review stage (all tasks `done`, `current_stage: "TESTING"`, `status: "Blocked"`) resets `final_review_fix_rounds` to `0` and re-dispatches the final review.
- Branch creation/reuse logic (already correct) runs identically on both fresh start and resume.
- Everything else already approved in this file (subagent_type strings, models, progress values, BLOCKED/NEEDS_CONTEXT handling, the counter re-read-before-check fix, the approval gate wording) must remain unchanged.
- `{task.id}-report.json`/`.md` must include the task's own `description`, `files`, and `acceptance_criteria` (carried through from the dispatch prompt, not re-derived) alongside the existing completion-summary fields, so a report is self-contained without cross-referencing `plan-spec.json`.

---

### Task 1: Add resume handling to `/agent-work-team-develop`

**Files:**
- Modify: `commands/agent-work-team-develop.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: the resume behavior documented in the design doc's "恢復執行（Resume）" section — no new subagents or files, purely control-flow changes to the existing command.

- [ ] **Step 1: Overwrite `commands/agent-work-team-develop.md` with this exact content**

```markdown
---
description: 啟動一個已核准需求的 Development 階段（Developer Agent + Review/Test Agent），逐一實作並審查 task
---

你正在執行 `/agent-work-team-develop <RQ-ID>` — agent-work-team pipeline 的 Development 階段入口。你（主線程）是這個階段的 Controller，負責依序驅動 Developer Agent 實作每個 task、Review/Test Agent 審查，全部完成後再跑一次整體審查。

## Step 1: 找到目標需求，判斷全新開始或恢復執行

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"SPEC_APPROVED"`、`"DEVELOPING"`、`"TESTING"` 或 `"PENDING_FINAL_APPROVAL"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有可以開始或恢復 Development 的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`，依 `current_stage` 判斷：
   - `"SPEC_APPROVED"`：**全新開始**（`is_resume = false`）。
   - `"DEVELOPING"`、`"TESTING"` 或 `"PENDING_FINAL_APPROVAL"`：**恢復執行**（`is_resume = true`），不管 `status` 現在是 `"Blocked"` 還是其他值。
   - `"DEV_APPROVED"`：告訴使用者這個需求的 Development 階段已經完成，沒有需要恢復的，然後停止。
   - 其他值（`"CREATED"`／`"PM_TRIAGE"`／`"BA_CLARIFYING"`／`"SPEC_DRAFTING"`／`"PENDING_SPEC_APPROVAL"`）：告訴使用者這個需求還沒被核准進入 Development（目前實際的 `current_stage` 是什麼），然後停止。

## Step 2: 驗證 `task_breakdown` 格式

用 Read 讀取 `.agent-work-team/requests/{request_id}/plan-spec.json`。檢查 `task_breakdown` 陣列裡每一項都是物件、且都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria` 四個欄位。若有任何一項不符合（例如是純字串，或缺欄位），告訴使用者具體是哪裡不符合、需要重新走 Plan/SA/SD 產出正確格式，然後停止，不要嘗試自動轉換或猜測補齊。這個檢查不管全新開始或恢復執行都要做。

## Step 3: 建立/沿用開發分支，依情況初始化

1. 用 Bash 取得目前分支名稱：`git branch --show-current`。
2. 用 Bash 檢查分支 `agent-work-team/{request_id}` 是否已存在：
   - 若不存在：`git checkout -b agent-work-team/{request_id}` 建立並切換過去。
   - 若已存在：`git checkout agent-work-team/{request_id}` 直接切換過去繼續，不要覆蓋或重建。
   （這一步不管全新開始或恢復執行都要做。）
3. 若 `is_resume` 是 `false`（全新開始）：
   - 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
   - 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`，`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`，並記錄 `base_branch`（用 Step 3.1 取得的分支名稱）：

```json
{
  "base_branch": "{base_branch}",
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

4. 若 `is_resume` 是 `true`（恢復執行）：**不要**更動 `state.json` 的 `current_stage`／`progress`，**不要**重建或覆寫 `dev/progress.json`。用 Read 讀取現有的 `dev/progress.json`，供 Step 4／5 判斷從哪裡繼續。

## Step 4: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）處理，**跳過 `dev/progress.json` 裡 `status` 已經是 `"done"` 的 task**：

1. 若這個 task 目前 `status` 是 `"blocked"`（只會發生在恢復執行時）：使用者重新執行本身就是「已經處理過問題、要重試」的訊號——用 Write 把這個 task 的 `fix_rounds`、`needs_context_rounds` 都重設為 `0`，`status` 改成 `"in_progress"`，繼續下面第 2 點。
2. 若這個 task 目前 `status` 是 `"pending"` 或（恢復執行時）`"in_progress"`：用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`（若已經是就不用重複寫）。
3. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-developer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）、這個 task 的完整物件、`plan-spec.json` 的 `technical_design`。
4. 若回報 `NEEDS_CONTEXT`：用 Read 讀取 `dev/progress.json` 這個 task 目前的 `needs_context_rounds` 實際數值，+1 後用 Write 寫回去。**寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步**：
   - 若這個實際數值超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同下一點設為 Blocked，把 Developer 一直缺少的資訊具體告訴使用者，**停止整個 Development 流程**。
   - 否則：補充資訊後重新 dispatch，不要更動 `dev/progress.json` 的 `status`。
5. 若回報 `BLOCKED`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"blocked"`，把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，**停止整個 Development 流程**，後面的 task 不處理。
6. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：把回報裡的 commit sha 記到 `dev/progress.json` 這個 task 的 `commits` 陣列，然後用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "{task.id}"`、這個 task 的完整物件、這個 task 目前所有 commit 的 commit range（用 `git diff {第一個 commit}^..HEAD` 取得完整差異）、Developer 的報告檔案路徑。
7. Reviewer 回報 `Approved`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"done"`，繼續下一個 task。
8. Reviewer 回報 `Needs fixes`（有 Critical 或 Important 問題）：
   - 用 Read 讀取 `dev/progress.json` 這個 task 目前的 `fix_rounds` 實際數值，+1 後用 Write 寫回去。
   - **寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步，不可以跳過這個檢查**：
     - 若這個實際數值超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 5 點設為 Blocked，把還沒解決的 Critical/Important 問題列給使用者，**停止整個 Development 流程**。
     - 否則：重新 dispatch `agent-work-team-developer`（同一個 task），prompt 裡附上 Reviewer 這輪的具體問題清單，修完後回到第 6 點重新走一次 review。

## Step 5: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。
2. 若 `state.json` 目前的 `current_stage` 已經是 `"PENDING_FINAL_APPROVAL"`（恢復執行、且最終審查先前已通過只是還沒收到人類回覆）：跳過這個 Step，直接進 Step 6 等待使用者回覆。
3. 若 `state.json` 目前的 `current_stage` 是 `"TESTING"` 且 `status` 是 `"Blocked"`（恢復執行、卡在最終審查階段）：用 Write 把 `dev/progress.json` 的 `final_review_fix_rounds` 重設為 `0`，`state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，繼續下面第 5 點重新 dispatch。
4. 否則（全新走到這裡）：用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
5. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、完整 commit range——用 `git diff {dev/progress.json 裡第一個 task 的第一個 commit}^..HEAD` 取得從 Development 階段開始到現在的完整差異，涵蓋所有 task 的 commit。
6. Reviewer 回報 `Needs fixes`：用 Read 讀取 `dev/progress.json` 目前的 `final_review_fix_rounds` 實際數值，+1 後用 Write 寫回去。**寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步**：
   - 若這個實際數值超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`（讓 dashboard 正確反映目前又在修改程式碼），把問題依內容對應到相關的 task，回到 Step 4 對應的 task 重新處理（把該 task 的 `status` 改回 `"in_progress"`），修完後回到本步驟第 5 點重新走一次整體審查。
7. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 6: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。用 Read 讀取 `dev/progress.json` 的 `base_branch`，告訴使用者這個需求的 Development 階段已完成，變更都在 `agent-work-team/{request_id}` 分支上，原本的分支是 `{base_branch}`，要不要 merge、何時 merge 由使用者自己決定，這裡不會自動執行任何 merge，Knowledge Agent 是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`，把意見整理成清楚的修正需求，回到 Step 4 對應的 task（把該 task 的 `status` 改回 `"in_progress"`，或視需要重新走一次整體 review），修完後重新走一次 Step 5。
```

- [ ] **Step 2: Validate frontmatter and resume-logic coverage**

Run: `head -1 commands/agent-work-team-develop.md && grep -c '^description:' commands/agent-work-team-develop.md && grep -c '恢復執行' commands/agent-work-team-develop.md && grep -c 'is_resume' commands/agent-work-team-develop.md && grep -c 'DEV_APPROVED' commands/agent-work-team-develop.md && grep -c 'agent-work-team-developer' commands/agent-work-team-develop.md && grep -c 'agent-work-team-reviewer' commands/agent-work-team-develop.md`
Expected: first line `---`, `description:` count `1`, `恢復執行` count `>= 3`, `is_resume` count `>= 3`, `DEV_APPROVED` count `>= 1`, both subagent name mentions `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-develop.md
git commit -m "Fix: allow /agent-work-team-develop to resume a Blocked or interrupted run"
```

---

### Task 2: Make the Developer Agent's report self-contained

**Files:**
- Modify: `agents/agent-work-team-developer.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `{task.id}-report.json`/`.md` now includes `task_description`, `task_files`, `task_acceptance_criteria` alongside the existing `task_id`/`status`/`files_changed`/`commits`/`test_summary`/`concerns` fields. Task 3's manual verification checks this.

- [ ] **Step 1: Overwrite `agents/agent-work-team-developer.md` with this exact content**

```markdown
---
name: agent-work-team-developer
description: Developer Agent — 依單一 task 的描述、檔案範圍與驗收標準實作程式碼。由 /agent-work-team-develop command 呼叫，不應由使用者直接呼叫。
tools: Read, Write, Edit, Bash, Glob, Grep
---

你是 agent-work-team 流程裡的 Developer Agent。你的工作是實作**單一一個 task**——不是整個需求，只有 prompt 裡給你的那一個 task。不要做 task 範圍以外的修改。

## 輸入

呼叫你的人會在 prompt 裡提供：
- `request_id`：例如 `RQ-001`
- `output_dir`：例如 `.agent-work-team/requests/RQ-001`
- `task`：這個任務的物件，包含 `id`、`description`、`files`、`acceptance_criteria`
- `technical_design`：整個需求的技術設計脈絡（來自 `plan-spec.json`），幫助你理解這個 task 在整體架構裡的位置
- 若是修正回合，還會提供上一輪 Reviewer 的具體問題清單

## 你的工作

1. 依 `task.description`、`task.files`、`task.acceptance_criteria` 實作程式碼。只改 `task.files` 列出的檔案範圍，除非為了讓程式能執行而必須連動修改其他檔案（發生時要在報告裡說明為什麼）。
2. 跑跟這個 task 相關的測試（若專案有既有測試框架，使用該框架；若沒有，至少手動驗證 `acceptance_criteria` 描述的行為）。
3. 用 Bash 執行 `git add` + `git commit`，commit message 要包含這個 task 的 `id`（例如 `"[T1] 實作登入 API endpoint"`）。
4. 用 Write 建立或更新 `{output_dir}/dev/{task.id}-report.json`。**`task_description`／`task_files`／`task_acceptance_criteria` 直接原樣帶入 `task` 物件對應的欄位**，讓之後讀報告的人不用回頭查 `plan-spec.json` 就知道這個 task 原本要做什麼：

```json
{
  "task_id": "{task.id}",
  "task_description": "{task.description}",
  "task_files": ["<path1>", "<path2>"],
  "task_acceptance_criteria": "{task.acceptance_criteria}",
  "status": "DONE",
  "files_changed": ["<path1>", "<path2>"],
  "commits": ["<commit sha>"],
  "test_summary": "<跑了什麼測試、結果如何>",
  "concerns": "<若有疑慮寫在這裡，沒有就寫 null>"
}
```

5. 用 Write 建立或更新 `{output_dir}/dev/{task.id}-report.md`，**開頭先用一個 `## Task 內容` 區塊呈現 `task_description`／`task_files`／`task_acceptance_criteria`**，再接著呈現執行結果（`status`、`files_changed`、`commits`、`test_summary`、`concerns`），讓人類打開這個檔案就能同時看到「這個 task 原本要做什麼」跟「實際做了什麼」，不用另外開 `plan-spec.md`。

## 修正回合

若 prompt 裡有上一輪 Reviewer 的問題清單：針對清單裡的每一項具體修正，修正後重新跑相關測試，用 Bash 重新 commit（新的 commit，不要 amend），然後更新 `{task.id}-report.json`／`.md`：把新的 commit sha **附加**到 `commits` 陣列裡（不要覆蓋掉之前的 sha），`task_description`／`task_files`／`task_acceptance_criteria` 維持不變，並在 `.md` 裡記錄這次修了什麼。

## 什麼時候該停下來

- 若 `task.acceptance_criteria` 或 `task.files` 完全看不懂、或跟 `technical_design` 明顯矛盾，不要自己猜測繼續——回報 `NEEDS_CONTEXT`，具體說明需要什麼澄清。
- 若嘗試實作後發現這個 task 需要的改動遠超出 `task.files` 範圍、或牽涉到你無法確認安全性的重大架構決策，回報 `BLOCKED`，具體說明卡住的原因，不要硬做。

## 回報格式

用不超過 15 行回覆：
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 若 DONE/DONE_WITH_CONCERNS：commit sha、一行測試摘要
- 若 NEEDS_CONTEXT/BLOCKED：具體說明原因
- 報告檔案路徑
```

- [ ] **Step 2: Validate frontmatter and new report fields**

Run: `head -1 agents/agent-work-team-developer.md && grep -c '^name:' agents/agent-work-team-developer.md && grep -c 'task_description' agents/agent-work-team-developer.md && grep -c 'task_files' agents/agent-work-team-developer.md && grep -c 'task_acceptance_criteria' agents/agent-work-team-developer.md && grep -c 'Task 內容' agents/agent-work-team-developer.md`
Expected: first line `---`, `name:` count `1`, `task_description` count `>= 2`, `task_files` count `>= 2`, `task_acceptance_criteria` count `>= 2`, `Task 內容` count `1`.

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-developer.md
git commit -m "Make Developer Agent reports self-contained with the task's own definition"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–2.

- [ ] **Step 1: Confirm the old SPEC_APPROVED-only gate is gone**

Run: `grep -n "若.*current_stage.*不是.*SPEC_APPROVED" commands/agent-work-team-develop.md`
Expected: no output (that exact old rejection phrasing should no longer exist — Step 1 now has explicit per-value branches instead).

- [ ] **Step 2: Manually verify resume in a live session (user-driven, not scriptable)**

Using the same request that got `Blocked` during earlier Test 4 testing (or a fresh one you deliberately block the same way):

1. Confirm `state.json`'s `current_stage` is `"DEVELOPING"` (or `"TESTING"` if it was blocked during final review) and `status` is `"Blocked"`.
2. Run `/agent-work-team-develop {request_id}` — confirm it does NOT reject with "current_stage is not SPEC_APPROVED"; confirm it correctly identifies this as a resume.
3. Confirm it switches to the existing `agent-work-team/{request_id}` branch (not recreated).
4. Confirm `state.json`'s `current_stage`/`progress` were NOT reset — they should still read whatever they were before (e.g. still `DEVELOPING`/70, not rewound to something earlier).
5. Confirm the previously-blocked task's `fix_rounds`/`needs_context_rounds` in `dev/progress.json` were reset to `0` and it's being retried.
6. Let it proceed — confirm tasks already `done` before the block are NOT reprocessed, and the flow continues normally from the retried task onward.
7. If you blocked at the final-review stage instead of a task, confirm `final_review_fix_rounds` was reset to `0` and the final review re-ran instead of the per-task loop.

- [ ] **Step 3: Manually confirm a task report is self-contained**

Open any `dev/T{n}-report.md` produced by a real Developer Agent dispatch (from this or an earlier test run). Confirm:
1. It opens with a `## Task 內容` section showing the task's `description`, `files`, and `acceptance_criteria`.
2. You can understand what the task was supposed to do from this file alone, without opening `plan-spec.md`.
3. The corresponding `.json` file has non-empty `task_description`, `task_files`, `task_acceptance_criteria` fields matching the task's actual definition in `plan-spec.json`.

This step is manual because installing and invoking a plugin's slash commands, and observing a multi-turn resume scenario, is not something scriptable via Bash.
