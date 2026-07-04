---
description: 顯示所有 agent-work-team 需求的總覽（Mother Dashboard），唯讀不修改任何檔案
---

你正在執行 `/agent-work-team-dashboard`。這是唯讀指令，只讀取檔案、渲染表格，絕對不要修改或建立任何檔案。

## Step 1: 收集資料

用 Glob 找出所有 `.agent-work-team/requests/*/state.json`。如果一個都沒有，回覆「目前沒有任何 agent-work-team 需求」然後結束。

否則，用 Read 讀出每一個 `state.json` 的內容。

## Step 2: 渲染表格

用以下欄位順序，輸出一個 Markdown 表格，一列一個需求，依 `updated` 欄位新到舊排序：

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

只輸出表格本身，不要額外加總結文字。
