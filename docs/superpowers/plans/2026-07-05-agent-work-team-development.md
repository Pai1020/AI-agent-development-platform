# Agent Work Team Development Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Development stage of the agent-work-team pipeline — Developer Agent + Review/Test Agent — so an approved spec (`SPEC_APPROVED`) can be implemented task-by-task and reviewed all the way to `DEV_APPROVED`.

**Architecture:** `/agent-work-team-develop <RQ-ID>` is a new entry command that reuses the subagent-driven-development pattern (fresh subagent per task, task-scoped review, fix-and-re-review loop, final whole-request review) already proven in this session, applied to a target project's own codebase instead of this plugin's. Two new subagents (`agent-work-team-developer`, `agent-work-team-reviewer`) do the actual work; the command is the controller. This requires upgrading Plan/SA/SD's `task_breakdown` output to a structured format (file scope + acceptance criteria per task) and renumbering the whole progress table in the existing entry command.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code commands/agents — no build step). JSON for state/progress files.

## Global Constraints

- New entry command: `/agent-work-team-develop <RQ-ID>` (RQ-ID optional — defaults to the most-recently-updated request with `current_stage: "SPEC_APPROVED"`).
- `plan-spec.json`'s `task_breakdown` becomes an array of objects: `{ "id", "description", "files" (non-empty array), "acceptance_criteria" }`. `file_impact` stays as-is (overall summary).
- State machine (full, replacing Round 1's progress table): `CREATED`=0, `PM_TRIAGE`=10, `BA_CLARIFYING`=20, `SPEC_DRAFTING`=30, `PENDING_SPEC_APPROVAL`=40, `SPEC_APPROVED`=50, `DEVELOPING`=70, `TESTING`=90, `PENDING_FINAL_APPROVAL`=95, `DEV_APPROVED`=100. `BLOCKED` is expressed via `status`/`waiting_on` only, `current_stage`/`progress` stay frozen (unchanged from Round 1's convention).
- New per-request files: `.agent-work-team/requests/RQ-NNN/dev/progress.json`, `dev/{task.id}-report.json`/`.md`, `dev/{task.id}-review.json`/`.md`, `dev/final-review.json`/`.md`.
- `dev/progress.json` shape: `{ "tasks": [{"id","status","commits","fix_rounds"}], "final_review_fix_rounds": 0 }`. `status`: `pending`|`in_progress`|`done`|`blocked`.
- Fix loop: a task (or the final review) that's still `Needs fixes` after 2 fix rounds becomes `blocked` — `state.json` gets `status: "Blocked"`, `waiting_on: "Human"`, and the flow stops (no further tasks processed).
- Tasks are processed strictly sequentially, never in parallel.
- Reviewer's own review is read-only — it must never modify code or git state, only inspect and write its own report files.
- Out of scope: Knowledge Agent, parallel task execution, auto-migrating Round 1's old string-array `task_breakdown` format, Validation Layer, multi-methodology, Child/Agent Dashboard.

---

### Task 1: Upgrade Plan/SA/SD's `task_breakdown` output format

**Files:**
- Modify: `agents/agent-work-team-plan-sd.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `plan-spec.json`'s `task_breakdown` as an array of `{id, description, files, acceptance_criteria}` objects — Task 3 (Developer subagent) and Task 4 (Reviewer subagent) and Task 5 (entry command) all consume this exact shape.

- [ ] **Step 1: Overwrite `agents/agent-work-team-plan-sd.md` with this exact content**

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
   - `file_impact`：陣列，列出預計會新增或修改的檔案路徑總覽（若無法確定具體路徑，寫下可預期會受影響的模組/目錄名稱）
   - `task_breakdown`：陣列，把實作拆成幾個可獨立驗收的任務，**每個任務是一個物件**（不是字串），必須包含：
     - `id`：例如 `"T1"`、`"T2"`（依序編號）
     - `description`：這個任務要做什麼，一句話講清楚
     - `files`：陣列，這個任務預計會新增或修改的具體檔案路徑（不能是空陣列——若真的無法確定具體檔案，至少寫下預期的目錄或模組名稱）
     - `acceptance_criteria`：這個任務完成的具體驗收標準，之後 Development 階段的 Developer/Reviewer 會直接依這個標準工作與審查
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
  "task_breakdown": [
    {
      "id": "T1",
      "description": "<這個任務要做什麼>",
      "files": ["<path1>", "<path2>"],
      "acceptance_criteria": "<驗收標準>"
    }
  ],
  "test_plan": "<驗證方式>"
}
```

4. 用 Write 建立 `{output_dir}/plan-spec.md`，用標題呈現以上七項內容（`# Plan / SA / SD Spec — {request_id}`，每項一個 `##` 標題）。`task_breakdown` 這一項底下，每個任務各自一個 `###` 小標題（標題文字用該任務的 `id` 與 `description`），內容列出 `files` 與 `acceptance_criteria`。內容與 json 一致，供人類閱讀確認。

## 回報格式

用不超過 15 行回覆：
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 若 DONE/DONE_WITH_CONCERNS：七項內容各一行摘要，`task_breakdown` 額外列出總共拆了幾個任務
- 若 NEEDS_CONTEXT：具體說明缺了什麼輸入
- 若 BLOCKED：具體說明卡住的原因
```

- [ ] **Step 2: Validate frontmatter and the new schema is present**

Run: `head -1 agents/agent-work-team-plan-sd.md && grep -c '^name:' agents/agent-work-team-plan-sd.md && grep -c '"files"' agents/agent-work-team-plan-sd.md && grep -c '"acceptance_criteria"' agents/agent-work-team-plan-sd.md && grep -c '"task_breakdown": \["<task 1>"' agents/agent-work-team-plan-sd.md`
Expected: first line `---`, `name:` count `1`, `"files"` count `>= 1`, `"acceptance_criteria"` count `>= 1`, the old string-array `task_breakdown` example count `0` (must be fully replaced).

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-plan-sd.md
git commit -m "Upgrade Plan/SA/SD's task_breakdown to structured objects with files+acceptance_criteria"
```

---

### Task 2: Renumber the progress table in the entry command

**Files:**
- Modify: `commands/agent-work-team.md` (full-file rewrite — see below)

**Interfaces:**
- Produces: `state.json`'s `progress` values now match the extended table Task 5 (the new develop command) continues from (`SPEC_APPROVED`=50, not 100).

- [ ] **Step 1: Overwrite `commands/agent-work-team.md` with this exact content**

```markdown
---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

`.agent-work-team/dashboard.md` 會由 plugin 的 hook 自動同步，你不需要做任何事去維護它。

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
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 20`，`updated` 改成今天日期。

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
6. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 30`，`updated` 改成今天日期。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`。
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 40`，`updated` 改成今天日期。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 50`，`updated` 改成今天日期。告訴使用者這個需求的 Planning 階段已完成，可以執行 `/agent-work-team-develop {request_id}` 進入 Development 階段。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
```

- [ ] **Step 2: Validate the new progress numbers**

Run: `grep -c 'progress: 20' commands/agent-work-team.md && grep -c 'progress: 30' commands/agent-work-team.md && grep -c 'progress: 40' commands/agent-work-team.md && grep -c 'progress: 50' commands/agent-work-team.md && grep -c 'progress: 100' commands/agent-work-team.md && grep -c 'agent-work-team-develop' commands/agent-work-team.md`
Expected: `progress: 20` count `1`, `progress: 30` count `1`, `progress: 40` count `1`, `progress: 50` count `1`, `progress: 100` count `0` (Round 1's old terminal value must be gone), `agent-work-team-develop` count `>= 1` (the new pointer message).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Renumber progress table to make room for the Development stage"
```

---

### Task 3: Developer Agent subagent

**Files:**
- Create: `agents/agent-work-team-developer.md`

**Interfaces:**
- Consumes: a task object `{id, description, files, acceptance_criteria}` from `plan-spec.json`'s `task_breakdown` (Task 1's format), plus `technical_design`.
- Produces: a subagent invokable with `subagent_type: "agent-work-team-developer"`. Given `request_id`, `output_dir`, `task`, `technical_design` (and optionally a prior reviewer's issue list for fix rounds), it implements the task, commits, writes `{output_dir}/dev/{task.id}-report.json`/`.md`, and replies `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT` with the commit sha. Task 5 (entry command) and Task 4 (reviewer, via the report file) consume this.

- [ ] **Step 1: Create `agents/agent-work-team-developer.md`**

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
4. 用 Write 建立或更新 `{output_dir}/dev/{task.id}-report.json`：

```json
{
  "task_id": "{task.id}",
  "status": "DONE",
  "files_changed": ["<path1>", "<path2>"],
  "commit": "<commit sha>",
  "test_summary": "<跑了什麼測試、結果如何>",
  "concerns": "<若有疑慮寫在這裡，沒有就寫 null>"
}
```

5. 用 Write 建立或更新 `{output_dir}/dev/{task.id}-report.md`，用人類可讀的方式呈現以上內容。

## 修正回合

若 prompt 裡有上一輪 Reviewer 的問題清單：針對清單裡的每一項具體修正，修正後重新跑相關測試，用 Bash 重新 commit（新的 commit，不要 amend），然後更新（附加，不要覆蓋掉舊資訊）`{task.id}-report.json`／`.md`，記錄這次修了什麼、新的 commit sha。

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

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 agents/agent-work-team-developer.md && grep -c '^name:' agents/agent-work-team-developer.md && grep -c '^tools:' agents/agent-work-team-developer.md && grep -c 'NEEDS_CONTEXT' agents/agent-work-team-developer.md`
Expected: first line `---`, `name:` count `1`, `tools:` count `1`, `NEEDS_CONTEXT` count `>= 2`.

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-developer.md
git commit -m "Add Developer Agent subagent"
```

---

### Task 4: Review/Test Agent subagent

**Files:**
- Create: `agents/agent-work-team-reviewer.md`

**Interfaces:**
- Consumes: a task object (for task-scoped review) or the full `plan-spec.json` (for the final whole-request review), plus a git commit range and the Developer's report file path(s).
- Produces: a subagent invokable with `subagent_type: "agent-work-team-reviewer"`. Writes `{output_dir}/dev/{scope}-review.json`/`.md` (`{scope}` is a task id like `"T1"`, or `"final"`), replies `Approved`/`Needs fixes` with Critical/Important issue summaries. Task 5 (entry command) consumes this exact contract.

- [ ] **Step 1: Create `agents/agent-work-team-reviewer.md`**

```markdown
---
name: agent-work-team-reviewer
description: Review/Test Agent — 審查單一 task 或整個需求的 diff，回報 spec 合規性與程式碼品質。由 /agent-work-team-develop command 呼叫，不應由使用者直接呼叫。
tools: Read, Write, Bash, Glob, Grep
---

你是 agent-work-team 流程裡的 Review/Test Agent。你的工作是審查一段 git diff，先確認有沒有做到該做的事（spec 合規），再確認品質好不好（code quality）。你的審查除了寫自己的報告檔案以外是唯讀的——不要修改任何程式碼、不要執行會改變 git 狀態的指令（例如 commit、checkout、reset）。

## 輸入

呼叫你的人會在 prompt 裡提供：
- `request_id`、`output_dir`
- `scope`：這次審查的範圍——單一 task 的 `id`（例如 `"T1"`），或 `"final"`（整個需求的最終審查）
- 若 `scope` 是單一 task：這個 task 的完整物件（`id`/`description`/`files`/`acceptance_criteria`）
- 若 `scope` 是 `"final"`：整個 `plan-spec.json`
- 這次審查涵蓋的 commit range（例如某個 task 目前所有的 commit sha，或整個 Development 階段從開始到現在的範圍）
- Developer 的報告檔案路徑

## 你的工作

1. 用 Bash 執行 `git log --oneline` 與 `git diff` 取得指定 commit range 的完整內容。
2. **Spec 合規性**：比對 diff 內容跟 `acceptance_criteria`（單一 task 審查）或整個 `plan-spec.json` 的需求與 task_breakdown（`scope: "final"`）——做到了嗎？有沒有漏做、多做、做錯方向？
3. **程式碼品質**：關注點分離、錯誤處理、DRY、邊界案例、測試是否真的驗證行為而非只是形式。
4. 不要照單全收 Developer 報告裡的說法——自己讀 diff 驗證。
5. 依嚴重程度分類問題：Critical（必須修）、Important（應該修）、Minor（可以之後修）。
6. 用 Write 建立 `{output_dir}/dev/{scope}-review.json`：

```json
{
  "scope": "{scope}",
  "spec_compliant": true,
  "strengths": ["<優點1>"],
  "issues": {
    "critical": [],
    "important": [],
    "minor": []
  },
  "verdict": "Approved"
}
```

7. 用 Write 建立對應的 `{output_dir}/dev/{scope}-review.md`，用人類可讀的方式呈現（標題、Strengths、依嚴重程度分類的 Issues、Verdict）。

## 回報格式

用不超過 15 行回覆：
- **Verdict:** Approved | Needs fixes
- 若 Needs fixes：Critical/Important 問題各一行摘要（Minor 不用列在回覆裡，寫進報告檔案就好）
- 報告檔案路徑
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 agents/agent-work-team-reviewer.md && grep -c '^name:' agents/agent-work-team-reviewer.md && grep -c '^tools:' agents/agent-work-team-reviewer.md && grep -c 'Needs fixes' agents/agent-work-team-reviewer.md`
Expected: first line `---`, `name:` count `1`, `tools:` count `1`, `Needs fixes` count `>= 2`.

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-reviewer.md
git commit -m "Add Review/Test Agent subagent"
```

---

### Task 5: `/agent-work-team-develop` entry command

**Files:**
- Create: `commands/agent-work-team-develop.md`

**Interfaces:**
- Consumes: `subagent_type: "agent-work-team-developer"` from Task 3, `subagent_type: "agent-work-team-reviewer"` from Task 4, `plan-spec.json`'s structured `task_breakdown` from Task 1, and `state.json`'s `SPEC_APPROVED` value of 50 from Task 2.
- Produces: `.agent-work-team/requests/RQ-NNN/dev/progress.json` and the state transitions through `DEVELOPING`/`TESTING`/`PENDING_FINAL_APPROVAL`/`DEV_APPROVED`.

- [ ] **Step 1: Create `commands/agent-work-team-develop.md`**

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

## Step 3: 初始化 Development 狀態

1. 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
2. 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`，`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`：

```json
{
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

## Step 4: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）做以下事情：

1. 用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-developer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）、這個 task 的完整物件、`plan-spec.json` 的 `technical_design`。
3. 若回報 `NEEDS_CONTEXT`：補充資訊後重新 dispatch，不要更動 `dev/progress.json` 的 `status`。
4. 若回報 `BLOCKED`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"blocked"`，把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，**停止整個 Development 流程**，後面的 task 不處理。
5. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：把回報裡的 commit sha 記到 `dev/progress.json` 這個 task 的 `commits` 陣列，然後用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "{task.id}"`、這個 task 的完整物件、這個 task 目前所有 commit 的 commit range（用 `git diff {第一個 commit}^..HEAD` 取得完整差異）、Developer 的報告檔案路徑。
6. Reviewer 回報 `Approved`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"done"`，繼續下一個 task。
7. Reviewer 回報 `Needs fixes`（有 Critical 或 Important 問題）：
   - 把 `dev/progress.json` 這個 task 的 `fix_rounds` +1。
   - 若 `fix_rounds` 超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 4 點設為 Blocked，把還沒解決的 Critical/Important 問題列給使用者，**停止整個 Development 流程**。
   - 否則：重新 dispatch `agent-work-team-developer`（同一個 task），prompt 裡附上 Reviewer 這輪的具體問題清單，修完後回到第 5 點重新走一次 review。

## Step 5: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、從 Development 開始到現在的完整 commit range（涵蓋所有 task 的 commit）。
3. Reviewer 回報 `Needs fixes`：把 `dev/progress.json` 的 `final_review_fix_rounds` +1。
   - 若超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：把問題依內容對應到相關的 task，回到 Step 4 對應的 task 重新處理，修完後回到本步驟第 1 點重新走一次整體審查。
4. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 6: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。告訴使用者這個需求的 Development 階段已完成，Knowledge Agent 是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：把意見整理成清楚的修正需求，回到 Step 4 對應的 task（或視需要重新走一次整體 review），修完後重新走一次 Step 5。
```

- [ ] **Step 2: Validate frontmatter and coverage**

Run: `head -1 commands/agent-work-team-develop.md && grep -c '^description:' commands/agent-work-team-develop.md && grep -c 'agent-work-team-developer' commands/agent-work-team-develop.md && grep -c 'agent-work-team-reviewer' commands/agent-work-team-develop.md && grep -c 'DEV_APPROVED' commands/agent-work-team-develop.md && grep -c 'fix_rounds' commands/agent-work-team-develop.md`
Expected: first line `---`, `description:` count `1`, both subagent name mentions `>= 1`, `DEV_APPROVED` count `>= 1`, `fix_rounds` count `>= 1`.

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-develop.md
git commit -m "Add /agent-work-team-develop entry command for the Development stage"
```

---

### Task 6: Update project docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the file layout established in Tasks 1–5 (documents it, no code coupling).

- [ ] **Step 1: Update `README.md`'s "目前內容" section**

The current section reads:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `hooks/hooks.json` + `hooks/sync-dashboard.mjs` — PostToolUse hook，每次相關的 `state.json` 被寫入時在背景自動重建需求總覽，不會出現在對話裡
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

Replace it with:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-develop.md` — 入口指令，對已核准的需求啟動 Developer → Review/Test 的 Development 階段
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `agents/agent-work-team-developer.md` — Developer Agent（依單一 task 實作程式碼）
- `agents/agent-work-team-reviewer.md` — Review/Test Agent（審查單一 task 或整個需求）
- `hooks/hooks.json` + `hooks/sync-dashboard.mjs` — PostToolUse hook，每次相關的 `state.json` 被寫入時在背景自動重建需求總覽，不會出現在對話裡
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，Development 階段設計見 `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

- [ ] **Step 2: Update `CLAUDE.md`'s "目前狀態" section**

The current section reads:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

Replace it with:

```markdown
## 目前狀態

- Planning 階段已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，止於 `SPEC_APPROVED`
- Development 階段已實作：`/agent-work-team-develop <RQ-ID>` 驅動 Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED`
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`（Planning）與 `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`（Development）
- Knowledge Agent 尚未實作，屬於後續版本
```

- [ ] **Step 3: Verify both files updated**

Run: `grep -c 'agent-work-team-develop' README.md && grep -c 'agent-work-team-develop' CLAUDE.md`
Expected: both counts `>= 1`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the Development stage in project docs"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–6.

- [ ] **Step 1: Confirm final tree**

Run: `find agents commands -type f -name 'agent-work-team*'`
Expected output (order may vary):
```
agents/agent-work-team-developer.md
agents/agent-work-team-pm.md
agents/agent-work-team-plan-sd.md
agents/agent-work-team-reviewer.md
commands/agent-work-team-dashboard.md
commands/agent-work-team-develop.md
commands/agent-work-team.md
```

- [ ] **Step 2: Manually walk through the Development stage in a scratch test project (user-driven, not scriptable)**

In a scratch project where this plugin is installed (reinstall/update it first — see this repo's README), run:

1. Run `/agent-work-team "測試用需求描述"` all the way to `SPEC_APPROVED`, and confirm the resulting `plan-spec.json`'s `task_breakdown` is the new structured-object format.
2. Run `/agent-work-team-develop {request_id}` — confirm `state.json` advances to `DEVELOPING` and `dev/progress.json` is initialized with every task `pending`.
3. Confirm each task is processed sequentially: `dev/T{n}-report.*` and `dev/T{n}-review.*` are created, and `dashboard.md` reflects the current stage throughout (no manual command needed to see it).
4. Deliberately make one task's implementation miss its acceptance criteria (or ask the developer to skip a requirement) — confirm the reviewer catches it, the fix loop triggers, and `fix_rounds` increments correctly in `dev/progress.json`.
5. Let the same task fail review twice in a row — confirm the flow stops with `status: "Blocked"` and lists the unresolved issues, and that later tasks are not processed.
6. Starting a fresh request, after all tasks pass, confirm `state.json` advances through `TESTING` to `PENDING_FINAL_APPROVAL`, and `dev/final-review.md` is produced and the user is told to go read it.
7. Reply approve — confirm `state.json` becomes `DEV_APPROVED` with `progress: 100`.
8. Run `/agent-work-team-develop` with an old Round-1-format `plan-spec.json` (string-array `task_breakdown`, if one exists from before this plan) — confirm it's rejected with a clear message instead of being silently misinterpreted.

This step is manual because installing and invoking a plugin's slash commands, and observing a multi-turn agent pipeline, is not something scriptable via Bash.
