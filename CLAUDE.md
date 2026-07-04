# AI Agent Development Platform

這是一個 Claude Code plugin 專案：`ai-agent-dev-platform`，目標是提供一組 SDLC（軟體開發生命週期）開發流程自動化工具。

## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程，`/agent-work-team-dashboard` 顯示需求總覽
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本

## 目錄慣例

- `skills/<name>/SKILL.md` — 供 Claude Code 自動判斷是否套用的技能
- `agents/<name>.md` — 可被 Agent 工具呼叫的 subagent 定義
- `commands/<name>.md` — 使用者可用 `/<name>` 觸發的 slash command
- `.claude-plugin/plugin.json` — plugin manifest
- `.claude-plugin/marketplace.json` — 本機測試安裝用的 marketplace 定義

## 開發規範

- 新增功能前先確認是否屬於 Planning 階段範圍，跨階段功能應拆成獨立的 spec/plan。
- 佔位檔案（example-*）在對應真正功能實作完成後應被取代，而不是保留。
