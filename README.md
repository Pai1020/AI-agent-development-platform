# AI Agent Development Platform

Claude Code plugin：一組 SDLC（軟體開發生命週期）開發流程自動化工具集。目前第一版聚焦於需求與規劃（Planning）階段，其他階段（測試、部署等）將於後續版本加入。

## 安裝（本機測試）

```
/plugin marketplace add <此 repo 的本機路徑或 git URL>
/plugin install ai-agent-dev-platform
```

## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 需求總覽（Mother Dashboard），唯讀
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
