# Agent Work Team Develop Commit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose, at Spec approval time, whether a request's `agent-work-team/{request_id}` Development branch ends up as a single squashed commit or keeps today's one-commit-per-task history — without touching per-task Developer/Reviewer logic, review commit-range calculation, or resume behavior.

**Architecture:** A new artifact `planning/dev-config.json` (`{"commit_mode": "squash" | "per_task"}`) is written once, at the Spec approval gate in `commands/agent-work-team.md`, based on an explicit user choice. `commands/agent-work-team-develop.md` reads it right after resolving the target request (asking and backfilling it for legacy requests that predate this feature), then runs Steps 3–6 (task loop, per-task review, final review) completely unchanged regardless of mode. Only at the very end — inside the Human Approval Gate, after the user says approve and before writing `DEV_APPROVED` — does the Controller run a one-time `git reset --soft` + `git commit` squash when `commit_mode` is `"squash"`. `per_task` mode is a no-op change: identical to current behavior end to end.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code command definitions — no build step, no automated test suite; verification is manual, prompt-driven).

## Global Constraints

- Only two `commit_mode` values exist: `"squash"` and `"per_task"`. No other values, no version field (YAGNI — see spec's "邊界與非目標").
- `planning/dev-config.json` is written exactly once, at the point the user's Spec approval becomes final (`SPEC_APPROVED`) — never rewritten automatically afterward.
- `squash` mode must not change: Developer/Reviewer subagent prompts, per-task or final review commit-range calculation, or `dev/progress.json` schema. The only new Git side effect is the one-time squash in the Human Approval Gate, executed by the Controller (main thread) via Bash — never by a subagent.
- Legacy requests already `SPEC_APPROVED` (or further along) without `planning/dev-config.json` must stop and ask the user to pick a mode now, then backfill the file — never silently default to either mode.
- No automatic merge to `base_branch` at any point — unrelated to `commit_mode`, unchanged from current behavior.
- This branch is based on `docs/plugin-current-state` (not yet merged to `main`) because it's the only branch containing `docs/architecture/prompt-orchestration-determinism.md`, which `CLAUDE.md`'s "Prompt 編排確定性協作" section requires reading/updating for changes like this one (new artifact, new Controller-owned Git side effect, modified approval-gate behavior). Task 3 below does that update.
- Squash commit message format: `[{request_id}] {plan-spec.json 的 requirement_summary}（{dev/progress.json 裡所有 task id，逗號連接}）`.
- Before squashing, the Controller must confirm the working tree is clean (`git status --porcelain` empty) as a safety net — if not, stop and tell the user rather than auto-committing or discarding anything.

---

### Task 1: Add commit-mode selection to the Spec approval gate

**Files:**
- Modify: `commands/agent-work-team.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `.agent-work-team/requests/{request_id}/planning/dev-config.json` with a `commit_mode` field, written once when the Spec approval gate (Step 5) is first approved. Consumed by Task 2.

- [ ] **Step 1: Overwrite `commands/agent-work-team.md` with this exact content**

```markdown
---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。這個指令**只用來開一個全新需求**；若要接續一個已經在途（尚未到 `SPEC_APPROVED`）的需求，請改用 `/agent-work-team-resume`。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

`.agent-work-team/dashboard.md` 會由 plugin 的 hook 自動同步，你不需要做任何事去維護它。

**寫入順序不變式：** 任何時候要把 `planning/checkpoint.json` 與 `state.json` 一起更新（軟停、核准關卡），一律**先寫 checkpoint，再寫 state.json**。這樣即使兩次寫入之間 session 中斷，磁碟上的 checkpoint 一定不會比 state 舊，`/agent-work-team-resume` 才能安全地以它重建「停在哪、為什麼停」。

## Step 1: 建立新需求

1. 用 Bash 算出下一個 request id：

```bash
next=$(ls -d .agent-work-team/requests/RQ-* 2>/dev/null | sed 's#.*/RQ-##' | sort -n | tail -1)
next=${next:-0}
printf "RQ-%03d\n" $((10#$next + 1))
```

把輸出結果當作這次的 `request_id`（例如 `RQ-001`）。

2. 用 Bash 產生這個需求專屬的隨機識別碼 `token`（之後用來偵測 `request_id` 是否被重用——例如舊資料夾被刪除後同一個編號被分配給另一個需求）：

```bash
openssl rand -hex 4 2>/dev/null || printf '%04x%04x' $RANDOM $RANDOM
```

把輸出結果當作這次的 `token`（例如 `8f3a1c9d`）。`token` 是這個需求從建立到結束都不會改變的身分識別，之後每個階段寫自己的產出檔案時都要原樣帶著它。

3. 用 Bash 建立資料夾：`mkdir -p .agent-work-team/requests/{request_id}`
4. 用 Bash 取得今天日期：`date +%Y-%m-%d`，結果當作 `{today}`。
5. 用 Write 建立 `.agent-work-team/requests/{request_id}/state.json`：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "name": null,
  "type": null,
  "source": null,
  "team": null,
  "priority": null,
  "progress": 0,
  "current_stage": "CREATED",
  "current_agent": null,
  "status": "Running",
  "waiting_on": null,
  "created": "{today}",
  "updated": "{today}"
}
```

## Step 2: PM Agent 分類

1. 用 Write 更新 `state.json`：`current_stage: "PM_TRIAGE"`，`current_agent: "PM Agent"`，`progress: 10`，`updated` 改成今天日期（用 Bash 重新取得）。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-pm"`，`model: haiku`），在 prompt 裡提供：
   - `request_id`: `{request_id}`
   - `token`: `{token}`
   - `output_dir`: `.agent-work-team/requests/{request_id}`
   - `raw_description`: `$ARGUMENTS` 的原文
3. 若回報 `BLOCKED`：先用 Write 建立 `planning/checkpoint.json`（這個檔案在這個分支還不存在，Step 3 才會正常建立）記下卡住原因，讓之後 `/agent-work-team-resume` 能顯示「為什麼卡在這裡」：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "sub_step": "PM_TRIAGE",
  "pending": null,
  "clarification_log": [],
  "reason": "<PM 回報的具體卡住原因>",
  "updated": "{today}"
}
```

再用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把 PM 回報的具體原因告訴使用者，然後停止，不要繼續往下走。
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 20`，`updated` 改成今天日期。

## Step 3: BA 階段（你自己直接跟使用者對話，不要 dispatch subagent）

這個階段的每一組問答與每一次暫停，都要**即時**寫進 `.agent-work-team/requests/{request_id}/planning/checkpoint.json`，不要等到整段澄清結束才落地——這是讓這個階段能在 session 中斷後被 `/agent-work-team-resume` 接回去的關鍵。

1. 進入這個 Step 時，先用 Write 建立 `planning/checkpoint.json`：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "sub_step": "BA_CLARIFYING",
  "pending": null,
  "clarification_log": [],
  "reason": null,
  "updated": "{today}"
}
```

2. 一次問一個問題，釐清需求範圍、限制、成功標準，直到你能寫出完整的 Acceptance Criteria 清單。優先用 AskUserQuestion 工具讓使用者用選的，開放式問題才用純文字問。**在每次提問（第一題除外）之前**：先把上一組問答 `{"question": "...", "answer": "..."}` append 進 checkpoint 的 `clarification_log`；然後把 checkpoint 的 `pending` 設成這次要問的問題（`{"kind": "question", "prompt": "<問題原文>", "options": ["<選項>", ...]}`，純文字問題就把 `options` 設成 `[]`），`reason` 設成一行給人看的摘要（例如「BA 釐清中，等待回答：<問題摘要>」），`updated` 改成今天日期，用 Write 寫回 checkpoint；**接著**用 Write 更新 `state.json`：`status: "Pending Confirmation"`，`waiting_on: "Human"`（`current_stage`／`progress`／`current_agent` 維持不變，凍結在 `BA_CLARIFYING`/20/`BA Agent`）。做完這兩次 Write 才實際發問。
3. 使用者回答後，用 Write 把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，再進行下一輪（回到本步驟第 2 點，或視情況進第 4 點）。
4. 當你認為需求已經清楚：先把最後一組問答 append 進 checkpoint 的 `clarification_log`，把 `pending` 設成 `{"kind": "summary_confirmation", "prompt": "<完整需求摘要 + Acceptance Criteria 清單全文>", "options": []}`，`reason` 設成「需求摘要待確認」，用 Write 寫回 checkpoint；接著用 Write 更新 `state.json`：`status: "Pending Confirmation"`，`waiting_on: "Human"`。做完才把完整的「需求摘要」與「Acceptance Criteria 清單」念給使用者確認一次。
5. 使用者明確回覆確認（例如「確認」「approved」「可以」）才算通過；如果使用者提出修改，用 Write 把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，回到本步驟第 2 點繼續問，不要自己假設已經通過。
6. 通過後，用 Bash 取得今天日期，再用 Write 建立 `.agent-work-team/requests/{request_id}/ba-requirement.json`（`clarification_log` 直接取用 checkpoint 目前累積的完整陣列，不要重打）：

```json
{
  "id": "{request_id}",
  "requirement_summary": "<你整理的需求摘要>",
  "acceptance_criteria": [
    "<第一條 AC>",
    "<第二條 AC>"
  ],
  "clarification_log": [
    {"question": "<你問的問題>", "answer": "<使用者的回答>"}
  ],
  "approved_at": "{today}"
}
```

7. 用 Write 建立對應的 `.agent-work-team/requests/{request_id}/ba-requirement.md`（`# BA Requirement — {request_id}`，接著用 `##` 標題呈現需求摘要、Acceptance Criteria 清單、問答紀錄，內容跟 json 一致）。
8. 用 Write 更新 checkpoint：`pending: null`，`sub_step: "SPEC_DRAFTING"`，`reason: null`，`updated` 改成今天日期（保留這個檔案作為稽核紀錄，不要刪除）。
9. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 30`，`status: "Running"`，`waiting_on: null`，`updated` 改成今天日期。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`。
3. 若回報 `BLOCKED`：先用 Write 更新 checkpoint（此時已存在，Step 3 結尾建立過）：`sub_step: "SPEC_DRAFTING"`，`pending: null`，`reason: "<Plan/SA/SD 回報的具體卡住原因>"`，`updated` 改成今天日期；再用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：先用 Write 更新 checkpoint：`sub_step: "PENDING_SPEC_APPROVAL"`，`pending: {"kind": "spec_approval", "prompt": "Spec 已產出，待核准", "artifact": ".agent-work-team/requests/{request_id}/plan-spec.md"}`，`reason: "Spec 待人工核准"`，`updated` 改成今天日期；再用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 40`，`updated` 改成今天日期。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：
   1. 先用 Write 更新 checkpoint：`pending: null`，`sub_step: "SPEC_APPROVED"`，`reason: null`，`updated` 改成今天日期（保留檔案，不刪除）。
   2. 明確問使用者：這次 Development 要用哪種 commit 模式——`squash`（整個需求最後在 `agent-work-team/{request_id}` 分支上只留一個 commit，涵蓋所有 task 與所有修正回合）或 `per_task`（目前預設行為，每個 task 各自 commit，修正回合各自新增 commit）。拿到回答後，用 Write 建立 `.agent-work-team/requests/{request_id}/planning/dev-config.json`——選 squash 就寫：

```json
{ "commit_mode": "squash" }
```

選 per_task 就寫：

```json
{ "commit_mode": "per_task" }
```

   3. 用 Read 讀取 `plan-spec.json` 的 `task_breakdown`，用 Write 建立 `.agent-work-team/requests/{request_id}/task-summary.md`——一份純粹方便掃描「後續有哪些工作」的**靜態快照**，不是即時進度表（Development 開始後每個 task 的實際完成狀態要看 `dev/progress.json` 或 `.agent-work-team/dashboard.md`，這份檔案之後不會再更新）：

```markdown
# Task 總表 — {request_id}

> 這是 Spec 核准當下（{today}）的靜態快照，只反映當時的任務拆解，之後不會再更新。Development 開始後，每個 task 的即時完成狀態請看 `dev/progress.json` 或 `.agent-work-team/dashboard.md`。

| Task ID | 說明 | 預計異動檔案 |
|---|---|---|
| T1 | <task.description> | <task.files 用頓號或逗號連接成一行> |
| T2 | <task.description> | <task.files> |

共 {task_breakdown 陣列長度} 個 task。完整的驗收標準與技術設計脈絡請見 `plan-spec.md`。
```

   4. 用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 50`，`updated` 改成今天日期。
   5. 告訴使用者這個需求的 Planning 階段已完成，任務總表已產出於 `.agent-work-team/requests/{request_id}/task-summary.md`，可以執行 `/agent-work-team-develop {request_id}` 進入 Development 階段。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
```

- [ ] **Step 2: Validate frontmatter and commit-mode coverage**

Run: `head -1 commands/agent-work-team.md && grep -c '^description:' commands/agent-work-team.md && grep -c 'commit_mode' commands/agent-work-team.md && grep -c 'dev-config.json' commands/agent-work-team.md && grep -c 'squash' commands/agent-work-team.md && grep -c 'per_task' commands/agent-work-team.md`
Expected: first line `---`, `description:` count `1`, `commit_mode` count `>= 2` (the two literal `dev-config.json` JSON snippets — the prose question itself says "commit 模式", not the literal field name), `dev-config.json` count `>= 1`, `squash` count `>= 1`, `per_task` count `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Let the user pick a Development commit mode at Spec approval time"
```

---

### Task 2: Read commit mode in `/agent-work-team-develop` and squash at final approval

**Files:**
- Modify: `commands/agent-work-team-develop.md` (full-file rewrite — see below)

**Interfaces:**
- Consumes: `.agent-work-team/requests/{request_id}/planning/dev-config.json` (produced by Task 1, or backfilled by this task's new Step 2 for legacy requests).
- Produces: for `squash` mode, a single commit on `agent-work-team/{request_id}` at the moment the user approves the final review (replacing the branch's prior multi-commit history via `git reset --soft` + `git commit`); for `per_task` mode, no behavior change from today.

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
4. **token 一致性檢查**：用 Read 讀取 `pm-triage.json.token`，跟剛剛讀到的 `state.json.token` 比對。若兩者不一致，代表 `{request_id}` 這個編號疑似被重用過（例如原本的需求資料夾被刪除、`RQ-ID` 分配給了新需求，殘留檔案彼此不屬於同一個需求），把這個疑慮具體告訴使用者，請他們人工確認，然後停止整個流程，不要繼續。

## Step 2: 讀取 commit 模式設定

1. 用 Read 讀取 `.agent-work-team/requests/{request_id}/planning/dev-config.json`。
2. 若檔案存在且 `commit_mode` 是 `"squash"` 或 `"per_task"`：記下這個值（後面用 `{commit_mode}` 代稱），供 Step 7 使用，繼續下一步。
3. 若檔案不存在，或存在但沒有合法的 `commit_mode`（例如這個需求是在這個功能上線前建立、已經 `SPEC_APPROVED` 甚至已經在 Development 中）：停下來，明確告訴使用者這個需求還沒有選過 commit 模式，請使用者現在選一個——`squash`（整個需求最後在分支上只留一個 commit）或 `per_task`（目前預設行為，每個 task 各自 commit）。拿到回答後，用 Write 建立（或覆寫）`planning/dev-config.json`，內容跟 Step 3 的 `{"commit_mode": "squash"}` 或 `{"commit_mode": "per_task"}` 一樣，再繼續下一步。
4. 這一步不管全新開始或恢復執行（`is_resume` 為 `true` 或 `false`）都要做。

## Step 3: 驗證 `task_breakdown` 格式

用 Read 讀取 `.agent-work-team/requests/{request_id}/plan-spec.json`。檢查 `task_breakdown` 陣列裡每一項都是物件、且都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria` 四個欄位。若有任何一項不符合（例如是純字串，或缺欄位），告訴使用者具體是哪裡不符合、需要重新走 Plan/SA/SD 產出正確格式，然後停止，不要嘗試自動轉換或猜測補齊。這個檢查不管全新開始或恢復執行都要做。

## Step 4: 建立/沿用開發分支，依情況初始化

1. 用 Bash 取得目前分支名稱：`git branch --show-current`。
2. 用 Bash 檢查分支 `agent-work-team/{request_id}` 是否已存在：
   - 若不存在：`git checkout -b agent-work-team/{request_id}` 建立並切換過去。
   - 若已存在：**先做 token 一致性檢查再切換**——用 Read 讀取 `state.json.token` 與 `pm-triage.json.token`，若兩者不一致，代表 `{request_id}` 這個編號疑似被重用過（例如原本的需求資料夾被刪除、`RQ-ID` 分配給了新需求，但舊分支還留著），**不要**切換到這個分支，把這個疑慮具體告訴使用者，請他們人工確認這個分支是否該保留或刪除，然後停止整個流程。若一致，才用 `git checkout agent-work-team/{request_id}` 直接切換過去繼續，不要覆蓋或重建。
   （這一步不管全新開始或恢復執行都要做。）
3. 若 `is_resume` 是 `false`（全新開始）：
   - 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
   - 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`，`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`，並記錄 `base_branch`（用 Step 4.1 取得的分支名稱）：

```json
{
  "base_branch": "{base_branch}",
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

4. 若 `is_resume` 是 `true`（恢復執行）：**不要**更動 `state.json` 的 `current_stage`／`progress`，**不要**重建或覆寫 `dev/progress.json`。用 Read 讀取現有的 `dev/progress.json`，供 Step 5／6 判斷從哪裡繼續。

## Step 5: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）處理，**跳過 `dev/progress.json` 裡 `status` 已經是 `"done"` 的 task**（若全部 task 都已經是 `"done"`，代表這次恢復執行卡在 Step 6 的整體審查，不是卡在某個 task——不要在這裡動 `state.json` 的 `status`，直接跳過整個 Step 5，交給 Step 6 自己判斷並清除）：

1. 若這個 task 目前 `status` 是 `"blocked"`（只會發生在恢復執行時）：使用者重新執行本身就是「已經處理過問題、要重試」的訊號——用 Write 把這個 task 的 `fix_rounds`、`needs_context_rounds` 都重設為 `0`，`status` 改成 `"in_progress"`；同時若 `state.json` 目前的 `status` 是 `"Blocked"`，一併改回 `"Running"`、`waiting_on` 改回 `null`（清掉先前 Blocked 留下的痕跡，讓 dashboard 正確反映目前又在跑），繼續下面第 2 點。
2. 若這個 task 目前 `status` 是 `"pending"` 或（恢復執行時）`"in_progress"`：用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`（若已經是就不用重複寫）；若 `state.json` 目前的 `status` 是 `"Blocked"`（例如上次流程中斷但沒被明確判定 Blocked，是被其他機制設成 Blocked 的邊界情況），一併改回 `"Running"`、`waiting_on` 改回 `null`。
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

## Step 6: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。
2. 若 `state.json` 目前的 `current_stage` 已經是 `"PENDING_FINAL_APPROVAL"`（恢復執行、且最終審查先前已通過只是還沒收到人類回覆）：跳過這個 Step，直接進 Step 7 等待使用者回覆。
3. 若 `state.json` 目前的 `current_stage` 是 `"TESTING"` 且 `status` 是 `"Blocked"`（恢復執行、卡在最終審查階段）：用 Write 把 `dev/progress.json` 的 `final_review_fix_rounds` 重設為 `0`，`state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，繼續下面第 5 點重新 dispatch。
4. 否則（全新走到這裡）：用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
5. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、完整 commit range——用 `git diff {dev/progress.json 裡第一個 task 的第一個 commit}^..HEAD` 取得從 Development 階段開始到現在的完整差異，涵蓋所有 task 的 commit。
6. Reviewer 回報 `Needs fixes`：用 Read 讀取 `dev/progress.json` 目前的 `final_review_fix_rounds` 實際數值，+1 後用 Write 寫回去。**寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步**：
   - 若這個實際數值超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`（讓 dashboard 正確反映目前又在修改程式碼），把問題依內容對應到相關的 task，回到 Step 5 對應的 task 重新處理（把該 task 的 `status` 改回 `"in_progress"`），修完後回到本步驟第 5 點重新走一次整體審查。
7. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 7: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：
   1. 用 Read 讀取 `dev/progress.json` 的 `base_branch`。
   2. 若 Step 2 記下的 `{commit_mode}` 是 `"squash"`：執行一次性 squash——
      - 用 Bash 執行 `git status --porcelain`，確認輸出是空字串（工作目錄乾淨）。若不是空字串（理論上此時必然乾淨，這是安全網，不是常態情境），停下來把實際的 `git status` 內容告訴使用者，不要自動 commit 或捨棄任何東西，**停止整個流程**。
      - 用 Bash 執行 `git merge-base HEAD {base_branch}`，取得 merge-base sha。
      - 用 Bash 執行 `git reset --soft {merge-base sha}`。
      - 用 Read 讀取 `plan-spec.json` 的 `requirement_summary`；用 Read 讀取 `dev/progress.json`，取出 `tasks` 陣列裡每個 task 的 `id`，用逗號連接。
      - 用 Bash 執行 `git commit -m "[{request_id}] {requirement_summary}（{逗號連接的 task id 清單}）"`。
   3. 若 `{commit_mode}` 是 `"per_task"`：不執行任何 Git 操作，維持現有的多 commit 歷史（跟現行行為完全一致）。
   4. 用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。
   5. 告訴使用者這個需求的 Development 階段已完成，變更都在 `agent-work-team/{request_id}` 分支上（若 `commit_mode` 是 `squash`，分支上現在只有一個 commit；若是 `per_task`，維持每個 task／每次修正各自的 commit 歷史），原本的分支是 `{base_branch}`，要不要 merge、何時 merge 由使用者自己決定，這裡不會自動執行任何 merge，後續請執行 `/agent-work-team-knowledge <request_id>` 將需求推進至 DONE（整理知識進 wiki）。流程到此結束。
3. 使用者提出修改意見：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`，把意見整理成清楚的修正需求，回到 Step 5 對應的 task（把該 task 的 `status` 改回 `"in_progress"`，或視需要重新走一次整體 review），修完後重新走一次 Step 6。
```

- [ ] **Step 2: Validate frontmatter, step renumbering, and squash coverage**

Run: `head -1 commands/agent-work-team-develop.md && grep -c '^description:' commands/agent-work-team-develop.md && grep -c '^## Step [1-7]:' commands/agent-work-team-develop.md && grep -c 'commit_mode' commands/agent-work-team-develop.md && grep -c 'git reset --soft' commands/agent-work-team-develop.md && grep -c 'git merge-base' commands/agent-work-team-develop.md && grep -c 'git status --porcelain' commands/agent-work-team-develop.md && grep -c '回到 Step 4' commands/agent-work-team-develop.md`
Expected: first line `---`, `description:` count `1`, `^## Step [1-7]:` count `7`, `commit_mode` count `>= 3`, `git reset --soft` count `1`, `git merge-base` count `1`, `git status --porcelain` count `1`, `回到 Step 4` count `0` (confirms the old cross-references were renumbered to `Step 5`, not left stale).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-develop.md
git commit -m "Read commit-mode config and squash the branch at final approval when requested"
```

---

### Task 3: Update the living architecture document and CLAUDE.md

**Files:**
- Modify: `docs/architecture/prompt-orchestration-determinism.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing new — this is documentation of Tasks 1–2's already-committed behavior.

- [ ] **Step 1: Get today's date for the metadata/decision-log timestamps**

Run: `date +%Y-%m-%d`

Use the output everywhere `{today}` appears below.

- [ ] **Step 2: Update `docs/architecture/prompt-orchestration-determinism.md` frontmatter**

Edit the frontmatter block (lines 6–8) so `updated` and `last_verified_against_code` both read `{today}` (leave `created`, `status`, `decision_status`, `maintained_by` untouched).

- [ ] **Step 3: Append a new row to the Implementation Mapping table (§19)**

Add this row to the table (after the existing `Git side effects` row):

```markdown
| Commit granularity (squash vs per-task) | Controller Prompt（`commands/agent-work-team.md` 的 approval gate 詢問並寫入 `planning/dev-config.json`；`commands/agent-work-team-develop.md` 的 approval gate 於核准當下執行 `git reset --soft` + `git commit`） | 同左——仍在現行 Prompt 編排下實作，未導入 host-neutral core；待 DET-Q3 的隔離 worktree／core 控制 Git 副作用方向實作後應一併遷移 | `commands/agent-work-team.md`, `commands/agent-work-team-develop.md`, `.agent-work-team/requests/<RQ-ID>/planning/dev-config.json` | Implemented（現行 Prompt 編排範圍內） |
```

- [ ] **Step 4: Append a new row to the Decision Log table (§18)**

Add this row (after the last existing row):

```markdown
| {today} | 使用者可在 Spec 核准關卡選擇 Development 分支的 commit 粒度：`squash`（整個需求最終在分支上只留一個 commit）或 `per_task`（現行行為，每個 task／修正回合各自 commit）；squash 只在使用者核准最終審查、寫入 `DEV_APPROVED` 前，由 Controller 一次性執行 `git reset --soft` + `git commit`，不改變 per-task review 的 commit range 計算或 resume 判讀邏輯 | Approved | 使用者 | 新增 `planning/dev-config.json` artifact；`commands/agent-work-team.md`／`commands/agent-work-team-develop.md` 的 approval gate 行為擴充；不影響 DET-Q1～Q8 既有核准範圍，Git 副作用仍由現行 Controller Prompt（非 host-neutral core）直接執行 |
```

- [ ] **Step 5: Append a new row to the Verification Evidence table (§20)**

Add this row (after the last existing row), filled in with what Task 4 actually observed (do not write this row until Task 4 is complete):

```markdown
| {today} | Development commit-mode selection（squash／per_task）與 legacy 需求補選流程 | 手動走一次 squash 模式全流程、一次 per_task 模式回歸、一次缺 `dev-config.json` 的既有需求執行 `/agent-work-team-develop` | <Task 4 執行後的實際結果：Passed 或具體失敗描述> | <Task 4 產出的 scratch 專案路徑或分支名稱> |
```

- [ ] **Step 6: Update CLAUDE.md's 目前狀態 bullet list**

In the `## 目前狀態` section, after the existing bullet that starts with `- Development 階段已實作：...`, add a new bullet:

```markdown
- Development 階段的 commit 粒度可選：Spec 核准關卡（`/agent-work-team`）會問使用者要 `squash`（`agent-work-team/{RQ-ID}` 分支最終只留一個 commit）還是 `per_task`（現行預設，每個 task／修正回合各自 commit），選擇結果寫進 `.agent-work-team/requests/RQ-ID/planning/dev-config.json`；`squash` 只在 `/agent-work-team-develop` 的最終人工核准當下由 Controller 一次性執行，過程中每個 task 的開發與審查完全不受影響；沒有這個檔案的既有需求會被要求補選
```

- [ ] **Step 7: Validate**

Run: `grep -c 'Commit granularity' docs/architecture/prompt-orchestration-determinism.md && grep -c 'commit_mode' CLAUDE.md`
Expected: both counts `>= 1`.

- [ ] **Step 8: Commit**

```bash
git add docs/architecture/prompt-orchestration-determinism.md CLAUDE.md
git commit -m "Document the Development commit-mode feature in the architecture living doc and CLAUDE.md"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (manual verification only, no files created by this task itself — it produces the evidence Task 3 Step 5 records).

**Interfaces:**
- Consumes: everything produced in Tasks 1–2.

- [ ] **Step 1: Squash mode — full run in a scratch test project**

In a scratch project where this plugin is installed with these changes:

1. Run `/agent-work-team "測試需求 A"` through to the Step 5 approval gate; when asked, approve the spec, then choose `squash` when asked for commit mode.
2. Confirm `.agent-work-team/requests/{id}/planning/dev-config.json` contains `{"commit_mode": "squash"}`.
3. Run `/agent-work-team-develop {id}` with a `plan-spec.json` that has at least 2 tasks. Let it run through all tasks and the final review.
4. Before approving the final review, run `git log agent-work-team/{id} --oneline` and confirm there are multiple commits (one per task/fix round) — proving Steps 3–6 didn't change per_task behavior mid-flight.
5. Approve the final review. Confirm the Controller ran `git status --porcelain` (clean), `git merge-base`, `git reset --soft`, and `git commit`.
6. Run `git log agent-work-team/{id} --oneline` again — confirm there is now exactly **one** commit, with a message matching `[{id}] {requirement_summary}（T1, T2, ...）`.
7. Confirm `state.json.current_stage` is `"DEV_APPROVED"`.

- [ ] **Step 2: per_task mode — regression check**

Repeat Step 1 with a second request, choosing `per_task` at the commit-mode question. Confirm the final branch still has one commit per task/fix round (same as pre-change behavior) and that the approval message doesn't mention squashing.

- [ ] **Step 3: Legacy request — missing `dev-config.json`**

Using an existing `SPEC_APPROVED` (or further-along) request created before this change (no `planning/dev-config.json`), run `/agent-work-team-develop {id}`. Confirm the Controller stops at the new Step 2, asks which commit mode to use, and — after you answer — writes `planning/dev-config.json` and continues normally (does not error, does not silently pick a default).

- [ ] **Step 4: Squash mode — requesting changes before approving must not squash prematurely**

Run a third request through Step 1's flow again, but this time, when the final review is presented in Step 7, respond with a change request instead of approve (e.g. "T1 少處理了某個邊界情況"). Confirm:

1. `state.json.current_stage` goes back to `"DEVELOPING"` and the affected task's `status` goes back to `"in_progress"` (Step 7 point 3 → Step 5).
2. `git log agent-work-team/{id} --oneline` still shows multiple commits — no squash happened, because Step 7 point 2's squash logic only runs on the `approve` branch.
3. After the fix is made and you approve the re-run final review, the squash then happens exactly as in Step 1 above.

- [ ] **Step 5: Record the results**

Go back to Task 3 Step 5 and fill in the Verification Evidence row with the actual outcome (Passed, or the specific failure and what was fixed) and where the scratch project/branch used for verification lives.
