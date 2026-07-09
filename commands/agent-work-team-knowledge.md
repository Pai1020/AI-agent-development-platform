---
description: 啟動一個已核准 Development 成果的 Knowledge Agent 階段，把知識整理進使用者的 Obsidian wiki
---

你正在執行 `/agent-work-team-knowledge <RQ-ID>` — agent-work-team pipeline 的 Knowledge Agent 階段入口，把需求生命週期從 `DEV_APPROVED` 推進到 `DONE`。你（主線程）是這個階段的 Controller，負責判斷全新開始或恢復執行、dispatch Knowledge Agent subagent、把關 Human Approval Gate。沒有逐 task 迴圈、沒有自動 Reviewer、沒有 `fix_rounds` 這類重試計數器——每一輪都已經由人類把關。

## Step 1: 找到目標需求，判斷全新開始或恢復執行

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"DEV_APPROVED"` 或 `"PENDING_KNOWLEDGE_APPROVAL"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有可以開始或恢復 Knowledge 整理的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`，依 `current_stage` 判斷：
   - `"DEV_APPROVED"`：**全新開始**（`is_resume = false`）。不管 `status` 現在是不是 `"Blocked"`——若是，代表上次 dispatch 失敗過，這次重新執行就是要重試：用 Write 把 `status` 清回 `"Running"`、`waiting_on` 清回 `null`。
   - `"PENDING_KNOWLEDGE_APPROVAL"`：**恢復執行**（`is_resume = true`）——不重新 dispatch，直接跳到 Step 3 的 Human Approval Gate。
   - `"DONE"`：告訴使用者這個需求已經完成，沒有需要恢復的，然後停止。
   - 其他值（還在 Planning／Development 階段）：告訴使用者這個需求還沒開發完成（目前實際的 `current_stage` 是什麼），然後停止。

## Step 2: 全新開始——dispatch Knowledge Agent

只在 `is_resume` 是 `false` 時執行這個 Step；若 `is_resume` 是 `true`，跳過這個 Step，直接進 Step 3。

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-knowledge"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）。
2. 回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_KNOWLEDGE_APPROVAL"`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期（用 Bash 取得）。`progress` 維持 `100` 不變。繼續 Step 3。
3. 回報 `NEEDS_CONTEXT` 或 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`（`current_stage` 維持 `"DEV_APPROVED"` 不變，`progress` 維持 `100` 不變），把具體原因告訴使用者，**停止整個流程**。使用者釐清問題後重新執行本指令即可重試（回到 Step 1 第 3 點的「全新開始」分支，清掉 Blocked 痕跡）。

## Step 3: Human Approval Gate

1. 明確告訴使用者：「Knowledge 已整理，請開啟 `.agent-work-team/requests/{request_id}/knowledge/knowledge-report.md` 確認新增/更新的筆記，也可以直接打開 wiki 裡對應的筆記檔案確認，回覆 approve 或提出修改意見」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DONE"`，`status: "Completed"`，`waiting_on: null`，`updated` 改成今天日期。`progress` 維持 `100` 不變。告訴使用者這個需求的生命週期已經完成。流程到此結束。
3. 使用者提出修改意見：把意見交給 `agent-work-team-knowledge`（`subagent_type: "agent-work-team-knowledge"`，`model: sonnet`）重新處理——在 prompt 裡提供 `request_id`、`output_dir`、使用者這次的具體修改意見（同一個 request，不重建任何已存在的檔案或分支）。修完回到本 Step 第 1 點重新走一次審核。
