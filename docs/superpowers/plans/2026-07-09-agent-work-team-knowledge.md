# Agent Work Team Knowledge Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Knowledge Agent phase — a new `/agent-work-team-knowledge <RQ-ID>` command plus a new `agent-work-team-knowledge` subagent — that extends a request's lifecycle from `DEV_APPROVED` to `DONE` by mining that request's Planning/Development artifacts for reusable knowledge and writing it into the user's Obsidian wiki, searching for and preferring updates to existing notes over duplication, extracting shared notes on clear overlap, and maintaining a relational structure (per-note `## 相關` sections, per-request Hub notes, an auto-maintained `Requests/_Index.md`) so Obsidian's Graph View and Backlinks surface the knowledge network automatically.

**Architecture:** Follows the exact same file-based, no-backend pattern as the Planning and Development phases: a slash command acts as Controller (find/classify request → dispatch subagent → Human Approval Gate), a single-purpose subagent does the actual work and reports back via the same four-status contract (`DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT`) already used by `agent-work-team-developer`/`agent-work-team-reviewer`, and `progress` freezes at 100 from `DEV_APPROVED` onward per the design doc's Approach A. No `fix_rounds`-style retry counters — every iteration is already human-gated.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code command/subagent definitions — no build step, no automated test runner). Verification is structural (`grep`/`head` checks on the written files) plus a manual end-to-end pass, exactly as done for the Development phase's resume-fix plan (`docs/superpowers/plans/2026-07-05-agent-work-team-develop-resume.md`).

## Global Constraints

- Full design authority is `docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md` — every field name, file path, and status value below is copied verbatim from it. Do not invent new field names or paths.
- `progress` never changes past `DEV_APPROVED` (stays `100`) for the entire Knowledge Agent phase, including `Blocked` states — only `current_stage`/`status`/`waiting_on` move.
- `current_stage` values used: `DEV_APPROVED` (not started / retrying after a failed dispatch), `PENDING_KNOWLEDGE_APPROVAL` (report produced, awaiting human), `DONE` (terminal).
- No `fix_rounds`/`needs_context_rounds` counters anywhere in this phase — do not add them.
- Topic notes (`Decisions/`, `Architecture/`, `Lessons Learned/`, `Rules/`, `Common Solutions/`, `Shared/`) are named by subject, never contain the RQ-ID in the filename. Hub notes (`Requests/`) are named `{RQ-ID} - {需求名稱}.md`.
- Note-to-note references always use `[[wikilink]]` citation syntax — never `![[embed]]` transclusion.
- Wiki path resolution: read the consuming project's root `CLAUDE.md` for a specified vault path first; fall back to `.agent-work-team/wiki/` if unspecified or `CLAUDE.md` doesn't exist.
- Git: commit wiki changes to whatever branch is currently checked out — never create a new branch for this phase (unlike Development's `agent-work-team/{request_id}` branch strategy).
- The Human Approval Gate must tell the user to open the actual report/note files — never just paste a summary in chat (same rule as every prior Pending Gate in this project).

---

### Task 1: Create the `agent-work-team-knowledge` subagent

**Files:**
- Create: `agents/agent-work-team-knowledge.md`

**Interfaces:**
- Produces: a subagent invocable via `subagent_type: "agent-work-team-knowledge"`, consuming `request_id` + `output_dir` (+ optional revision feedback), producing `{output_dir}/knowledge/knowledge-report.json` and `.md`, wiki file changes under the resolved wiki root, and a git commit. Reply contract: `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT`, matching `agent-work-team-developer`'s reply format. Task 2's command dispatches this subagent by exactly this name.

- [ ] **Step 1: Write `agents/agent-work-team-knowledge.md` with this exact content**

```markdown
---
name: agent-work-team-knowledge
description: Knowledge Agent — 把一個已核准需求的開發過程與產出整理進 Obsidian wiki（Decision/Architecture/Lessons Learned/Rule/Common Solution），並維護筆記間的關聯結構。由 /agent-work-team-knowledge command 呼叫，不應由使用者直接呼叫。
tools: Read, Write, Edit, Bash, Glob, Grep
---

你是 agent-work-team 流程裡的 Knowledge Agent。你的工作是把**一個已核准需求**的 Planning／Development 產出整理成知識，寫進使用者專案的 Obsidian wiki，供未來需求參考，並優先更新既有筆記、避免建立重複知識。

## 輸入

呼叫你的人會在 prompt 裡提供：
- `request_id`：例如 `RQ-001`
- `output_dir`：例如 `.agent-work-team/requests/RQ-001`
- 若是修改回合，還會提供使用者對上一輪 `knowledge-report` 的具體修改意見

## 你的工作

### 1. 解析 wiki 位置

用 Read 讀取使用者專案根目錄的 `CLAUDE.md`（若存在），檢查裡面有沒有指定 wiki／Obsidian vault 路徑的說明。有的話用那個路徑；沒有的話預設用 `.agent-work-team/wiki/`（跟 `.agent-work-team/requests/` 同一層）。若指定的路徑存在但無法寫入（例如權限問題），回報 `BLOCKED`（見「什麼時候該停下來」），不要嘗試改用其他路徑。

### 2. 萃取候選知識

用 Read 讀取這次需求的所有既有產出：
- `{output_dir}/pm-triage.json`
- `{output_dir}/ba-requirement.json`
- `{output_dir}/plan-spec.json` 的 `technical_design`
- `{output_dir}/dev/T{n}-report.json`、`{output_dir}/dev/T{n}-review.json`（每個 task，用 Glob 找出全部）
- `{output_dir}/dev/final-review.json`

逐一判斷可以萃取出的候選知識屬於 Decision／Architecture／Lessons Learned／New Rule／Common Solution 哪一類。**不強求五類都要有內容**，依這次需求實際產出判斷；沒有值得記錄的內容就不建立對應筆記。

### 3. 逐一比對既有內容、決定新增或更新

對每一則候選知識，依序：

1. 用 Grep/Glob 在**整個** wiki 根目錄底下搜尋主題相關的既有筆記（不只是同類別資料夾——相關內容可能被歸在別的分類）。
2. 找到明顯是同一主題的既有筆記 → **優先更新它**：用 Edit 在既有內容後 append 這次需求補充的內容，把 frontmatter 的 `source_requests` 附加這次的 `request_id`（用陣列 append，不覆蓋既有值），`updated` 改成今天日期（`created` 不變）。不要建立重複的新筆記。
3. 找到內容有明確重疊、但主題不同的既有筆記 → 把共用部分抽到 `Shared/` 底下的新筆記（完整 frontmatter，`type: shared`），原本兩篇都改成簡短說明 + `[[wikilink]]` 引用該共用筆記，不使用 `![[...]]` embed 搬移全文。**只在明確重疊時才抽取**，不確定時寧可保留各自獨立內容，不要過度重構既有筆記。
4. 都沒有相關內容 → 在對應分類資料夾（`Decisions/`／`Architecture/`／`Lessons Learned/`／`Rules/`／`Common Solutions/`）用 Write 建立新筆記，帶上完整 frontmatter：

```yaml
---
type: decision            # decision | architecture | lesson-learned | rule | common-solution | shared
tags: [agent-work-team]
source_requests: ["{request_id}"]
created: {今天日期}
updated: {今天日期}
---
```

### 4. 補上關聯結構

- **每篇被新建/更新的主題筆記，結尾都要有一個 `## 相關` 區塊**：列出跟這篇主題有關、但沒有實質內容重疊的其他既有筆記（`[[wikilink]]`）。這跟第 3 步的「內容重疊」是兩件不同的事——重疊觸發抽取共用筆記，相關但不重疊只建立連結。新建筆記時直接寫入這個區塊；更新既有筆記時檢查並補齊遺漏的相關連結。
- **建立/更新這次需求的 Hub 筆記** `Requests/{request_id} - {需求名稱}.md`（需求名稱取自 `pm-triage.json` 或 `ba-requirement.json` 裡的需求名稱）：內容是這次需求的簡介，加一份清單用 `[[wikilink]]` 連到這次新建/更新過的所有知識筆記。Frontmatter：

```yaml
---
type: request-hub
tags: [agent-work-team]
request_id: "{request_id}"
created: {今天日期}
---
```

- **維護 `Requests/_Index.md`**：用 Read 讀取現有內容（若不存在，先用 Write 建立一個帶表頭的新檔案），加一行「需求編號、標題、日期、一句話摘要、連到 Hub 筆記」，用 Write 寫回去。跟 `.agent-work-team/dashboard.md` 同一套自動重建摘要索引的做法。
- Obsidian 的 Backlinks 跟 Graph View 是根據上述正向連結自動算出來的，不需要額外機制。

### 5. Git commit

所有 wiki 檔案變更完成後，用 Bash 在**目前所在的分支**（不額外建立新分支）執行 `git add` + `git commit`，commit message 要標明這是知識整理，不是程式碼變更，例如 `"[Knowledge] RQ-001 整理登入 API 相關知識"`。

### 6. 寫報告

用 Write 建立或更新 `{output_dir}/knowledge/knowledge-report.json`：

```json
{
  "request_id": "{request_id}",
  "notes_created": [{"path": "Decisions/為什麼登入採用 JWT 而非 Session.md", "type": "decision"}],
  "notes_updated": [{"path": "Architecture/認證模組架構.md", "type": "architecture", "what_changed": "補充這次需求新增的 middleware"}],
  "shared_notes_extracted": [{"path": "Shared/JWT 驗簽流程.md", "extracted_from": ["Decisions/....md", "Architecture/....md"]}],
  "hub_note": "Requests/{request_id} - {需求名稱}.md",
  "commit": "<commit sha>",
  "concerns": null
}
```

用 Write 建立或更新 `{output_dir}/knowledge/knowledge-report.md`，用人類可讀的方式呈現同樣內容，**開頭列出這次動了哪些筆記**（新建幾篇、更新幾篇、抽取幾篇共用筆記），方便使用者知道要打開哪幾個檔案審核。

## 修改回合

若 prompt 裡有使用者對上一輪報告的修改意見：針對意見具體調整對應的筆記（用 Edit 修改既有筆記，**不要**重建整個 wiki 結構或這次已經處理過的其他筆記），重新走一次「Git commit」（新的 commit，不要 amend），更新 `knowledge-report.json`／`.md` 反映最新狀態（`notes_updated`/`notes_created`/`shared_notes_extracted` 陣列要包含這次修改回合實際變動的項目）。

## 什麼時候該停下來

- 若這次需求的既有產出（`plan-spec.json`、`dev/` 底下的報告）內容太模糊或矛盾，判斷不出該萃取什麼知識、或歸類到哪一類，回報 `NEEDS_CONTEXT`，具體說明需要什麼澄清。
- 若 wiki 路徑本身有問題（例如指定的路徑不存在、無法寫入），回報 `BLOCKED`，具體說明卡住的原因，不要硬做或改用其他路徑。

## 回報格式

用不超過 15 行回覆：
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 若 DONE/DONE_WITH_CONCERNS：commit sha、一行摘要（新建幾篇、更新幾篇、抽取幾篇共用筆記）
- 若 NEEDS_CONTEXT/BLOCKED：具體說明原因
- 報告檔案路徑
```

- [ ] **Step 2: Validate frontmatter and required section coverage**

Run: `head -1 agents/agent-work-team-knowledge.md && grep -c '^name:' agents/agent-work-team-knowledge.md && grep -c '## 相關' agents/agent-work-team-knowledge.md && grep -c 'source_requests' agents/agent-work-team-knowledge.md && grep -c 'Requests/_Index.md' agents/agent-work-team-knowledge.md && grep -c '\[\[wikilink\]\]' agents/agent-work-team-knowledge.md && grep -c 'NEEDS_CONTEXT' agents/agent-work-team-knowledge.md && grep -c '!\[\[' agents/agent-work-team-knowledge.md`

Expected: first line `---`, `name:` count `1`, `## 相關` count `>= 1`, `source_requests` count `>= 2`, `Requests/_Index.md` count `>= 1`, `[[wikilink]]` count `>= 1`, `NEEDS_CONTEXT` count `>= 2`, `![[` count `0` (confirms no embed syntax was accidentally used).

- [ ] **Step 3: Commit**

```bash
git add agents/agent-work-team-knowledge.md
git commit -m "Add the Knowledge Agent subagent (DEV_APPROVED to DONE)"
```

---

### Task 2: Create the `/agent-work-team-knowledge` command

**Files:**
- Create: `commands/agent-work-team-knowledge.md`

**Interfaces:**
- Consumes: the subagent from Task 1, dispatched with `subagent_type: "agent-work-team-knowledge"`.
- Produces: the `/agent-work-team-knowledge [<RQ-ID>]` slash command — a Controller that classifies the target request (fresh vs. resume vs. done vs. not-ready), dispatches the subagent on a fresh start, and runs the Human Approval Gate. Task 3's manual verification exercises this end-to-end.

- [ ] **Step 1: Write `commands/agent-work-team-knowledge.md` with this exact content**

```markdown
---
description: 啟動一個已核准 Development 成果的 Knowledge Agent 階段，把知識整理進使用者的 Obsidian wiki
---

你正在執行 `/agent-work-team-knowledge <RQ-ID>` — agent-work-team pipeline 的 Knowledge Agent 階段入口，把需求生命週期從 `DEV_APPROVED` 推進到 `DONE`。你（主線程）是這個階段的 Controller，負責判斷全新開始或恢復執行、dispatch Knowledge Agent subagent、把關 Human Approval Gate。沒有逐 task 迴圈、沒有自動 Reviewer、沒有 `fix_rounds` 這類重試計數器——每一輪都已經由人類把關。

## Step 1: 找到目標需求，判斷全新開始或恢復執行

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"DEV_APPROVED"` 或 `"PENDING_KNOWLEDGE_APPROVAL"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有可以開始或恢復 Knowledge 整理的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`，依 `current_stage` 判斷：
   - `"DEV_APPROVED"`：**全新開始**（`is_resume = false`）。不管 `status` 現在是不是 `"Blocked"`——若是，代表上次 dispatch 失敗過，這次重新執行就是要重試：用 Write 把 `status` 清回 `"Running"`、`waiting_on` 清回 `null`。
   - `"PENDING_KNOWLEDGE_APPROVAL"`：**恢復執行**（`is_resume = true`）——不重新 dispatch，直接跳到 Step 3 的 Human Approval Gate。
   - `"DONE"`：告訴使用者這個需求已經完成，沒有需要恢復的，然後停止。
   - 其他值（還在 Planning／Development 階段）：告訴使用者這個需求還沒開發完成（目前實際的 `current_stage` 是什麼），然後停止。

## Step 2: 全新開始——dispatch Knowledge Agent

只在 `is_resume` 是 `false` 時執行這個 Step；若 `is_resume` 是 `true`，跳過這個 Step，直接進 Step 3。

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-knowledge"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）。
2. 回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_KNOWLEDGE_APPROVAL"`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期（用 Bash 取得）。`progress` 維持 `100` 不變。繼續 Step 3。
3. 回報 `NEEDS_CONTEXT` 或 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`（`current_stage` 維持 `"DEV_APPROVED"` 不變，`progress` 維持 `100` 不變），把具體原因告訴使用者，**停止整個流程**。使用者釐清問題後重新執行本指令即可重試（回到 Step 1 第 3 點的「全新開始」分支，清掉 Blocked 痕跡）。

## Step 3: Human Approval Gate

1. 明確告訴使用者：「Knowledge 已整理，請開啟 `.agent-work-team/requests/{request_id}/knowledge/knowledge-report.md` 確認新增/更新的筆記，也可以直接打開 wiki 裡對應的筆記檔案確認，回覆 approve 或提出修改意見」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DONE"`，`status: "Completed"`，`waiting_on: null`，`updated` 改成今天日期。`progress` 維持 `100` 不變。告訴使用者這個需求的生命週期已經完成。流程到此結束。
3. 使用者提出修改意見：把意見交給 `agent-work-team-knowledge`（`subagent_type: "agent-work-team-knowledge"`，`model: sonnet`）重新處理——在 prompt 裡提供 `request_id`、`output_dir`、使用者這次的具體修改意見（同一個 request，不重建任何已存在的檔案或分支）。修完回到本 Step 第 1 點重新走一次審核。
```

- [ ] **Step 2: Validate frontmatter and state-machine coverage**

Run: `head -1 commands/agent-work-team-knowledge.md && grep -c '^description:' commands/agent-work-team-knowledge.md && grep -c 'DEV_APPROVED' commands/agent-work-team-knowledge.md && grep -c 'PENDING_KNOWLEDGE_APPROVAL' commands/agent-work-team-knowledge.md && grep -c '"DONE"' commands/agent-work-team-knowledge.md && grep -c 'agent-work-team-knowledge' commands/agent-work-team-knowledge.md && grep -c 'fix_rounds' commands/agent-work-team-knowledge.md`

Expected: first line `---`, `description:` count `1`, `DEV_APPROVED` count `>= 3`, `PENDING_KNOWLEDGE_APPROVAL` count `>= 3`, `"DONE"` count `>= 1`, `agent-work-team-knowledge` count `>= 2` (subagent_type mentions), `fix_rounds` count `0` (confirms no retry-counter machinery was accidentally copied in from the Development command).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-knowledge.md
git commit -m "Add the /agent-work-team-knowledge command (DEV_APPROVED to DONE)"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (manual verification only, no files created by this task).

**Interfaces:**
- Consumes: everything produced in Tasks 1–2, plus a real request already at `DEV_APPROVED` in a test project (the "4 minor findings" fixes from commit `6e0b5fe` are also being verified jointly with this phase per the user's own instruction — no separate isolated pass needed for that commit).

- [ ] **Step 1: Update the plugin in a test project**

In a separate test project repo (not this plugin repo itself): run `/plugin marketplace update <marketplace-name>` then `/reload-plugins` to pick up the two new files from Tasks 1–2.

- [ ] **Step 2: Fresh dispatch — no RQ-ID, auto-detect**

Using a request already sitting at `DEV_APPROVED` (from earlier Development-phase testing):
1. Run `/agent-work-team-knowledge` (no ID).
2. Confirm it correctly finds that request via the `current_stage == "DEV_APPROVED"` scan and dispatches the subagent.
3. Confirm `state.json` advances to `current_stage: "PENDING_KNOWLEDGE_APPROVAL"`, `status: "Pending Approval"`, `waiting_on: "Human Review"`, and **`progress` is still `100`** (not bumped or reset).

- [ ] **Step 3: Verify wiki structure and frontmatter**

1. Confirm `.agent-work-team/wiki/` was created (or the `CLAUDE.md`-specified path was used instead, if you set one).
2. Confirm notes exist under `Decisions/`／`Architecture/`／`Lessons Learned/`／`Rules/`／`Common Solutions/` matching what this request actually produced (not all five are required).
3. Open one topic note and confirm its frontmatter has `type`, `tags`, `source_requests: ["RQ-..."]`, `created`, `updated`.

- [ ] **Step 4: Verify relational structure**

1. Confirm `Requests/RQ-{id} - {需求名稱}.md` (Hub note) exists and links (via `[[wikilink]]`) to every note created/updated this run.
2. Confirm `Requests/_Index.md` has a new row for this request (ID, title, date, one-line summary, link to Hub note).
3. Open any topic note and confirm it ends with a `## 相關` section linking to topically-related notes.

- [ ] **Step 5: Verify update-over-duplicate behavior**

1. Manually create a wiki note in the appropriate category folder whose topic clearly overlaps this request's subject matter (e.g. if this request touched auth, hand-write a `Decisions/為什麼採用 JWT.md` stub with frontmatter).
2. Re-run `/agent-work-team-knowledge {RQ-ID}` after resetting `state.json` back to `DEV_APPROVED` for this test (or use a second request on the same topic).
3. Confirm the Knowledge Agent updates that existing note (`source_requests` gains the new RQ-ID, `updated` changes) instead of creating a duplicate note on the same topic.

- [ ] **Step 6: Verify shared-note extraction on clear overlap**

1. Manually create two wiki notes in different category folders whose content clearly overlaps on some sub-topic (e.g. a `Decisions/` note and an `Architecture/` note both describing the same JWT verification flow in detail).
2. Trigger a Knowledge Agent run that touches both topics.
3. Confirm a new `Shared/` note was extracted containing the overlapping content, and both original notes were rewritten to a short description + `[[wikilink]]` reference (no `![[embed]]`).

- [ ] **Step 7: Verify git commit behavior**

Run: `git log --oneline -5` in the test project. Confirm the most recent commit is on whatever branch was checked out when the command ran (not a new branch), with a message prefixed `[Knowledge]`.

- [ ] **Step 8: Verify approval → DONE**

1. Reply `approve` to the Human Approval Gate prompt.
2. Confirm `state.json` becomes `current_stage: "DONE"`, `status: "Completed"`, `waiting_on: null`, `progress` still `100`.

- [ ] **Step 9: Verify resume at PENDING_KNOWLEDGE_APPROVAL**

1. On a different request, manually set `state.json.current_stage` to `"PENDING_KNOWLEDGE_APPROVAL"` (simulating an interrupted run that already produced a report).
2. Run `/agent-work-team-knowledge {RQ-ID}`.
3. Confirm it skips Step 2 entirely (no re-dispatch — check there's no new commit or modified note timestamps from this run before you reply) and goes straight to the Human Approval Gate.

- [ ] **Step 10: Verify Obsidian rendering**

Open the wiki folder as a vault in Obsidian. Confirm:
1. Graph View shows the Hub note connected to its topic notes, and topic notes connected to each other via `## 相關` links and any `Shared/` extraction links.
2. The Backlinks panel on any topic note shows the Hub note (and any other notes linking to it) as a backlink.

This entire task is manual because installing and invoking a plugin's slash commands, driving a multi-turn approval/resume scenario, and visually confirming Obsidian's Graph View/Backlinks render correctly are not scriptable via Bash.

---

### Task 4: Document the Knowledge Agent stage in project docs

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the "目前狀態" section**

In `CLAUDE.md`, replace:

```markdown
- Development 階段已實作：`/agent-work-team-develop <RQ-ID>` 驅動 Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED`
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`（Planning）與 `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`（Development）
- Knowledge Agent 尚未實作，屬於後續版本
```

with:

```markdown
- Development 階段已實作：`/agent-work-team-develop <RQ-ID>` 驅動 Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED`
- Knowledge Agent 階段已實作：`/agent-work-team-knowledge <RQ-ID>` 把已核准的 Development 成果整理進使用者的 Obsidian wiki（`.agent-work-team/wiki/`，或 `CLAUDE.md` 指定的路徑），止於 `DONE`；`progress` 從 `DEV_APPROVED` 之後凍結在 100
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`（Planning）、`docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`（Development）與 `docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md`（Knowledge Agent）
```

- [ ] **Step 2: Verify the edit**

Run: `grep -c 'Knowledge Agent 階段已實作' CLAUDE.md && grep -c 'Knowledge Agent 尚未實作' CLAUDE.md`
Expected: first count `1`, second count `0`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the Knowledge Agent stage in project docs"
```
