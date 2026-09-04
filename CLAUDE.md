# AI Agent Development Platform

共用開發規範與專案現況見以下兩份匯入文件，兩份都是本 repo 工作時的必讀內容：

@AGENTS.md
@docs/project-status.md

以下僅補充 Claude Code 專屬事項；**規範與現況一律不在此重複**，需要修改請改上述兩份來源。

## 本機安裝與驗證

```
/plugin marketplace add <此 repo 的本機路徑或 git URL>
/plugin install ai-agent-dev-platform
```

安裝後，請在一個可拋棄的消費端 repo 中演練受影響的 slash command（理由見 `AGENTS.md` 的不變約束 2）。

## Claude Code 專屬機制

- `skills/<name>/SKILL.md` 由 Claude Code 依情境自動判斷是否套用；`agents/`、`commands/` 分別對應 Agent 工具與 `/` 指令。
- `.claude-plugin/plugin.json` 是 plugin manifest，`.claude-plugin/marketplace.json` 供本機測試安裝使用。
- `hooks/hooks.json` 註冊的 hook 由 Claude Code 在 `PostToolUse` 等時機執行。
