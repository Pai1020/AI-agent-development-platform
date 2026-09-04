---
title: 專案目前狀態
document_type: project-status
updated: 2026-09-04
note: 本檔是「各階段實作到哪」的單一真實來源，由 AGENTS.md 指定為必讀。只記狀態與指向，設計細節留在 docs/superpowers/specs/。新增功能請加一列，不要加一段。
---

# 專案目前狀態

`ai-agent-dev-platform` 是一個 Claude Code plugin，提供一組 SDLC 開發流程自動化工具。以下為各階段的實作現況。

## 階段實作狀態

| 階段 | 入口指令 | 實作到哪 | 設計文件 |
|---|---|---|---|
| Planning | `/agent-work-team` | PM → BA → Plan/SA/SD，止於 `SPEC_APPROVED`。只用來開全新需求，不接續既有需求 | `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md` |
| Development | `/agent-work-team-develop <RQ-ID>` | Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED` | `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md` |
| Knowledge | `/agent-work-team-knowledge <RQ-ID>` | 把已核准的 Development 成果整理進 Obsidian wiki，止於 `DONE` | `docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md` |
| 續接／查詢 | `/agent-work-team-resume [RQ-ID]`、`/agent-work-team-help`、`/agent-work-team-dashboard` | Resume 列出所有在途／待確認／卡住的需求並接回 Planning 對話；Help 列出所有指令與圖例；Dashboard 是備用的手動重建指令 | `docs/superpowers/specs/2026-07-14-agent-work-team-planning-resume-design.md` |

Development 與 Knowledge 階段重跑同一指令即可從磁碟自動續接（含 `Blocked` 重試）。`progress` 在 `DEV_APPROVED` 之後凍結在 100。

## 各階段行為重點

| 主題 | 現況 |
|---|---|
| Spec 核准產出 | 核准當下會多產一份 `.agent-work-team/requests/RQ-ID/task-summary.md`——`task_breakdown` 的靜態快照（Task ID／說明／預計異動檔案）。之後不再更新，與 Development 的即時進度（`dev/progress.json`／`dashboard.md`）是兩回事 |
| Planning 軟停持久化 | BA 提問、需求摘要確認、Spec 核准關卡都會即時寫進 `planning/checkpoint.json`；`state.json.status` 有 `Pending Confirmation`（與 `Blocked`／`Pending Approval` 區分），可跨 session 續接 |
| Token 重用防護 | 每個需求建立時產生隨機 `token`（`state.json.token`），寫入 `pm-triage.json`／`planning/checkpoint.json`。Resume／Develop／Knowledge 動用既有檔案或分支前都會比對，不一致就停止並警告 |
| Commit 粒度 | Spec 核准關卡會詢問 `squash`（分支最終只留一個 commit）或 `per_task`（預設），結果寫入 `planning/dev-config.json` 的 `commit_mode`。`squash` 只在最終人工核准當下由 Controller 一次性執行；沒有這個檔案的既有需求會被要求補選 |
| Dashboard | `.agent-work-team/dashboard.md` 由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景自動同步，不由 command 產生，也不出現在對話裡 |
| 反覆失敗攔截 | `hooks/enforce-block.mjs`（`PostToolUse`／matcher `Write`）在每次寫入 `dev/progress.json` 時檢查 `tasks[].fix_rounds`／`tasks[].needs_context_rounds`／`final_review_fix_rounds`，任何一項超過 2 就將 `state.json` 改為 `status: Blocked`／`waiting_on: Human`、重建 dashboard，並回傳 `additionalContext` 要求停止 dispatch 並回報使用者 |
| 資料位置 | 狀態與各階段產出寫在使用者專案的 `.agent-work-team/requests/` 底下（規則見 `AGENTS.md`）。此路徑目前仍寫死在各 command／hook 中；`data_root` 可設定化只有設計、尚未實作 |

## Spec 狀態

**已核准且已實作**

| Spec | 主題 |
|---|---|
| `2026-07-04-agent-work-team-planning-design.md` | Planning |
| `2026-07-05-agent-work-team-development-design.md` | Development |
| `2026-07-07-agent-work-team-knowledge-design.md` | Knowledge Agent |
| `2026-07-14-agent-work-team-planning-resume-design.md` | Planning 軟停持久化 + Resume/Help + Token 重用防護 |
| `2026-08-07-agent-work-team-develop-commit-mode-design.md` | Commit 粒度 |

**Draft、尚未核准也尚未實作**——不代表現況，不得當作已存在的行為引用：

| Spec | 主題 |
|---|---|
| `2026-07-30-agent-work-team-data-root-config-design.md` | 資料根目錄可設定化（`data_root`） |
| `2026-08-20-agent-work-team-change-request-phase1-design.md` | 開發中需求變更 Phase 1（`DET-Q9`） |
| `2026-08-20-agent-work-team-change-request-phase2-additive-design.md` | 開發中需求變更 Phase 2（`DET-Q9`） |
