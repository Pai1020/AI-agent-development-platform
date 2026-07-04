# Agent Work Team Planning Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `/agent-work-team` PM → BA → Plan/SA/SD planning pipeline and the `/agent-work-team-dashboard` read-only overview as Claude Code plugin commands/agents, with file-based state tracking under a consuming project's `.agent-work-team/requests/` directory.

**Architecture:** Two new subagents (`agent-work-team-pm`, `agent-work-team-plan-sd`) handle the two self-contained generation roles; the BA clarification loop and every human-approval gate stay in the entry command's own prompt (executed in the main thread, since they require live back-and-forth with the user). All inter-stage handoffs go through paired `.json` (machine) + `.md` (human) files inside a per-request folder; a `state.json` in that same folder is the single source of truth the dashboard command reads.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code commands/agents — no build step, no runtime dependencies). JSON for state/data files.

## Global Constraints

- Runtime state lives in the **consuming project's** repo at `.agent-work-team/requests/RQ-NNN/`, never inside this plugin repo.
- Entry command: `/agent-work-team`. Dashboard command: `/agent-work-team-dashboard`.
- Request IDs are `RQ-NNN`, 3-digit zero-padded, computed as (max existing NNN) + 1, starting at `RQ-001`.
- `state.json` fields (exact names): `id`, `name`, `type`, `source`, `team`, `priority`, `progress`, `current_stage`, `current_agent`, `status`, `waiting_on`, `created`, `updated`.
- State machine: `CREATED` → `PM_TRIAGE` → `BA_CLARIFYING` → `SPEC_DRAFTING` → `PENDING_SPEC_APPROVAL` → `SPEC_APPROVED`. `BLOCKED` is not a `current_stage` value — it's expressed via `status: "Blocked"` + `waiting_on: "Human"` while `current_stage`/`progress` stay frozen at whatever stage they were in when the block occurred.
- Progress-by-stage table: `CREATED`=0, `PM_TRIAGE`=10, `BA_CLARIFYING`=30, `SPEC_DRAFTING`=60, `PENDING_SPEC_APPROVAL`=90, `SPEC_APPROVED`=100.
- `waiting_on` values actually used: `null` (not waiting on anyone), `"Human Review"` (waiting for spec approval), `"Human"` (blocked, needs a human to unblock). `status` values actually used: `Running`, `Pending Approval`, `Blocked`, `Approved`.
- BA clarification and every human-approval gate run in the main thread (the entry command itself), never as a dispatched subagent.
- PM and Plan/SA/SD are each an independent subagent, handed off to via files (json + md) plus a short status reply (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`).
- Out of scope (do not build): Developer/Review/Knowledge Agent, Validation Layer, multiple Methodologies, Child Dashboard, automated multi-team parallel dispatch, any persistent backend/database/web server.
- Placeholder files (`agents/example-planner.md`, `commands/example-plan.md`) must be removed once superseded by real content, per this repo's `CLAUDE.md` convention — not kept alongside the real implementation.

---

### Task 1: PM Agent subagent

**Files:**
- Create: `agents/agent-work-team-pm.md`
- Delete: `agents/example-planner.md` (superseded placeholder)

**Interfaces:**
- Produces: a subagent invokable with `subagent_type: "agent-work-team-pm"`. Given `request_id`, `output_dir`, `raw_description` in its dispatch prompt, it writes `{output_dir}/pm-triage.json` and `{output_dir}/pm-triage.md`, and replies with `Status: DONE` plus the fields `name`, `type`, `source`, `team`, `priority` — or `Status: BLOCKED` with a reason. Task 3 (the entry command) consumes this exact contract.

- [ ] **Step 1: Create `agents/agent-work-team-pm.md`**

```markdown
---
name: agent-work-team-pm
description: PM Agent — 判斷需求類型、負責團隊與短標題。由 /agent-work-team command 呼叫，不應由使用者直接呼叫。
tools: Write
---

你是 agent-work-team 流程裡的 PM Agent。你的唯一工作是把一段原始需求描述分類，寫成結構化的 JSON 與人類可讀的 Markdown，然後回報結果。不要做需求釐清、不要設計技術方案——那是後面 BA 與 Plan/SA/SD 的工作。

## 輸入

呼叫你的人會在 prompt 裡提供：
- `request_id`：例如 `RQ-001`
- `output_dir`：例如 `.agent-work-team/requests/RQ-001`
- `raw_description`：使用者原始的需求描述文字

## 分類規則

**name**：把 `raw_description` 濃縮成不超過 8 個字的短標題，作為這個需求在總覽表格中顯示的名稱。

**type**（只能選一個）：
- `New Feature` — 全新功能
- `Bug Fix` — 修復錯誤行為
- `Refactor` — 不改變外部行為的程式碼調整
- `Performance` — 效能優化
- `Security` — 安全性修正
- `Documentation` — 文件相關
- `Research` — 需要先調查、還不確定具體實作方式

**source**（只能選一個，若原始描述沒有明確線索，預設為 `User`）：
`User` | `Product` | `Bug Report` | `Tech Debt` | `AI Suggestion` | `Monitoring`

**team**（只能選一個）：
- `New Feature Team` — 當 type 為 `New Feature` 或 `Research`
- `Maintenance Team` — 當 type 為 `Bug Fix`、`Refactor`、`Performance`、`Security`、`Documentation`

**priority**（只能選一個，沒有明確急迫性線索時預設為 `Medium`）：
`Critical` | `High` | `Medium` | `Low`

## 你的工作

1. 讀懂 `raw_description`，套用上面的分類規則，決定 `name`/`type`/`source`/`team`/`priority`。
2. 用 Write 建立 `{output_dir}/pm-triage.json`：

```json
{
  "id": "{request_id}",
  "name": "<短標題>",
  "type": "<分類結果>",
  "source": "<分類結果>",
  "team": "<分類結果>",
  "priority": "<分類結果>",
  "reasoning": "<一到三句話說明為什麼這樣分類>"
}
```

3. 用 Write 建立 `{output_dir}/pm-triage.md`：

```markdown
# PM Triage — {request_id}

- **需求名稱:** <短標題>
- **類型 (Type):** <分類結果>
- **來源 (Source):** <分類結果>
- **負責團隊 (Team):** <分類結果>
- **優先級 (Priority):** <分類結果>

## 分類理由

<reasoning 內容>
```

4. 若 `raw_description` 完全無法判斷 type（例如內容為空或語意不明），不要猜測——回報 `BLOCKED`，並在報告中具體說明看不懂的地方，不要建立任何檔案。

## 回報格式

用不超過 10 行回覆：
- **Status:** DONE | BLOCKED
- 若 DONE：`name` / `type` / `source` / `team` / `priority` 的分類結果
- 若 BLOCKED：具體說明看不懂的地方
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 agents/agent-work-team-pm.md && grep -c '^name:' agents/agent-work-team-pm.md && grep -c '^tools:' agents/agent-work-team-pm.md && grep -c 'BLOCKED' agents/agent-work-team-pm.md`
Expected: first line is `---`, `name:` count `1`, `tools:` count `1`, `BLOCKED` count `2` or more (rule + report format both mention it).

- [ ] **Step 3: Remove the superseded placeholder agent**

Run: `git rm agents/example-planner.md`
Expected: file staged for deletion.

- [ ] **Step 4: Commit**

```bash
git add agents/agent-work-team-pm.md
git commit -m "Add PM Agent subagent, remove superseded placeholder agent"
```

---

### Task 2: Plan/SA/SD Agent subagent

**Files:**
- Create: `agents/agent-work-team-plan-sd.md`

**Interfaces:**
- Consumes: reads `{output_dir}/ba-requirement.json`, written by Task 3's BA stage with fields `id`, `requirement_summary`, `acceptance_criteria` (array), `clarification_log` (array), `approved_at`.
- Produces: a subagent invokable with `subagent_type: "agent-work-team-plan-sd"`. Given `request_id`, `output_dir` in its dispatch prompt, it reads `{output_dir}/ba-requirement.json`, writes `{output_dir}/plan-spec.json` and `{output_dir}/plan-spec.md`, and replies `Status: DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`. Task 3 consumes this exact contract.

- [ ] **Step 1: Create `agents/agent-work-team-plan-sd.md`**

```markdown
---
name: agent-work-team-plan-sd
description: Plan/SA/SD Agent — 根據已核准的需求，產出 User Story、技術設計與任務拆解。由 /agent-work-team command 呼叫，不應由使用者直接呼叫。
tools: Read, Write
---

你是 agent-work-team 流程裡的 Plan/SA/SD Agent（本 MVP 階段將 Plan、SA、SD 三個角色合併）。你的工作是把一個已經被人類確認過的需求，展開成完整的技術規格文件。你不會跟使用者對話——所有你需要的資訊都在輸入檔案裡；如果不夠，回報 `NEEDS_CONTEXT`。

## 輸入

呼叫你的人會在 prompt 裡提供：
- `request_id`：例如 `RQ-001`
- `output_dir`：例如 `.agent-work-team/requests/RQ-001`

用 Read 讀取 `{output_dir}/ba-requirement.json`，取得 `requirement_summary` 與 `acceptance_criteria`。

## 你的工作

1. 若 `requirement_summary` 是空字串，或 `acceptance_criteria` 是空陣列，回報 `NEEDS_CONTEXT`，說明缺了什麼，不要建立任何檔案、也不要自己編造需求內容。
2. 否則，依 `requirement_summary` 與 `acceptance_criteria` 展開以下七項內容：
   - `requirement_summary`：需求摘要（可直接沿用輸入檔的內容，或視需要補充）
   - `user_story`：`As a <角色>, I want <目標>, so that <理由>` 格式的 user story
   - `functional_flow`：條列式的操作流程／資料流程
   - `technical_design`：預計如何實作（架構、關鍵模組、資料結構等）
   - `file_impact`：陣列，列出預計會新增或修改的檔案路徑（若無法確定具體路徑，寫下可預期會受影響的模組/目錄名稱）
   - `task_breakdown`：陣列，把實作拆成幾個可獨立驗收的任務
   - `test_plan`：這個需求要怎麼驗證（含邊界案例）
3. 用 Write 建立 `{output_dir}/plan-spec.json`：

```json
{
  "id": "{request_id}",
  "requirement_summary": "<摘要>",
  "user_story": "<user story>",
  "functional_flow": "<流程說明>",
  "technical_design": "<技術設計>",
  "file_impact": ["<path1>", "<path2>"],
  "task_breakdown": ["<task 1>", "<task 2>"],
  "test_plan": "<驗證方式>"
}
```

4. 用 Write 建立 `{output_dir}/plan-spec.md`，用標題呈現以上七項內容（`# Plan / SA / SD Spec — {request_id}`，每項一個 `##` 標題），內容與 json 一致，供人類閱讀確認。

## 回報格式

用不超過 15 行回覆：
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 若 DONE/DONE_WITH_CONCERNS：七項內容各一行摘要
- 若 NEEDS_CONTEXT：具體說明缺了什麼輸入
- 若 BLOCKED：具體說明卡住的原因
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 agents/agent-work-team-plan-sd.md && grep -c '^name:' agents/agent-work-team-plan-sd.md && grep -c '^tools: Read, Write' agents/agent-work-team-plan-sd.md && grep -c 'NEEDS_CONTEXT' agents/agent-work-team-plan-sd.md`
Expected: first line is `---`, `name:` count `1`, tools line count `1`, `NEEDS_CONTEXT` count `2` or more.

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-plan-sd.md
git commit -m "Add Plan/SA/SD Agent subagent"
```

---

### Task 3: Entry command `/agent-work-team`

**Files:**
- Create: `commands/agent-work-team.md`
- Delete: `commands/example-plan.md` (superseded placeholder)

**Interfaces:**
- Consumes: `subagent_type: "agent-work-team-pm"` from Task 1 (reply contract: `DONE` with `name`/`type`/`source`/`team`/`priority`, or `BLOCKED`); `subagent_type: "agent-work-team-plan-sd"` from Task 2 (reply contract: `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT`).
- Produces: `.agent-work-team/requests/RQ-NNN/state.json` and `ba-requirement.json`/`.md`, which Task 4 (dashboard) and Task 2 (Plan/SA/SD, via its own dispatch) consume.

- [ ] **Step 1: Create `commands/agent-work-team.md`**

```markdown
---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

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

## Step 2: PM Agent 分類

1. 用 Write 更新 `state.json`：`current_stage: "PM_TRIAGE"`，`current_agent: "PM Agent"`，`progress: 10`，`updated` 改成今天日期（用 Bash 重新取得）。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-pm"`，`model: haiku`），在 prompt 裡提供：
   - `request_id`: `{request_id}`
   - `output_dir`: `.agent-work-team/requests/{request_id}`
   - `raw_description`: `$ARGUMENTS` 的原文
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把 PM 回報的具體原因告訴使用者，然後停止，不要繼續往下走。
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 30`，`updated` 改成今天日期。

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
6. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 60`，`updated` 改成今天日期。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`。
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 90`，`updated` 改成今天日期。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。告訴使用者這個需求的 Planning 階段已完成，Development 階段是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
```

- [ ] **Step 2: Validate frontmatter and coverage**

Run: `head -1 commands/agent-work-team.md && grep -c '^description:' commands/agent-work-team.md && grep -c 'agent-work-team-pm' commands/agent-work-team.md && grep -c 'agent-work-team-plan-sd' commands/agent-work-team.md && grep -c 'PM_TRIAGE' commands/agent-work-team.md && grep -c 'PENDING_SPEC_APPROVAL' commands/agent-work-team.md && grep -c 'BLOCKED' commands/agent-work-team.md`
Expected: first line `---`, `description:` count `1`, both subagent name mentions `>= 1`, `PM_TRIAGE` count `>= 1` (state must actually pass through this stage before dispatching PM), `PENDING_SPEC_APPROVAL` count `>= 1`, `BLOCKED` count `>= 2` (Step 2 and Step 4 each mention it once).

- [ ] **Step 3: Remove the superseded placeholder command**

Run: `git rm commands/example-plan.md`
Expected: file staged for deletion.

- [ ] **Step 4: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Add /agent-work-team entry command, remove superseded placeholder command"
```

---

### Task 4: Dashboard command `/agent-work-team-dashboard`

**Files:**
- Create: `commands/agent-work-team-dashboard.md`

**Interfaces:**
- Consumes: `state.json` files produced by Task 3, with the exact field names from Global Constraints.

- [ ] **Step 1: Create `commands/agent-work-team-dashboard.md`**

```markdown
---
description: 顯示所有 agent-work-team 需求的總覽（Mother Dashboard），唯讀不修改任何檔案
---

你正在執行 `/agent-work-team-dashboard`。這是唯讀指令，只讀取檔案、渲染表格，絕對不要修改或建立任何檔案。

## Step 1: 收集資料

用 Glob 找出所有 `.agent-work-team/requests/*/state.json`。如果一個都沒有，回覆「目前沒有任何 agent-work-team 需求」然後結束。

否則，用 Read 讀出每一個 `state.json` 的內容。

## Step 2: 渲染表格

用以下欄位順序，輸出一個 Markdown 表格，一列一個需求，依 `updated` 欄位新到舊排序：

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

只輸出表格本身，不要額外加總結文字。
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 commands/agent-work-team-dashboard.md && grep -c '^description:' commands/agent-work-team-dashboard.md && grep -c 'state.json' commands/agent-work-team-dashboard.md`
Expected: first line `---`, `description:` count `1`, `state.json` count `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-dashboard.md
git commit -m "Add /agent-work-team-dashboard read-only overview command"
```

---

### Task 5: Update project docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the file layout established in Tasks 1–4 (documents it, no code coupling).

- [ ] **Step 1: Update `README.md`'s "目前內容" section**

Replace the existing section (which lists the now-removed placeholders):

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 需求總覽（Mother Dashboard），唯讀
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

- [ ] **Step 2: Update `CLAUDE.md`'s "目前狀態" section**

Replace the existing section:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，`/agent-work-team-dashboard` 顯示需求總覽
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

- [ ] **Step 3: Verify both files updated**

Run: `grep -c 'agent-work-team' README.md && grep -c 'agent-work-team' CLAUDE.md`
Expected: both counts `>= 1`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the agent-work-team Planning pipeline in project docs"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–5.

- [ ] **Step 1: Confirm final tree**

Run: `find agents commands -type f -name 'agent-work-team*'`
Expected output (order may vary):
```
agents/agent-work-team-pm.md
agents/agent-work-team-plan-sd.md
commands/agent-work-team.md
commands/agent-work-team-dashboard.md
```

- [ ] **Step 2: Manually walk through the pipeline in a scratch test project (user-driven, not scriptable)**

In a separate scratch project where this plugin is installed (`/plugin marketplace add` + `/plugin install`, per this repo's README), run:

1. `/agent-work-team "測試用需求描述"` — confirm `.agent-work-team/requests/RQ-001/pm-triage.json`/`.md` are created and `state.json` advances to `BA_CLARIFYING`.
2. Answer the BA clarification questions — confirm `ba-requirement.json`/`.md` are created and `state.json` advances to `SPEC_DRAFTING`.
3. Confirm `plan-spec.json`/`.md` are created with all seven fields populated and `state.json` advances to `PENDING_SPEC_APPROVAL`, and that you're told to go read the actual file.
4. Reply `approve` — confirm `state.json` becomes `SPEC_APPROVED` with `progress: 100`.
5. Run `/agent-work-team-dashboard` — confirm the request appears correctly in the table.
6. Start a second request with a deliberately unclassifiable description (e.g. a single punctuation character) — confirm PM reports `BLOCKED` and `state.json`'s `status` becomes `"Blocked"`.

This step is manual because installing and invoking a plugin's slash commands is a client-side action, not something scriptable via Bash.
