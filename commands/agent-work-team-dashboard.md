---
description: 備用指令，手動重新掃描並重建 .agent-work-team/dashboard.md（正常情況下不需要呼叫——/agent-work-team 每次狀態更新都會自動同步這個檔案）
---

你正在執行 `/agent-work-team-dashboard`。這是備用指令：正常情況下你不需要執行它，因為 `.agent-work-team/dashboard.md` 已經由 `/agent-work-team` 在每次更新任一需求狀態時自動同步。只有在你懷疑 `dashboard.md` 過期、損毀，或被手動刪除時，才需要手動執行這個指令來重建它。

## Step 1: 收集資料

用 Glob 找出所有 `.agent-work-team/requests/*/state.json`。如果一個都沒有，回覆「目前沒有任何 agent-work-team 需求」，不要建立 `dashboard.md`，然後結束。

否則，用 Read 讀出每一個 `state.json` 的內容。

## Step 2: 渲染表格

用以下欄位順序，渲染成一個 Markdown 表格，一列一個需求，依 `updated` 欄位新到舊排序：

| ID | 需求名稱 | 類型 | 來源 | Team | 優先級 | Progress | Current Stage | Current Agent | Status | Waiting | Created | Updated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

對應欄位：
- ID ← `id`
- 需求名稱 ← `name`（若為 `null`，顯示 `(未命名)`）
- 類型 ← `type`（若為 `null`，顯示 `-`）
- 來源 ← `source`（若為 `null`，顯示 `-`）
- Team ← `team`（若為 `null`，顯示 `-`）
- 優先級 ← `priority`（若為 `null`，顯示 `-`）
- Progress ← `progress` 後面加 `%`
- Current Stage ← `current_stage`
- Current Agent ← `current_agent`（若為 `null`，顯示 `-`）
- Status ← `status`
- Waiting ← `waiting_on`（若為 `null`，顯示 `-`）
- Created ← `created`
- Updated ← `updated`

## Step 3: 覆寫 dashboard 檔案

用 Write 覆寫 `.agent-work-team/dashboard.md`：內容是 `# Agent Work Team Dashboard` 標題，接著 Step 2 渲染出來的表格。

## Step 4: 回報結果

把 Step 2 渲染的表格直接顯示在你的回覆裡，讓使用者不用另外開檔案就能立即確認重建結果。
