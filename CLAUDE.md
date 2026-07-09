# AI Agent Development Platform

這是一個 Claude Code plugin 專案：`ai-agent-dev-platform`，目標是提供一組 SDLC（軟體開發生命週期）開發流程自動化工具。

## 目前狀態

- Planning 階段已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，止於 `SPEC_APPROVED`
- Development 階段已實作：`/agent-work-team-develop <RQ-ID>` 驅動 Developer → Review/Test，逐一實作並審查每個 task，全部完成後跑整體審查，止於 `DEV_APPROVED`
- Knowledge Agent 階段已實作：`/agent-work-team-knowledge <RQ-ID>` 把已核准的 Development 成果整理進使用者的 Obsidian wiki（`.agent-work-team/wiki/`，或 `CLAUDE.md` 指定的路徑），止於 `DONE`；`progress` 從 `DEV_APPROVED` 之後凍結在 100
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`（Planning）、`docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`（Development）與 `docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md`（Knowledge Agent）

## 目錄慣例

- `skills/<name>/SKILL.md` — 供 Claude Code 自動判斷是否套用的技能
- `agents/<name>.md` — 可被 Agent 工具呼叫的 subagent 定義
- `commands/<name>.md` — 使用者可用 `/<name>` 觸發的 slash command
- `.claude-plugin/plugin.json` — plugin manifest
- `.claude-plugin/marketplace.json` — 本機測試安裝用的 marketplace 定義

## 開發規範

- 新增功能前先確認是否屬於 Planning 階段範圍，跨階段功能應拆成獨立的 spec/plan。
- 佔位檔案（example-*）在對應真正功能實作完成後應被取代，而不是保留。
