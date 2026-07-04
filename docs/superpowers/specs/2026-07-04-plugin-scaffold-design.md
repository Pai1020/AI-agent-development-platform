# Claude Code Plugin 基礎架構 Design

## 背景與目的

`AI-agent-development-platform` repo 目前只有一個標題用的 README，尚未有任何 plugin 結構。這個專案的長期目標是做一組「開發流程自動化工具集」的 Claude Code plugin，第一版功能會聚焦在 SDLC 的需求與規劃（Planning）階段。

本次範圍**只**建立 plugin 的基礎骨架，不實作具體的 Planning 功能 — 具體功能留待下一輪 brainstorming/plan。

## 目錄結構

```
AI-agent-development-platform/
├── .claude-plugin/
│   ├── plugin.json          # plugin manifest（必要）
│   └── marketplace.json     # 本機 marketplace 定義，供 /plugin marketplace add . 測試安裝
├── skills/
│   └── example-planning/
│       └── SKILL.md         # 佔位 skill，驗證 skill 能被載入與觸發
├── agents/
│   └── example-planner.md   # 佔位 subagent
├── commands/
│   └── example-plan.md      # 佔位 slash command
├── CLAUDE.md                 # 給 Claude Code 在此 repo 工作的專案說明
├── .gitignore
└── README.md                 # 更新為 plugin 說明與安裝方式
```

不建立 `hooks/`、CI/lint script — 目前沒有明確需求，等未來需要時再加，避免建立空殼目錄。

## 各檔案內容重點

- **plugin.json**：`name: ai-agent-dev-platform`、`description`、`version: 0.1.0`、`repository` 指向此 GitHub repo（`https://github.com/Pai1020/AI-agent-development-platform`）。
- **marketplace.json**：單一 plugin entry，`source: "./"`，讓使用者可用 `/plugin marketplace add <本機路徑或 repo URL>` 後 `/plugin install ai-agent-dev-platform` 安裝測試。
- **skills/example-planning/SKILL.md**：最小 frontmatter（`name`、`description`）+ 一段說明文字，標註為佔位範例，未來會被真正的 Planning 功能取代。
- **agents/example-planner.md**：frontmatter 包含 `name`、`description`、`tools`，body 說明這是佔位 subagent。
- **commands/example-plan.md**：frontmatter 包含 `description`，body 說明這是佔位 slash command。
- **CLAUDE.md**：簡短記錄專案性質（Claude Code plugin）、目錄慣例、目前開發聚焦於 Planning 階段。
- **README.md**：說明 plugin 用途、安裝方式（`/plugin marketplace add` + `/plugin install`）、目前開發狀態。

## 驗證方式

建立完成後：
1. 確認所有檔案的 YAML frontmatter 格式正確（能被解析）。
2. 實際執行 `/plugin marketplace add` 指向本機 repo 路徑，再 `/plugin install ai-agent-dev-platform`，確認 plugin 能被安裝、且 skill/agent/command 都能被 Claude Code 列出或觸發，而不是只靠檔案格式檢查。

## Out of scope

- 具體的 Planning 階段功能（需求整理、design doc 產生等）— 留到下一輪 brainstorming。
- hooks、MCP server、CI/lint 腳本。
- 發布到公開 marketplace。
