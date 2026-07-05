---
description: 啟動一個已核准需求的 Development 階段（Developer Agent + Review/Test Agent），逐一實作並審查 task
---

你正在執行 `/agent-work-team-develop <RQ-ID>` — agent-work-team pipeline 的 Development 階段入口。你（主線程）是這個階段的 Controller，負責依序驅動 Developer Agent 實作每個 task、Review/Test Agent 審查，全部完成後再跑一次整體審查。

## Step 1: 找到目標需求

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"SPEC_APPROVED"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有處於 SPEC_APPROVED 狀態的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`。若 `current_stage` 不是 `"SPEC_APPROVED"`，告訴使用者目前實際的 `current_stage` 是什麼，然後停止，不要繼續。

## Step 2: 驗證 `task_breakdown` 格式

用 Read 讀取 `.agent-work-team/requests/{request_id}/plan-spec.json`。檢查 `task_breakdown` 陣列裡每一項都是物件、且都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria` 四個欄位。若有任何一項不符合（例如是純字串，或缺欄位），告訴使用者具體是哪裡不符合、需要重新走 Plan/SA/SD 產出正確格式，然後停止，不要嘗試自動轉換或猜測補齊。

## Step 3: 初始化 Development 狀態

1. 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
2. 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`，`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`：

```json
{
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

## Step 4: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）做以下事情：

1. 用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-developer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）、這個 task 的完整物件、`plan-spec.json` 的 `technical_design`。
3. 若回報 `NEEDS_CONTEXT`：補充資訊後重新 dispatch，不要更動 `dev/progress.json` 的 `status`。
4. 若回報 `BLOCKED`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"blocked"`，把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，**停止整個 Development 流程**，後面的 task 不處理。
5. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：把回報裡的 commit sha 記到 `dev/progress.json` 這個 task 的 `commits` 陣列，然後用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "{task.id}"`、這個 task 的完整物件、這個 task 目前所有 commit 的 commit range（用 `git diff {第一個 commit}^..HEAD` 取得完整差異）、Developer 的報告檔案路徑。
6. Reviewer 回報 `Approved`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"done"`，繼續下一個 task。
7. Reviewer 回報 `Needs fixes`（有 Critical 或 Important 問題）：
   - 把 `dev/progress.json` 這個 task 的 `fix_rounds` +1。
   - 若 `fix_rounds` 超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 4 點設為 Blocked，把還沒解決的 Critical/Important 問題列給使用者，**停止整個 Development 流程**。
   - 否則：重新 dispatch `agent-work-team-developer`（同一個 task），prompt 裡附上 Reviewer 這輪的具體問題清單，修完後回到第 5 點重新走一次 review。

## Step 5: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、從 Development 開始到現在的完整 commit range（涵蓋所有 task 的 commit）。
3. Reviewer 回報 `Needs fixes`：把 `dev/progress.json` 的 `final_review_fix_rounds` +1。
   - 若超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：把問題依內容對應到相關的 task，回到 Step 4 對應的 task 重新處理，修完後回到本步驟第 1 點重新走一次整體審查。
4. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 6: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。告訴使用者這個需求的 Development 階段已完成，Knowledge Agent 是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：把意見整理成清楚的修正需求，回到 Step 4 對應的 task（或視需要重新走一次整體 review），修完後重新走一次 Step 5。
