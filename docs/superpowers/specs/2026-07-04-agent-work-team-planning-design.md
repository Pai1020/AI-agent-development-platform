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
- 入口 command：`/agent-work-team "<需求描述>"`（只開全新需求）
- 續接 command：`/agent-work-team-resume [RQ-ID]`（2026-07-14 新增，見對應 spec）
- 說明 command：`/agent-work-team-help`（2026-07-14 新增）
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
        ├── plan-spec.md
        ├── task-summary.md     # Spec 核准當下產生的任務總表靜態快照（見下方 2026-07-15 更新）
        └── planning/
            └── checkpoint.json # Planning 軟停 checkpoint（見 2026-07-14 續接 spec）
```

> **2026-07-14 更新：** Planning 階段的軟停持久化與續接（`Pending Confirmation` 狀態、`planning/checkpoint.json`、`token` 重用防護、`/agent-work-team-resume`、`/agent-work-team-help`）獨立記錄在 `docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md`。本文件只做最小必要的欄位/結構同步，完整設計請看那份文件。

> **2026-07-15 更新：** Step 5 使用者 approve 之後，Controller 會額外用 Read 讀 `plan-spec.json` 的 `task_breakdown`、用 Write 產生 `task-summary.md`——一份只在核准當下寫一次的**靜態快照**表格（Task ID／說明／預計異動檔案），單純方便使用者在開始 Development 前快速掃過後續有哪些工作項目。這份檔案之後不會再更新；Development 開始後的即時任務狀態仍然只看 `dev/progress.json` 與 `dashboard.md`，兩者不是同一份資料、刻意不同步，避免出現兩個「進度」互相打架。

**`dashboard.md` 是自動維護的檔案，不需要另外呼叫任何 command 才看得到。** 每次任一需求的 `state.json` 被寫入時，plugin 的 hook 會在背景重新掃描所有需求、重新渲染表格、覆寫這個檔案（詳見下方「Dashboard 同步」）——不是 `/agent-work-team` 自己做，也不會顯示在對話裡。

負責這件事的檔案在 **plugin repo**（不是使用者專案）裡：

```
hooks/
├── hooks.json          # PostToolUse hook 定義
└── sync-dashboard.mjs  # 實際渲染/重建邏輯（hook 模式 + --force 強制模式）
```

**ID 產生方式：** 掃描 `.agent-work-team/requests/` 底下現有的 `RQ-NNN` 資料夾，取最大號 +1（找不到任何資料夾則從 `RQ-001` 開始）。這個算法在資料夾被刪除後可能重用同一個編號給不同需求；為了讓後續指令能偵測到這種重用，每個需求建立時還會額外產生一個隨機 `token`（見下方 `state.json` 欄位與 2026-07-14 續接 spec）。

## 狀態機（本次範圍）

```
CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING → PENDING_SPEC_APPROVAL → SPEC_APPROVED
```

**BLOCKED 不是 `current_stage` 的一個值。** 卡住時 `current_stage` 保持在卡住當下的階段不變（例如卡在 PM 分類就停在 `PM_TRIAGE`），只有 `status` 變成 `"Blocked"`、`waiting_on` 變成 `"Human"`。這樣 dashboard 才能同時顯示「卡在哪一步」與「正在卡住」兩個資訊，而不是用 `current_stage: "BLOCKED"` 蓋掉原本卡住的階段。

**Progress 對照表**（由 controller 依 `current_stage` 計算，agent 不自行回報；卡住或軟停時 `progress` 沿用當下 `current_stage` 對應的數值，不特別歸零或改變）。下表以 `commands/agent-work-team.md` 的實際實作為準（Development 階段加入後，Planning 的區間被重新分配以便跟後續階段接續，取代了本文件原本的 0/10/30/60/90/100）：

| current_stage | progress |
|---|---|
| CREATED | 0 |
| PM_TRIAGE | 10 |
| BA_CLARIFYING | 20 |
| SPEC_DRAFTING | 30 |
| PENDING_SPEC_APPROVAL | 40 |
| SPEC_APPROVED | 50 |

（`SPEC_APPROVED` 之後的 `DEVELOPING`(70)／`TESTING`(90)／`PENDING_FINAL_APPROVAL`(95)／`DEV_APPROVED`(100) 屬於 Development 階段，見 `2026-07-05-agent-work-team-development-design.md`。）

## `state.json` 欄位

```json
{
  "id": "RQ-001",
  "token": "8f3a1c9d",
  "name": "Login API",
  "type": "New Feature",
  "source": "User",
  "team": "New Feature Team",
  "priority": "High",
  "progress": 20,
  "current_stage": "BA_CLARIFYING",
  "current_agent": "BA Agent",
  "status": "Running",
  "waiting_on": null,
  "created": "2026-07-04",
  "updated": "2026-07-04"
}
```

- `token`: 建立需求時隨機產生、之後不再改變的識別碼，用來偵測 `id` 是否被重用（見 2026-07-14 續接 spec）。
- `type`: `New Feature` | `Bug Fix` | `Refactor` | `Performance` | `Security` | `Documentation` | `Research`
- `source`: `User` | `Product` | `Bug Report` | `Tech Debt` | `AI Suggestion` | `Monitoring`
- `team`: `New Feature Team` | `Maintenance Team`
- `priority`: `Critical` | `High` | `Medium` | `Low`
- `status`: `Running` | `Pending Confirmation` | `Pending Approval` | `Blocked` | `Approved`（Development/Knowledge 階段另加 `Completed`，見對應 spec）
- `waiting_on`: `null` | `"Human"`（軟停等待對話回覆，或 PM/Plan/SA/SD 卡住需要人判斷）| `"Human Review"`（等待正式關卡核准，如 spec 核准）

`Pending Confirmation` 是 2026-07-14 補上的狀態，專指 Planning 階段一段**即時對話**（BA 提問、需求摘要確認）暫停等待回覆的軟停，跟「已有成品等正式核准」的 `Pending Approval` 是兩回事。細節與 `planning/checkpoint.json` schema 見 2026-07-14 續接 spec。

## Dashboard 同步（由 hook 負責，不是 command 自己做）

一開始的設計是讓 `/agent-work-team` 自己在每次寫 `state.json` 之後，用 Glob/Read/Write 重新渲染 `dashboard.md`。測試後發現這樣行不通：模型自己執行的每一個工具呼叫都會顯示在對話裡，沒辦法真正「安靜地在背景」發生，也完全依賴模型記得要做這件事。改用 Claude Code 的 **hook** 機制：

- **`hooks/hooks.json`**：定義一個 `PostToolUse` hook，`matcher: "Write"`，`async: false`，執行 `node "${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs"`。
- **`hooks/sync-dashboard.mjs`**（Node script，兩種模式共用同一份渲染邏輯）：
  - **Hook 模式**（預設，由 hook 觸發時使用）：從 stdin 讀 hook 傳入的 JSON，取出 `tool_input.file_path`。如果這個路徑不符合 `.agent-work-team/requests/*/state.json` 這個樣式（也就是這次 Write 跟 agent-work-team 無關），直接 exit 0、不做任何事、不輸出任何東西——確保這個 hook 不會干擾使用者在同一個專案裡的其他 Write 操作。符合的話才真的執行「Glob 所有 `.agent-work-team/requests/*/state.json` → Read 每一個 → 依 `updated` 新到舊排序渲染表格（規則同下）→ Write 覆寫 `.agent-work-team/dashboard.md`」，成功後印 `{"suppressOutput": true}` 讓這次執行完全不出現在對話裡；若真正的重建動作本身失敗（例如寫入 `dashboard.md` 失敗），exit 2、把錯誤寫到 stderr。
  - **單一需求的 `state.json` 壞掉時的處理**：不會讓整個 dashboard 重建失敗——那個需求會被跳過（不列入表格），其餘需求正常顯示，hook 仍視為「成功」（exit 0）。因為 hook 的 exit 2/stderr 在一般對話裡不會被使用者看到，這種「靜默跳過」若不做任何提示，使用者會不知道某個需求消失了。所以 `dashboard.md` 本身在有需求被跳過時，會在表格上方多印一行警示（例如「⚠️ 2 個需求因 state.json 無法解析而被跳過：RQ-003, RQ-007」），把這件事變成使用者打開檔案就看得到的資訊，而不是只寫進看不到的 stderr。
  - **強制模式**（帶 `--force` 參數時）：不檢查 stdin，直接執行同一套渲染邏輯，並把渲染好的表格直接印到 stdout（若目前一個需求都沒有，則印出「目前沒有任何 agent-work-team 需求」，且不建立 `dashboard.md`）。這個模式是給 `/agent-work-team-dashboard` 備用指令用的，讓它不需要重複實作一次渲染邏輯。

表格渲染規則（兩種模式共用）：欄位順序 ID／需求名稱／類型／來源／Team／優先級／Progress／Current Stage／Current Agent／Status／Waiting／Created／Updated；`null` 值一律顯示 `-`，`name` 為 `null` 時顯示 `(未命名)`；`dashboard.md` 內容是 `# Agent Work Team Dashboard` 標題 + 這個表格。

`/agent-work-team` 的 command 本身**不再包含任何 dashboard 同步的指示**——這件事完全交給 hook，command 只要專心做 PM → BA → Plan/SA/SD 的流程。

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

正常情況下不需要執行這個指令——`.agent-work-team/dashboard.md` 已經由 hook 自動維護，直接開檔案看就好。這個指令只在你懷疑檔案過期、損毀或被手動刪除時使用：用 Bash 執行 `node "${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs" --force`（強制模式），把 script 印出來的表格直接貼在回覆裡。指令本身不需要重新實作一次渲染邏輯。

Child Dashboard（單一需求的階段 checklist）本次不實作——`/agent-work-team` 每次執行都會直接告知使用者目前卡在哪一步，且 `state.json` 與各階段 `.md` 檔已包含所需資訊。

## 驗證方式

由於這是 prompt 驅動的功能（無自動化測試套件可跑），驗證方式為：在一個測試專案 repo 裡實際執行一次完整流程：

1. 執行 `/agent-work-team "測試用需求描述"`，確認 `RQ-001` 資料夾與 `state.json` 正確產生（`current_stage: CREATED`），且**不用另外呼叫任何指令、對話裡也看不到任何 hook 執行痕跡**，`.agent-work-team/dashboard.md` 就已經悄悄同步顯示這個需求。
2. 走完 PM 分類、BA 一問一答、Plan/SA/SD 產出、approve 核准，確認每次 `state.json` 變更後 `dashboard.md` 都同步更新，且過程中都沒有任何 hook 相關的輸出出現在對話裡。
3. 在同一個測試專案裡，用 Write 建立一個跟 agent-work-team 完全無關的檔案（例如 `foo.txt`），確認這不會觸發 dashboard 重建、也不會有任何 hook 輸出——驗證 hook 的自我過濾邏輯正確。
4. 手動刪除或改壞 `dashboard.md`，執行 `/agent-work-team-dashboard`，確認它能透過 `--force` 模式重新掃描並正確重建這個檔案，同時把表格顯示在回覆裡。
5. 刻意讓 PM 或 Plan/SA/SD 卡住（例如提供無法分類的描述），確認 `BLOCKED` 狀態與提示正確運作，且 `dashboard.md` 也同步反映 Blocked 狀態。

## Out of scope

- Developer Agent、Review/Test Agent、Knowledge Agent（下一輪 sub-project）
- Validation Layer、多 Methodology（BDD/DDD/Scrum）切換
- Child Dashboard、Agent Dashboard（未來如有需要再加）
- Plugin 生態系（Spring/Angular/Docker/K8s/Oracle/Git plugin 自動載入）
- 多團隊平行派工的自動化（本次每個需求仍是單一 `/agent-work-team` 呼叫循序執行到底）
- 任何常駐後端服務、資料庫、Web UI
