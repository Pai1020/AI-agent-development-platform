# Agent Work Team — Planning 階段 Design

## 背景與目的

`AI-agent-development-platform` plugin 的骨架已經建好（`.claude-plugin/`、`skills/`、`agents/`、`commands/` 佔位範例）。本次 spec 設計第一個實際功能：把使用者 `AI_Development_Platform_MVP_v4.md` 裡描述的多 Agent 開發團隊，落實成第一版可用的 Claude Code plugin 功能。

MVP 文件描述的是完整六個 Agent（PM→BA→Plan/SA/SD→Dev→Review→Knowledge）+ Workflow Engine + State Machine + Dashboard 的獨立平台。這個規模需要拆成多個子專案。本次 spec **只涵蓋 Planning 階段**：PM Agent → BA Agent → Plan/SA/SD Agent，止於 Pending Spec Approval。Dev/Review/Knowledge Agent、Validation Layer、Plugin 生態系、多 Methodology、Child Dashboard 都不在本次範圍內。

## 架構決策：無後端，狀態存在使用者專案的檔案系統

MVP 文件裡的 Workflow Engine（派工）、State Machine（持久化）、Mother Dashboard（即時總覽）原本設想需要常駐後端服務。經確認，這一版改用**檔案狀態 + Claude Code command/subagent** 達成同樣效果：

- 沒有常駐服務、沒有資料庫。
- 每個需求的狀態是使用者專案 repo 裡的一個 JSON 檔案（`state.json`），由 command/subagent 直接讀寫。
- Dashboard 是一個自動維護的檔案（`dashboard.md`），每次狀態變更時同步重新渲染，而不是查詢即時服務或需要另外呼叫指令才看得到。
- 每個階段的產出都有 **json（給下一步 agent 讀）+ md（給人類讀）** 兩份。

這個做法跟本次 session 稍早用來建置 plugin 骨架的 `subagent-driven-development` 模式（brief 檔 + report 檔 + progress ledger）是同一套原理，證明這個機制在 Claude Code 裡確實可行。

## 命名空間

- 狀態資料夾：`.agent-work-team/requests/RQ-00X/`（存在**使用者自己的專案 repo**根目錄，不是這個 plugin repo 裡）
- 入口 command：`/agent-work-team "<需求描述>"`
- Dashboard 檔案：`.agent-work-team/dashboard.md`（自動維護，不需呼叫指令）
- Dashboard 備用重建 command：`/agent-work-team-dashboard`

## 目錄與檔案結構

```
.agent-work-team/
├── dashboard.md             # Mother Dashboard，彙整所有需求，自動維護，直接開來看
└── requests/
    └── RQ-001/
        ├── state.json          # 單一需求的單一真相來源
        ├── pm-triage.json      # PM Agent 產出（機器讀）
        ├── pm-triage.md        # PM Agent 產出（人類讀）
        ├── ba-requirement.json # BA Agent 產出
        ├── ba-requirement.md
        ├── plan-spec.json      # Plan/SA/SD Agent 產出
        └── plan-spec.md
```

**`dashboard.md` 是自動維護的檔案，不需要另外呼叫任何 command 才看得到。** `/agent-work-team` 每次用 Write 更新任一需求的 `state.json` 之後，都會緊接著重新掃描所有需求、重新渲染表格、覆寫這個檔案（詳見下方「Dashboard 同步」）。

**ID 產生方式：** 掃描 `.agent-work-team/requests/` 底下現有的 `RQ-NNN` 資料夾，取最大號 +1（找不到任何資料夾則從 `RQ-001` 開始）。

## 狀態機（本次範圍）

```
CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING → PENDING_SPEC_APPROVAL → SPEC_APPROVED
```

**BLOCKED 不是 `current_stage` 的一個值。** 卡住時 `current_stage` 保持在卡住當下的階段不變（例如卡在 PM 分類就停在 `PM_TRIAGE`），只有 `status` 變成 `"Blocked"`、`waiting_on` 變成 `"Human"`。這樣 dashboard 才能同時顯示「卡在哪一步」與「正在卡住」兩個資訊，而不是用 `current_stage: "BLOCKED"` 蓋掉原本卡住的階段。

**Progress 對照表**（由 controller 依 `current_stage` 計算，agent 不自行回報；卡住時 `progress` 沿用卡住當下 `current_stage` 對應的數值，不特別歸零或改變）：

| current_stage | progress |
|---|---|
| CREATED | 0 |
| PM_TRIAGE | 10 |
| BA_CLARIFYING | 30 |
| SPEC_DRAFTING | 60 |
| PENDING_SPEC_APPROVAL | 90 |
| SPEC_APPROVED | 100 |

## `state.json` 欄位

```json
{
  "id": "RQ-001",
  "name": "Login API",
  "type": "New Feature",
  "source": "User",
  "team": "New Feature Team",
  "priority": "High",
  "progress": 30,
  "current_stage": "BA_CLARIFYING",
  "current_agent": "BA Agent",
  "status": "Running",
  "waiting_on": null,
  "created": "2026-07-04",
  "updated": "2026-07-04"
}
```

- `type`: `New Feature` | `Bug Fix` | `Refactor` | `Performance` | `Security` | `Documentation` | `Research`
- `source`: `User` | `Product` | `Bug Report` | `Tech Debt` | `AI Suggestion` | `Monitoring`
- `team`: `New Feature Team` | `Maintenance Team`
- `priority`: `Critical` | `High` | `Medium` | `Low`
- `status`: `Running` | `Pending Approval` | `Blocked` | `Approved`
- `waiting_on`: `null` | `"Human Review"`（等待 spec 核准）| `"Human"`（PM 或 Plan/SA/SD 卡住，需要人判斷）

## Dashboard 同步

`/agent-work-team` 每次用 Write 更新任一需求的 `state.json` 之後（不管是哪一步、哪個欄位），緊接著都要做同一件事：

1. 用 Glob 找出 `.agent-work-team/requests/*/state.json` 全部檔案
2. 用 Read 讀出每一個
3. 依 `updated` 新到舊排序，渲染成表格（欄位順序：ID／需求名稱／類型／來源／Team／優先級／Progress／Current Stage／Current Agent／Status／Waiting／Created／Updated；`null` 值一律顯示 `-`，`name` 為 `null` 時顯示 `(未命名)`）
4. 用 Write 覆寫 `.agent-work-team/dashboard.md`：`# Agent Work Team Dashboard` 標題 + 這個表格

下面流程裡每次寫「更新 state.json」，都隱含「接著同步 dashboard」這個動作。

## `/agent-work-team "<需求描述>"` 執行流程

Controller（command 本身的 prompt，執行於主對話串）依序驅動：

1. **建立需求**：產生新的 `RQ-00X`，寫入初始 `state.json`（`current_stage: CREATED`, `progress: 0`, `status: Running`）。

2. **Dispatch PM subagent**（分類任務，用輕量模型）：
   - 輸入：原始需求描述
   - 輸出：`pm-triage.json` / `.md`，內容為 `type`、`source`、`team`、`priority`、`reasoning`（分類理由）
   - Controller 用回傳內容更新 `state.json`（`type`/`source`/`team`/`priority` 帶入，`current_stage: BA_CLARIFYING`, `current_agent: "BA Agent"`, `progress: 30`）

3. **BA 階段（主線程執行，不 dispatch subagent）**：
   - Controller 直接與使用者一問一答，釐清需求、補齊 Acceptance Criteria（比照本次 session 使用的 brainstorming 一次一題模式）
   - 直到使用者明確確認需求（例如回覆「確認」/「approved」）
   - 寫入 `ba-requirement.json` / `.md`（欄位：`requirement_summary`、`acceptance_criteria`（陣列）、`clarification_log`（問答紀錄陣列）、`approved_at`）
   - 更新 `state.json`（`current_stage: SPEC_DRAFTING`, `current_agent: "Plan/SA/SD Agent"`, `progress: 60`）

4. **Dispatch Plan/SA/SD subagent**（技術設計任務，用較強模型）：
   - 輸入：`ba-requirement.json` 全文
   - 輸出：`plan-spec.json` / `.md`，內容為 `requirement_summary`、`user_story`、`functional_flow`、`technical_design`、`file_impact`（陣列）、`task_breakdown`（陣列）、`test_plan`
   - 更新 `state.json`（`current_stage: PENDING_SPEC_APPROVAL`, `current_agent: null`, `status: "Pending Approval"`, `waiting_on: "Human Review"`, `progress: 90`）

5. **Human Approval Gate**：Controller 提示使用者「Spec 已產出於 `.agent-work-team/requests/RQ-00X/plan-spec.md`，請開啟確認後回覆 approve 或提出修改意見」。
   - 回覆 **approve** → `state.json` 更新為 `current_stage: SPEC_APPROVED`, `status: "Approved"`, `waiting_on: null`, `progress: 100`。流程於此結束（Dev Team 為後續擴充，本次不實作）。
   - 回覆 **修改意見** → 依問題性質退回第 3 步（BA，若需求本身有誤）或重新執行第 4 步（若只是設計內容需調整，重新 dispatch Plan/SA/SD 並附上使用者意見）。

## 錯誤處理

若 PM 或 Plan/SA/SD subagent 回報 `BLOCKED` 或 `NEEDS_CONTEXT`：
- `NEEDS_CONTEXT`：Controller 補充資訊後重新 dispatch，不需要更新 `state.json` 的 stage（仍在同一階段）。
- `BLOCKED`：Controller 將 `state.json` 的 `status` 設為 `"Blocked"`、`waiting_on: "Human"`，並把 subagent 回報的具體卡住原因呈現給使用者，而非自行猜測繼續執行。

## `/agent-work-team-dashboard`（備用指令）

正常情況下不需要執行這個指令——`.agent-work-team/dashboard.md` 已經由 `/agent-work-team` 自動維護，直接開檔案看就好。這個指令只在你懷疑檔案過期、損毀或被手動刪除時，用來手動重跑一次「Dashboard 同步」（見上方），重新掃描並覆寫 `.agent-work-team/dashboard.md`，同時把渲染結果貼在回覆裡讓你立即確認。

Child Dashboard（單一需求的階段 checklist）本次不實作——`/agent-work-team` 每次執行都會直接告知使用者目前卡在哪一步，且 `state.json` 與各階段 `.md` 檔已包含所需資訊。

## 驗證方式

由於這是 prompt 驅動的功能（無自動化測試套件可跑），驗證方式為：在一個測試專案 repo 裡實際執行一次完整流程：

1. 執行 `/agent-work-team "測試用需求描述"`，確認 `RQ-001` 資料夾與 `pm-triage.*` 正確產生，`state.json` 正確前進到 `BA_CLARIFYING`，且**不用另外呼叫任何指令**，`.agent-work-team/dashboard.md` 就已經同步顯示這個需求。
2. 走完 BA 一問一答，確認 `ba-requirement.*` 產生、`state.json` 前進到 `SPEC_DRAFTING`，`dashboard.md` 同步更新。
3. 確認 `plan-spec.*` 產生七項內容齊全、`state.json` 前進到 `PENDING_SPEC_APPROVAL` 並提示使用者去看檔案，`dashboard.md` 同步更新。
4. 回覆 approve，確認 `state.json` 變成 `SPEC_APPROVED`、`progress: 100`，`dashboard.md` 同步更新。
5. 手動刪除或改壞 `dashboard.md`，執行 `/agent-work-team-dashboard`，確認它能重新掃描並正確重建這個檔案。
6. 刻意讓 PM 或 Plan/SA/SD 卡住（例如提供無法分類的描述），確認 `BLOCKED` 狀態與提示正確運作，且 `dashboard.md` 也同步反映 Blocked 狀態。

## Out of scope

- Developer Agent、Review/Test Agent、Knowledge Agent（下一輪 sub-project）
- Validation Layer、多 Methodology（BDD/DDD/Scrum）切換
- Child Dashboard、Agent Dashboard（未來如有需要再加）
- Plugin 生態系（Spring/Angular/Docker/K8s/Oracle/Git plugin 自動載入）
- 多團隊平行派工的自動化（本次每個需求仍是單一 `/agent-work-team` 呼叫循序執行到底）
- 任何常駐後端服務、資料庫、Web UI
