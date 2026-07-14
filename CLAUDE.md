# AI Agent Development Platform

這是一個 Claude Code plugin 專案：`ai-agent-dev-platform`，目標是提供一組 SDLC（軟體開發生命週期）開發流程自動化工具。

## 目前狀態

- Planning 階段已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，止於 `SPEC_APPROVED`；只用來開全新需求，不會接續既有需求
- Spec 核准當下會多產生一份 `.agent-work-team/requests/RQ-ID/task-summary.md`——`task_breakdown` 的靜態快照表格（Task ID／說明／預計異動檔案），方便開始 Development 前快速掃過後續有哪些工作項目；這份檔案之後不會再更新，跟 Development 階段的即時進度（`dev/progress.json`／`dashboard.md`）是兩回事
- Planning 軟停已可持久化並跨 session 續接：BA 提問、需求摘要確認、Spec 核准關卡都會即時寫進 `.agent-work-team/requests/RQ-ID/planning/checkpoint.json`，`state.json.status` 多一個 `Pending Confirmation`（跟 `Blocked`／`Pending Approval` 區分），`/agent-work-team-resume [RQ-ID]` 可以在任何全新 session 列出所有在途/待確認/卡住的需求、顯示各自停住原因，並接回中斷的 Planning 對話（Dev/Knowledge 需求則導向對應指令）
- 每個需求建立時會產生一個隨機 `token`（見 `state.json.token`），寫入 `pm-triage.json`／`planning/checkpoint.json`，用來偵測 `RQ-ID` 是否被重用（例如舊資料夾被刪除後編號被分配給新需求）；`/agent-work-team-resume`、`/agent-work-team-develop`、`/agent-work-team-knowledge` 動用既有檔案/分支前都會比對 token，不一致就停止並警告
- `/agent-work-team-help` 列出所有指令與 `current_stage`/`status` 圖例
- Development 階段已實作：`/agent-work-team-develop <RQ-ID>` 驅動 Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED`；重跑同一指令即可從磁碟自動續接（含 `Blocked` 重試）
- Knowledge Agent 階段已實作：`/agent-work-team-knowledge <RQ-ID>` 把已核准的 Development 成果整理進使用者的 Obsidian wiki（`.agent-work-team/wiki/`，或 `CLAUDE.md` 指定的路徑），止於 `DONE`；`progress` 從 `DEV_APPROVED` 之後凍結在 100；同樣可重跑自動續接
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`（Planning）、`docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`（Development）、`docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md`（Knowledge Agent）與 `docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md`（Planning 軟停持久化 + Resume/Help + Token 重用防護）

## 目錄慣例

- `skills/<name>/SKILL.md` — 供 Claude Code 自動判斷是否套用的技能
- `agents/<name>.md` — 可被 Agent 工具呼叫的 subagent 定義
- `commands/<name>.md` — 使用者可用 `/<name>` 觸發的 slash command
- `.claude-plugin/plugin.json` — plugin manifest
- `.claude-plugin/marketplace.json` — 本機測試安裝用的 marketplace 定義

## 開發規範

- 新增功能前先確認是否屬於 Planning 階段範圍，跨階段功能應拆成獨立的 spec/plan。
- 佔位檔案（example-*）在對應真正功能實作完成後應被取代，而不是保留。
- 對這個專案進行任何調整或開發，都要另外開一條分支處理，不要直接在 `main` 上修改；開發人員確認過（review／測試通過）才能 merge 回 `main`。
