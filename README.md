# AI Agent Development Platform

Claude Code plugin `ai-agent-dev-platform`：一組 SDLC（軟體開發生命週期）流程自動化工具，用一支「AI 開發團隊」把一個需求從發想帶到收斂——PM 分類、BA 釐清、技術規劃、開發、審查、到把知識沉澱進 wiki，每個階段之間都有人類把關。

所有需求狀態與各階段產出，都以檔案形式存在**你自己專案**的 `.agent-work-team/` 底下；這個 plugin repo 本身不存放任何需求資料。

## 安裝（本機測試）

```
/plugin marketplace add <此 repo 的本機路徑或 git URL>
/plugin install ai-agent-dev-platform
```

## 需求生命週期

一個需求依序流經三個階段，每個階段結尾都停在一個人工核准關卡：

```
Planning     CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING
             → PENDING_SPEC_APPROVAL → SPEC_APPROVED
Development  → DEVELOPING → TESTING → PENDING_FINAL_APPROVAL → DEV_APPROVED
Knowledge    → PENDING_KNOWLEDGE_APPROVAL → DONE
```

- **Planning**（`/agent-work-team`）：PM 分類 → BA 逐題釐清需求與驗收標準 → Plan/SA/SD 產出技術規格與任務拆解，止於人工核准 spec（`SPEC_APPROVED`）。核准當下會多產一份 `task-summary.md` 任務快照，方便進 Development 前掃過有哪些工作。
- **Development**（`/agent-work-team-develop`）：在專屬分支 `agent-work-team/<RQ-ID>` 上，Developer 逐一實作每個 task、Reviewer 逐一審查，全部通過後再跑一次整體審查，止於人工核准（`DEV_APPROVED`）。是否 merge 回原分支由你自己決定，流程不會自動 merge。
- **Knowledge**（`/agent-work-team-knowledge`）：把已核准的開發成果整理進 Obsidian wiki（`.agent-work-team/wiki/`，或 `CLAUDE.md` 指定路徑），優先更新既有筆記、避免重複知識，止於人工核准（`DONE`）。

## 指令一覽

| 指令 | 功能 |
|---|---|
| `/agent-work-team "<需求描述>"` | 開一個**全新需求**，驅動 Planning 流程，止於 `SPEC_APPROVED`。只用來開新需求，不接續既有需求。 |
| `/agent-work-team-develop <RQ-ID>` | 對已核准需求啟動 **Development** 階段。重跑同一指令即可從磁碟自動續接（含 `Blocked` 重試）。 |
| `/agent-work-team-knowledge <RQ-ID>` | 啟動 **Knowledge** 階段，把成果整理進 wiki，止於 `DONE`。同樣可重跑自動續接。 |
| `/agent-work-team-resume [RQ-ID]` | **續接入口**。列出所有在途／待確認／卡住的需求、各自停在哪、為什麼停，並把 Planning 軟停接回去；Dev/Knowledge 需求會導向對應指令。 |
| `/agent-work-team-help` | 列出所有指令與 `current_stage`／`status` 圖例。 |
| `/agent-work-team-dashboard` | 備用指令，手動重建需求總覽 `dashboard.md`（正常不需要，這個檔案由 hook 自動同步）。 |

## 狀態與續接

- 每個需求的單一真相來源是 `.agent-work-team/requests/RQ-NNN/state.json`。`status` 區分四種停法：`Running`、`Pending Confirmation`（Planning 軟停，例如 BA 提問中）、`Pending Approval`（已有成品待核准）、`Blocked`（Agent 卡住待人介入）。
- **Planning 軟停可持久化並跨 session 續接**：BA 提問、需求摘要確認、Spec 核准關卡都會即時寫進 `planning/checkpoint.json`，因此就算換一個全新 session，`/agent-work-team-resume` 也能重建「停在哪、為什麼停」並接回中斷的對話。
- **Development／Knowledge 靠重跑同一指令續接**，各自用 `dev/progress.json` 等 checkpoint 記錄進度。
- **重試上限保護**：`hooks/enforce-block.mjs` 監看 `dev/progress.json`，任何 task 的 `fix_rounds`／`needs_context_rounds`／`final_review_fix_rounds` 超過 2 時，自動把 `state.json` 設為 `Blocked` 並提示停止，避免無限重試。
- **Token 重用防護**：每個需求建立時產生一個隨機 `token`，寫入各階段的檔案；`resume`／`develop`／`knowledge` 動用既有檔案或分支前都會比對 token，不一致就停止並警告（例如舊資料夾被刪除後編號被分配給新需求）。

## 需求總覽（Dashboard）

`.agent-work-team/dashboard.md` 是彙整所有需求的總覽表格，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在每次相關 `state.json` 被寫入時於背景自動同步——直接開來看即可，不會出現在對話裡，也不需要呼叫任何指令。

## 專案內容

**指令（`commands/`）**：`agent-work-team`、`agent-work-team-develop`、`agent-work-team-knowledge`、`agent-work-team-resume`、`agent-work-team-help`、`agent-work-team-dashboard`。

**Subagent（`agents/`，由指令呼叫，不應由使用者直接呼叫）**：
- `agent-work-team-pm` — PM Agent，需求分類
- `agent-work-team-plan-sd` — Plan/SA/SD Agent，產出技術規格與任務拆解
- `agent-work-team-developer` — Developer Agent，依單一 task 實作程式碼
- `agent-work-team-reviewer` — Review/Test Agent，審查單一 task 或整個需求
- `agent-work-team-knowledge` — Knowledge Agent，把成果整理進 wiki

**Hooks（`hooks/`）**：`sync-dashboard.mjs`（總覽同步）、`enforce-block.mjs`（重試上限保護）、`hooks.json`（PostToolUse 綁定），皆附對應 `*.test.mjs`。

**其他**：`skills/example-planning` 為驗證 plugin 骨架載入的佔位 skill，待後續實際功能取代。

## 設計文件

各階段完整設計見 `docs/superpowers/specs/`，實作計畫見 `docs/superpowers/plans/`：

- Planning：`specs/2026-07-04-agent-work-team-planning-design.md`
- Development：`specs/2026-07-05-agent-work-team-development-design.md`
- Knowledge Agent：`specs/2026-07-07-agent-work-team-knowledge-design.md`
- Planning 軟停持久化 + Resume/Help + Token 防護：`specs/2026-07-14-agent-work-team-planning-resume-design.md`

整體平台願景見 `AI_Development_Platform_MVP_v4.md`。

## 開發規範

對這個專案做任何調整都要另開分支處理，不要直接在 `main` 上修改；經 review／測試通過才 merge 回 `main`（見 `CLAUDE.md`）。
