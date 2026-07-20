# Agent Work Team 現況盤點（確認版）

> 盤點日期：2026-07-20  
> 盤點對象：Claude Code plugin `ai-agent-dev-platform` v0.1.0  
> 文件目的：供專案維護者確認目前已實作的功能、操作方式、流程與限制是否描述正確。本文只記錄現況，不包含 GitHub Copilot 轉換方案。

## 1. 工具定位

`ai-agent-dev-platform` 是一個 Claude Code plugin，以 slash command 驅動多個 subagent，將單一需求依序帶過 Planning、Development 與 Knowledge 三個階段。Claude Code 的主對話負責 Controller／流程編排，subagent 負責各自工作，需求狀態與產物則持久化在使用者專案的 `.agent-work-team/`。

它目前不是獨立 CLI、常駐服務或 Web UI，也不以 plugin repo 作為需求資料庫。每個階段都保留人工確認或核准關卡。

## 2. 已提供的使用者指令

| 指令 | 現況用途 |
|---|---|
| `/agent-work-team "<需求描述>"` | 建立全新需求，執行 PM → BA → Plan/SA/SD，止於 `SPEC_APPROVED`。不能用來續接既有需求。 |
| `/agent-work-team-resume [RQ-ID]` | 列出在途需求並續接 Planning 軟停；Development／Knowledge 需求只提供正確指令，不代替其執行。 |
| `/agent-work-team-develop <RQ-ID>` | 開始或續接 Development，逐 task 實作與審查，完成整體審查後止於 `DEV_APPROVED`。 |
| `/agent-work-team-knowledge <RQ-ID>` | 開始或續接 Knowledge，整理成果到 Obsidian wiki，人工核准後進入 `DONE`。 |
| `/agent-work-team-dashboard` | 在 dashboard 過期、損毀或遺失時手動重建 `.agent-work-team/dashboard.md`。 |
| `/agent-work-team-help` | 顯示指令、生命週期與 status 圖例。 |

`develop` 與 `knowledge` 若未提供 RQ-ID，會從符合階段的需求中選擇 `updated` 最新者；`resume` 未提供 RQ-ID 時則列出所有在途需求，讓使用者自行選擇，不會自動挑最新需求。

## 3. 參與角色

| 角色 | 現況責任 | 是否直接與使用者互動 |
|---|---|---|
| Controller（Claude Code 主對話） | 建立需求、路由狀態、讀寫 checkpoint、dispatch subagent、執行人工關卡 | 是 |
| PM Agent | 將原始需求分類並產生短標題、來源、團隊、優先級 | 否 |
| BA | 逐題澄清範圍、限制、成功標準與 Acceptance Criteria | 是，由 Controller 直接執行，不是獨立 subagent |
| Plan/SA/SD Agent | 將核准需求展開為 User Story、流程、技術設計、task 與測試計畫 | 否 |
| Developer Agent | 一次實作一個 task、執行相關測試、建立 commit 與報告 | 否 |
| Review/Test Agent | 唯讀審查單一 task 或整體 diff，判斷 spec 合規與程式碼品質 | 否 |
| Knowledge Agent | 從已核准成果萃取知識，新增或更新 Obsidian wiki 並 commit | 否 |

目前 MVP 將 Plan、SA、SD 合併為一個 Agent。所有 subagent 都由 command／Controller 呼叫，不是設計給使用者直接呼叫的入口。

## 4. 需求生命週期

```text
CREATED
→ PM_TRIAGE
→ BA_CLARIFYING
→ SPEC_DRAFTING
→ PENDING_SPEC_APPROVAL
→ SPEC_APPROVED
→ DEVELOPING
→ TESTING
→ PENDING_FINAL_APPROVAL
→ DEV_APPROVED
→ PENDING_KNOWLEDGE_APPROVAL
→ DONE
```

主要 status 語意：

| Status | 現況語意 |
|---|---|
| `Running` | Controller 或 subagent 正在處理。 |
| `Pending Confirmation` | Planning 即時對話軟停，等待 BA 問題或需求摘要的回答。 |
| `Pending Approval` | 已有磁碟產物，等待人工正式核准。 |
| `Blocked` | Agent 卡住、資訊不足或重試超限，需要人工介入。 |
| `Approved` | Planning 或 Development 關卡已核准。 |
| `Completed` | Knowledge 已核准，完整需求生命週期結束。 |

`.agent-work-team/requests/<RQ-ID>/state.json` 是狀態的單一真相來源。Dashboard 是衍生檢視，選定需求並續接前仍會重讀 `state.json`。

## 5. Planning 現況流程

### 5.1 建立與 PM 分類

1. `/agent-work-team` 找出下一個 `RQ-NNN`。
2. 產生一個需求生命週期內不變的隨機 token。
3. 建立初始 `state.json`。
4. PM Agent 將需求分類為下列其中一種：
   - `New Feature`
   - `Bug Fix`
   - `Refactor`
   - `Performance`
   - `Security`
   - `Documentation`
   - `Research`
5. PM 同時判斷 `source`、`team`、`priority`，產生 `pm-triage.json` 與 `pm-triage.md`。

### 5.2 BA 澄清

1. Controller 一次詢問一個問題。
2. 每組問答與下一個待回答問題即時寫入 `planning/checkpoint.json`。
3. 提問前先寫 checkpoint，再將 `state.json` 設為 `Pending Confirmation`，避免 session 中斷時遺失待確認內容。
4. 資訊足夠後，Controller 顯示完整需求摘要與 Acceptance Criteria，等待明確確認。
5. 確認後產生 `ba-requirement.json` 與 `ba-requirement.md`。

### 5.3 技術規格與核准

Plan/SA/SD Agent 產生：

- Requirement Summary
- User Story
- Functional Flow
- Technical Design
- File Impact
- Task Breakdown
- Test Plan

每個 task 必須具備 `id`、`description`、非空 `files` 與 `acceptance_criteria`。規格同時寫入 `plan-spec.json` 與 `plan-spec.md`。

人工必須開啟 `plan-spec.md` 審閱。核准後狀態進入 `SPEC_APPROVED`，並建立 `task-summary.md`。這份 task summary 是核准當下的靜態快照，Development 開始後不會更新。

## 6. Development 現況流程

1. 驗證目前階段允許開始或恢復 Development。
2. 比對 `state.json` 與 `pm-triage.json` token。
3. 驗證 `plan-spec.json.task_breakdown` 的資料格式。
4. 記錄目前分支為 `base_branch`。
5. 建立或沿用 `agent-work-team/<RQ-ID>` 分支。
6. 建立或讀取 `dev/progress.json`。
7. 依 task 順序執行，不平行處理；已為 `done` 的 task 會跳過。
8. Developer 只處理一個 task，執行相關測試、commit，並寫入 `Tn-report.json/.md`。
9. Reviewer 自行讀取 commit range 的 diff，寫入 `Tn-review.json/.md`。
10. Critical 或 Important 問題會觸發同 task 修正與重新審查；Minor 不阻擋核准。
11. 全部 task 完成後進入 `TESTING`，執行涵蓋完整 Development commit range 的 final review。
12. 使用者必須開啟 `dev/final-review.md` 審閱；核准後進入 `DEV_APPROVED`。

Developer 的每輪修正都建立新 commit，不 amend。流程不會自動 merge 回 `base_branch`，是否及何時 merge 由使用者決定。

`fix_rounds`、`needs_context_rounds` 或 `final_review_fix_rounds` 超過 2 時，hook 會把需求設為 `Blocked`。重新執行 development 指令可在人工介入後重試，並沿用既有分支與已完成 task。

## 7. Knowledge 現況流程

1. 只接受 `DEV_APPROVED` 或 `PENDING_KNOWLEDGE_APPROVAL` 的需求。
2. Wiki 路徑優先採用使用者專案 `CLAUDE.md` 指定的位置，否則使用 `.agent-work-team/wiki/`。
3. 讀取 PM、BA、技術設計、所有 task report／review 與 final review。
4. 視實際內容萃取：
   - Decision
   - Architecture
   - Lessons Learned
   - New Rule
   - Common Solution
5. 搜尋整個 wiki；相同主題優先更新既有筆記，不建立重複筆記。
6. 明確重疊但主題不同時，可將共用內容抽到 `Shared/`，原筆記改用 wikilink 關聯。
7. 維護每篇異動筆記的 `## 相關`、需求 Hub `Requests/<RQ-ID> - <需求名稱>.md` 與 `Requests/_Index.md`。
8. 在目前分支 commit wiki 變更。
9. 產生 `knowledge-report.json/.md`，等待人工核准。
10. 核准後進入 `DONE`；提出修改時只調整受影響筆記並建立新 commit。

Knowledge 階段沒有自動 Reviewer 或 fix round 計數器，品質關卡是人工審閱。

## 8. 續接與防護

### Planning 續接

`/agent-work-team-resume` 優先讀取 dashboard 進行粗分類。選定 Planning 需求後，重新讀取權威 `state.json`、checkpoint 與 PM token，再依實際 stage 路由：

- `CREATED`：需要使用者重新提供原始需求描述才能從 PM 開始。
- `PM_TRIAGE`：可確認後重新 dispatch PM。
- `BA_CLARIFYING`：重播已保存問答與待確認問題。
- `SPEC_DRAFTING`：可確認後重新 dispatch Plan/SA/SD。
- `PENDING_SPEC_APPROVAL`：直接回到 Spec 人工核准關卡。

### Development／Knowledge 續接

- Development 直接重跑 `/agent-work-team-develop <RQ-ID>`。
- Knowledge 直接重跑 `/agent-work-team-knowledge <RQ-ID>`。
- Resume 指令只會把這兩類需求導向對應入口。

### Token 防護

每個需求建立時產生 token，並寫入 `state.json`、`pm-triage.json` 和 Planning checkpoint。Resume、Development、Knowledge 使用既有需求資料或分支前會比對 token；不一致時停止，不自動選擇、修正或刪除任何資料。

## 9. Dashboard 與 hooks

`hooks/hooks.json` 將兩個 script 掛在 Claude Code 的 `PostToolUse`／`Write`：

- `sync-dashboard.mjs`：只有寫入 `.agent-work-team/requests/*/state.json` 時才重建 dashboard。
- `enforce-block.mjs`：只有寫入 `.agent-work-team/requests/*/dev/progress.json` 時才檢查重試上限；設為 Blocked 後也會重建 dashboard。

Dashboard 顯示 ID、名稱、類型、來源、團隊、優先級、進度、階段、Agent、status、waiting、建立日與更新日，依 `updated` 由新到舊排列。無法解析的 `state.json` 會被跳過並在 dashboard 顯示警示。

## 10. 使用者專案中的主要產物

```text
.agent-work-team/
├── dashboard.md
├── requests/
│   └── RQ-NNN/
│       ├── state.json
│       ├── pm-triage.json
│       ├── pm-triage.md
│       ├── planning/checkpoint.json
│       ├── ba-requirement.json
│       ├── ba-requirement.md
│       ├── plan-spec.json
│       ├── plan-spec.md
│       ├── task-summary.md
│       ├── dev/
│       │   ├── progress.json
│       │   ├── Tn-report.json / .md
│       │   ├── Tn-review.json / .md
│       │   └── final-review.json / .md
│       └── knowledge/
│           └── knowledge-report.json / .md
└── wiki/
    ├── Decisions/
    ├── Architecture/
    ├── Lessons Learned/
    ├── Rules/
    ├── Common Solutions/
    ├── Shared/
    └── Requests/
```

## 11. 可採用的使用方式

### 完整生命週期

```text
/agent-work-team "新增忘記密碼功能"
# 完成 BA 確認及 Spec approve
/agent-work-team-develop RQ-001
# 完成 final review approve
/agent-work-team-knowledge RQ-001
# 完成 knowledge approve
```

### 只使用 Planning

跑到 `SPEC_APPROVED` 後停止，將 `plan-spec.md` 與 `task-summary.md` 交給人工團隊或其他工具實作。

### 跨 session 處理

Planning 對話中斷後開新 session，執行 `/agent-work-team-resume`；Development 或 Knowledge 中斷則直接重跑該階段指令。

### 多需求總覽

直接查看 `.agent-work-team/dashboard.md`。只有檔案遺失、過期或損毀時才執行 `/agent-work-team-dashboard`。

## 12. 現況限制與未提供能力

- Development task 固定依序處理，沒有平行 task 編排。
- 不自動 merge Development 分支。
- 沒有在現有 Claude plugin command 中看到 GitHub Issue、Pull Request、Jira、CI/CD 或部署整合。
- 沒有獨立的 Web dashboard；dashboard 是 Markdown 檔案。
- Knowledge 階段以人工核准代替自動 Reviewer。
- `skills/example-planning` 仍是 plugin 骨架載入用的佔位 skill。
- 命令流程主要是 prompt 規格，由 Claude Code Controller 按文件執行；dashboard 同步與重試超限阻擋則是確定性的 Node.js hook。

## 13. 驗證證據邊界

`docs/manual-testing-checklist.md` 是過時文件，盤點現況時應直接忽略，不可使用其中的勾選狀態判斷目前功能是否已驗證或成熟。

本文只確認現行 command、agent、hook 與專案說明中定義或實作的行為，不宣稱每一條流程與邊界案例都已有有效的端到端驗證證據。若後續需要確認測試覆蓋率，應以當時可執行的自動測試與重新執行的實際驗證結果為準。

## 14. 請維護者確認

請針對下列項目確認本文是否符合實際期待：

- [ ] 工具定位與三階段邊界正確。
- [ ] 六個 slash command 的用途與續接責任正確。
- [ ] BA 是 Controller 直接執行，而非獨立 subagent。
- [ ] Development 的分支、commit、review、重試與人工核准描述正確。
- [ ] Knowledge 的 wiki 路徑、去重、Shared、Hub、Index 與 commit 描述正確。
- [ ] `state.json`、checkpoint、progress、dashboard 的權威關係正確。
- [ ] 現況限制正確，且本文沒有引用過時清單推論測試成熟度。

確認後，本文可作為 Claude Code plugin 現況的人工核准基線；任何不符處應先修正文案，再用於後續工具轉換工作的輸入。

## 15. 現況來源

- `README.md`
- `CLAUDE.md`
- `.claude-plugin/plugin.json`
- `commands/agent-work-team*.md`
- `agents/agent-work-team-*.md`
- `hooks/hooks.json`
- `hooks/sync-dashboard.mjs`
- `hooks/enforce-block.mjs`

明確排除：`docs/manual-testing-checklist.md` 已過時，不作為本盤點的現況來源或驗證證據。
