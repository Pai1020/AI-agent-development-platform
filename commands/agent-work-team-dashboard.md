---
description: 備用指令，手動重新掃描並重建 .agent-work-team/dashboard.md（正常情況下不需要呼叫——這個檔案由 hook 自動同步）
---

你正在執行 `/agent-work-team-dashboard`。這是備用指令：正常情況下你不需要執行它，因為 `.agent-work-team/dashboard.md` 已經由 plugin 的 hook 在每次相關的 `state.json` 被寫入時自動同步。只有在你懷疑 `dashboard.md` 過期、損毀，或被手動刪除時，才需要手動執行這個指令來重建它。

## Step 1: 執行重建 script

用 Bash 執行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs" --force
```

## Step 2: 回報結果

把上面指令的 stdout 原樣顯示在你的回覆裡（可能是重建好的表格，也可能是「目前沒有任何 agent-work-team 需求」）。不要自己重新渲染或改寫內容。
