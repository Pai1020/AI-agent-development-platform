# Agent Work Team Dashboard-as-File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the agent-work-team dashboard from a required, on-demand slash command into an auto-maintained `.agent-work-team/dashboard.md` file that `/agent-work-team` keeps in sync on every state change, with `/agent-work-team-dashboard` becoming a fallback rebuild command.

**Architecture:** `commands/agent-work-team.md` gains one shared "Dashboard 同步規則" recipe (Glob all `state.json` files, render the table, overwrite `dashboard.md`) and a one-line reference to it at every point where it already writes a request's `state.json`. `commands/agent-work-team-dashboard.md` keeps the same rendering logic but now writes `.agent-work-team/dashboard.md` instead of only printing inline, and its framing changes from "the way to view the dashboard" to "manual rebuild if the file goes stale."

**Tech Stack:** Markdown + YAML frontmatter (Claude Code commands — no build step, no runtime dependencies).

## Global Constraints

- Dashboard file path: `.agent-work-team/dashboard.md` (sibling to `requests/`, in the **consuming project's** repo — never inside this plugin repo).
- Dashboard file content: `# Agent Work Team Dashboard` heading + the same 13-column table as before (ID, 需求名稱, 類型, 來源, Team, 優先級, Progress, Current Stage, Current Agent, Status, Waiting, Created, Updated), sorted by `updated` descending, same null-display rules as before (`name`→`(未命名)`, others→`-`).
- `/agent-work-team` must sync `dashboard.md` after every `state.json` write (create or update) — that's 8 distinct points across Steps 1–5 in the current file. The one exception: Step 4's `NEEDS_CONTEXT` branch does not change `state.json`, so it does not need a sync.
- `/agent-work-team-dashboard` becomes a fallback: same table logic, but now writes `.agent-work-team/dashboard.md` (not just an inline reply) and its description says when to use it (file missing/stale/corrupted).
- No other behavior changes — the state machine, subagent contracts, and BLOCKED/NEEDS_CONTEXT handling from the existing implementation are unchanged.

---

### Task 1: Wire dashboard sync into `/agent-work-team`

**Files:**
- Modify: `commands/agent-work-team.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `.agent-work-team/dashboard.md`, written after every `state.json` write. Consumed by a human opening the file directly (no other task depends on this programmatically).

- [ ] **Step 1: Overwrite `commands/agent-work-team.md` with this exact content**

```markdown
---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

## Dashboard 同步規則

每次你用 Write 建立或更新任一需求的 `state.json` 之後，緊接著都要做這件事，讓 `.agent-work-team/dashboard.md` 保持最新，使用者不需要另外呼叫任何指令就能看到最新狀態：

1. 用 Glob 找出 `.agent-work-team/requests/*/state.json` 全部檔案
2. 用 Read 讀出每一個
3. 依 `updated` 新到舊排序，渲染成表格，欄位順序：`ID | 需求名稱 | 類型 | 來源 | Team | 優先級 | Progress | Current Stage | Current Agent | Status | Waiting | Created | Updated`。對應規則：
   - 需求名稱 ← `name`（`null` 顯示 `(未命名)`）
   - 類型／來源／Team／優先級／Current Agent／Waiting ← 對應欄位（`null` 顯示 `-`）
   - Progress ← `progress` 後面加 `%`
   - 其餘欄位直接對應同名值
4. 用 Write 覆寫 `.agent-work-team/dashboard.md`：內容是 `# Agent Work Team Dashboard` 標題，接著這個表格

下面每個步驟寫「同步 dashboard」，指的就是做上面這 4 個子步驟。

## Step 1: 建立新需求

1. 用 Bash 算出下一個 request id：

```bash
next=$(ls -d .agent-work-team/requests/RQ-* 2>/dev/null | sed 's#.*/RQ-##' | sort -n | tail -1)
next=${next:-0}
printf "RQ-%03d\n" $((10#$next + 1))
```

把輸出結果當作這次的 `request_id`（例如 `RQ-001`）。

2. 用 Bash 建立資料夾：`mkdir -p .agent-work-team/requests/{request_id}`
3. 用 Bash 取得今天日期：`date +%Y-%m-%d`，結果當作 `{today}`。
4. 用 Write 建立 `.agent-work-team/requests/{request_id}/state.json`：

```json
{
  "id": "{request_id}",
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

5. 同步 dashboard。

## Step 2: PM Agent 分類

1. 用 Write 更新 `state.json`：`current_stage: "PM_TRIAGE"`，`current_agent: "PM Agent"`，`progress: 10`，`updated` 改成今天日期（用 Bash 重新取得）。同步 dashboard。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-pm"`，`model: haiku`），在 prompt 裡提供：
   - `request_id`: `{request_id}`
   - `output_dir`: `.agent-work-team/requests/{request_id}`
   - `raw_description`: `$ARGUMENTS` 的原文
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，同步 dashboard，把 PM 回報的具體原因告訴使用者，然後停止，不要繼續往下走。
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 30`，`updated` 改成今天日期。同步 dashboard。

## Step 3: BA 階段（你自己直接跟使用者對話，不要 dispatch subagent）

1. 一次問一個問題，釐清需求範圍、限制、成功標準，直到你能寫出完整的 Acceptance Criteria 清單。優先用 AskUserQuestion 工具讓使用者用選的，開放式問題才用純文字問。
2. 把每一組問答記下來，之後要寫進 `clarification_log`。
3. 當你認為需求已經清楚，把完整的「需求摘要」與「Acceptance Criteria 清單」念給使用者確認一次。使用者明確回覆確認（例如「確認」「approved」「可以」）才算通過；如果使用者提出修改，回到本步驟第 1 點繼續問，不要自己假設已經通過。
4. 通過後，用 Bash 取得今天日期，再用 Write 建立 `.agent-work-team/requests/{request_id}/ba-requirement.json`：

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

5. 用 Write 建立對應的 `.agent-work-team/requests/{request_id}/ba-requirement.md`（`# BA Requirement — {request_id}`，接著用 `##` 標題呈現需求摘要、Acceptance Criteria 清單、問答紀錄，內容跟 json 一致）。
6. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 60`，`updated` 改成今天日期。同步 dashboard。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`，也不需要同步 dashboard（狀態沒變）。
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，同步 dashboard，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 90`，`updated` 改成今天日期。同步 dashboard。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。同步 dashboard。告訴使用者這個需求的 Planning 階段已完成，Development 階段是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
```

- [ ] **Step 2: Validate frontmatter and dashboard-sync coverage**

Run: `head -1 commands/agent-work-team.md && grep -c '^description:' commands/agent-work-team.md && grep -c '同步 dashboard' commands/agent-work-team.md && grep -c 'Dashboard 同步規則' commands/agent-work-team.md && grep -c 'agent-work-team-pm' commands/agent-work-team.md && grep -c 'agent-work-team-plan-sd' commands/agent-work-team.md && grep -c 'PM_TRIAGE' commands/agent-work-team.md`
Expected: first line `---`, `description:` count `1`, `同步 dashboard` count `>= 8` (it appears once in the shared rule's own explanatory sentence, plus once at every one of the 8 state.json write points across Steps 1–5, including Step 4's `NEEDS_CONTEXT` branch which explicitly says it does *not* need a sync but still contains the substring), `Dashboard 同步規則` count `1`, both subagent name mentions `>= 1`, `PM_TRIAGE` count `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Sync dashboard.md automatically on every state.json write"
```

---

### Task 2: Convert `/agent-work-team-dashboard` into a fallback rebuild command

**Files:**
- Modify: `commands/agent-work-team-dashboard.md` (full-file rewrite — see below)

**Interfaces:**
- Consumes: same `state.json` fields as before (no changes to the schema it reads).
- Produces: `.agent-work-team/dashboard.md`, same file Task 1's sync routine writes — this command is a manual way to regenerate the same artifact.

- [ ] **Step 1: Overwrite `commands/agent-work-team-dashboard.md` with this exact content**

```markdown
---
description: 備用指令，手動重新掃描並重建 .agent-work-team/dashboard.md（正常情況下不需要呼叫——/agent-work-team 每次狀態更新都會自動同步這個檔案）
---

你正在執行 `/agent-work-team-dashboard`。這是備用指令：正常情況下你不需要執行它，因為 `.agent-work-team/dashboard.md` 已經由 `/agent-work-team` 在每次更新任一需求狀態時自動同步。只有在你懷疑 `dashboard.md` 過期、損毀，或被手動刪除時，才需要手動執行這個指令來重建它。

## Step 1: 收集資料

用 Glob 找出所有 `.agent-work-team/requests/*/state.json`。如果一個都沒有，回覆「目前沒有任何 agent-work-team 需求」，不要建立 `dashboard.md`，然後結束。

否則，用 Read 讀出每一個 `state.json` 的內容。

## Step 2: 渲染表格

用以下欄位順序，渲染成一個 Markdown 表格，一列一個需求，依 `updated` 欄位新到舊排序：

| ID | 需求名稱 | 類型 | 來源 | Team | 優先級 | Progress | Current Stage | Current Agent | Status | Waiting | Created | Updated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

對應欄位：
- ID ← `id`
- 需求名稱 ← `name`（若為 `null`，顯示 `(未命名)`）
- 類型 ← `type`（若為 `null`，顯示 `-`）
- 來源 ← `source`（若為 `null`，顯示 `-`）
- Team ← `team`（若為 `null`，顯示 `-`）
- 優先級 ← `priority`（若為 `null`，顯示 `-`）
- Progress ← `progress` 後面加 `%`
- Current Stage ← `current_stage`
- Current Agent ← `current_agent`（若為 `null`，顯示 `-`）
- Status ← `status`
- Waiting ← `waiting_on`（若為 `null`，顯示 `-`）
- Created ← `created`
- Updated ← `updated`

## Step 3: 覆寫 dashboard 檔案

用 Write 覆寫 `.agent-work-team/dashboard.md`：內容是 `# Agent Work Team Dashboard` 標題，接著 Step 2 渲染出來的表格。

## Step 4: 回報結果

把 Step 2 渲染的表格直接顯示在你的回覆裡，讓使用者不用另外開檔案就能立即確認重建結果。
```

- [ ] **Step 2: Validate frontmatter and behavior change**

Run: `head -1 commands/agent-work-team-dashboard.md && grep -c '^description:' commands/agent-work-team-dashboard.md && grep -c '備用指令' commands/agent-work-team-dashboard.md && grep -c 'dashboard.md' commands/agent-work-team-dashboard.md && grep -c '唯讀' commands/agent-work-team-dashboard.md`
Expected: first line `---`, `description:` count `1`, `備用指令` count `>= 2`, `dashboard.md` count `>= 3`, `唯讀` count `0` (the old read-only framing must be fully gone — this command now writes a file).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-dashboard.md
git commit -m "Convert /agent-work-team-dashboard into a fallback rebuild command"
```

---

### Task 3: Update project docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the behavior established in Tasks 1–2 (documents it, no code coupling).

- [ ] **Step 1: Update `README.md`'s "目前內容" section**

The current section reads:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 需求總覽（Mother Dashboard），唯讀
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

Replace it with:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程，每次狀態變更會自動同步需求總覽（見下）
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

- [ ] **Step 2: Update `CLAUDE.md`'s "目前狀態" section**

The current section reads:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，`/agent-work-team-dashboard` 顯示需求總覽
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

Replace it with:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，每次狀態變更由 `/agent-work-team` 自動同步；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

- [ ] **Step 3: Verify both files updated**

Run: `grep -c '自動同步\|自動維護' README.md && grep -c '自動同步\|自動維護' CLAUDE.md && grep -c '唯讀' README.md`
Expected: both first counts `>= 1`, `唯讀` count in README.md `0` (the old read-only framing must be gone).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the auto-maintained dashboard file in project docs"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–3.

- [ ] **Step 1: Confirm the two command files no longer contain stale references**

Run: `grep -n '唯讀' commands/agent-work-team-dashboard.md; grep -n 'Mother Dashboard' commands/agent-work-team-dashboard.md`
Expected: no output from either (both patterns absent).

- [ ] **Step 2: Manually walk through the updated pipeline in a scratch test project (user-driven, not scriptable)**

In a scratch project where this plugin is installed, run:

1. `/agent-work-team "測試用需求描述"` — confirm that **without running any other command**, `.agent-work-team/dashboard.md` already exists and lists this request as soon as PM triage completes (i.e., after `state.json` first reaches `BA_CLARIFYING`).
2. Continue through BA clarification, spec generation, and approval as before — confirm `dashboard.md` updates itself after each stage transition, still without any manual command.
3. Delete `.agent-work-team/dashboard.md`, then run `/agent-work-team-dashboard` — confirm it recreates the file with the same content it would have had, and also shows the table inline in the reply.
4. Start a second request with a deliberately unclassifiable description — confirm `dashboard.md` reflects the `Blocked` status/`"Human"` waiting_on without any manual command, matching the BLOCKED-state semantics from the design doc.

This step is manual because installing and invoking a plugin's slash commands, and observing file contents update live, is a client-side action, not something scriptable via Bash.
