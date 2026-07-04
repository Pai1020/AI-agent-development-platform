# AI Agent Development Platform

Claude Code plugin：一組 SDLC（軟體開發生命週期）開發流程自動化工具集。目前第一版聚焦於需求與規劃（Planning）階段，其他階段（測試、部署等）將於後續版本加入。

## 安裝（本機測試）

```
/plugin marketplace add <此 repo 的本機路徑或 git URL>
/plugin install ai-agent-dev-platform
```

## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `hooks/hooks.json` + `hooks/sync-dashboard.mjs` — PostToolUse hook，每次相關的 `state.json` 被寫入時在背景自動重建需求總覽，不會出現在對話裡
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
