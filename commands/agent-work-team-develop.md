---
description: 啟動一個已核准需求的 Development 階段（Developer Agent + Review/Test Agent），逐一實作並審查 task
---

你正在執行 `/agent-work-team-develop <RQ-ID>` — agent-work-team pipeline 的 Development 階段入口。你（主線程）是這個階段的 Controller，負責依序驅動 Developer Agent 實作每個 task、Review/Test Agent 審查，全部完成後再跑一次整體審查。

## Step 1: 找到目標需求，判斷全新開始或恢復執行

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`。
2. 若沒有提供，用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個，挑 `current_stage` 為 `"SPEC_APPROVED"`、`"DEVELOPING"`、`"TESTING"` 或 `"PENDING_FINAL_APPROVAL"` 且 `updated` 最新的一個當作 `request_id`。若一個符合條件的都沒有，告訴使用者「目前沒有可以開始或恢復 Development 的需求」，然後停止。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`，依 `current_stage` 判斷：
   - `"SPEC_APPROVED"`：**全新開始**（`is_resume = false`）。
   - `"DEVELOPING"`、`"TESTING"` 或 `"PENDING_FINAL_APPROVAL"`：**恢復執行**（`is_resume = true`），不管 `status` 現在是 `"Blocked"` 還是其他值。
   - `"DEV_APPROVED"`：告訴使用者這個需求的 Development 階段已經完成，沒有需要恢復的，然後停止。
   - 其他值（`"CREATED"`／`"PM_TRIAGE"`／`"BA_CLARIFYING"`／`"SPEC_DRAFTING"`／`"PENDING_SPEC_APPROVAL"`）：告訴使用者這個需求還沒被核准進入 Development（目前實際的 `current_stage` 是什麼），然後停止。
4. **token 一致性檢查**：用 Read 讀取 `pm-triage.json.token`，跟剛剛讀到的 `state.json.token` 比對。若兩者不一致，代表 `{request_id}` 這個編號疑似被重用過（例如原本的需求資料夾被刪除、`RQ-ID` 分配給了新需求，殘留檔案彼此不屬於同一個需求），把這個疑慮具體告訴使用者，請他們人工確認，然後停止整個流程，不要繼續。

## Step 2: 驗證 `task_breakdown` 格式

用 Read 讀取 `.agent-work-team/requests/{request_id}/plan-spec.json`。檢查 `task_breakdown` 陣列裡每一項都是物件、且都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria` 四個欄位。若有任何一項不符合（例如是純字串，或缺欄位），告訴使用者具體是哪裡不符合、需要重新走 Plan/SA/SD 產出正確格式，然後停止，不要嘗試自動轉換或猜測補齊。這個檢查不管全新開始或恢復執行都要做。

## Step 3: 建立/沿用開發分支，依情況初始化

1. 用 Bash 取得目前分支名稱：`git branch --show-current`。
2. 用 Bash 檢查分支 `agent-work-team/{request_id}` 是否已存在：
   - 若不存在：`git checkout -b agent-work-team/{request_id}` 建立並切換過去。
   - 若已存在：**先做 token 一致性檢查再切換**——用 Read 讀取 `state.json.token` 與 `pm-triage.json.token`，若兩者不一致，代表 `{request_id}` 這個編號疑似被重用過（例如原本的需求資料夾被刪除、`RQ-ID` 分配給了新需求，但舊分支還留著），**不要**切換到這個分支，把這個疑慮具體告訴使用者，請他們人工確認這個分支是否該保留或刪除，然後停止整個流程。若一致，才用 `git checkout agent-work-team/{request_id}` 直接切換過去繼續，不要覆蓋或重建。
   （這一步不管全新開始或恢復執行都要做。）
3. 若 `is_resume` 是 `false`（全新開始）：
   - 用 Write 更新 `state.json`：`current_stage: "DEVELOPING"`，`progress: 70`，`updated` 改成今天日期（用 Bash 取得）。
   - 用 Write 建立 `.agent-work-team/requests/{request_id}/dev/progress.json`，`tasks` 陣列要包含 `plan-spec.json` 的 `task_breakdown` 裡每一個 task 的 `id`，初始 `status` 都是 `"pending"`，並記錄 `base_branch`（用 Step 3.1 取得的分支名稱）：

```json
{
  "base_branch": "{base_branch}",
  "tasks": [
    {"id": "T1", "status": "pending", "commits": [], "fix_rounds": 0, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

4. 若 `is_resume` 是 `true`（恢復執行）：**不要**更動 `state.json` 的 `current_stage`／`progress`，**不要**重建或覆寫 `dev/progress.json`。用 Read 讀取現有的 `dev/progress.json`，供 Step 4／5 判斷從哪裡繼續。

## Step 4: 依序處理每個 task

對 `task_breakdown` 裡的每一個 task，依序（不要平行）處理，**跳過 `dev/progress.json` 裡 `status` 已經是 `"done"` 的 task**（若全部 task 都已經是 `"done"`，代表這次恢復執行卡在 Step 5 的整體審查，不是卡在某個 task——不要在這裡動 `state.json` 的 `status`，直接跳過整個 Step 4，交給 Step 5 自己判斷並清除）：

1. 若這個 task 目前 `status` 是 `"blocked"`（只會發生在恢復執行時）：使用者重新執行本身就是「已經處理過問題、要重試」的訊號——用 Write 把這個 task 的 `fix_rounds`、`needs_context_rounds` 都重設為 `0`，`status` 改成 `"in_progress"`；同時若 `state.json` 目前的 `status` 是 `"Blocked"`，一併改回 `"Running"`、`waiting_on` 改回 `null`（清掉先前 Blocked 留下的痕跡，讓 dashboard 正確反映目前又在跑），繼續下面第 2 點。
2. 若這個 task 目前 `status` 是 `"pending"` 或（恢復執行時）`"in_progress"`：用 Write 更新 `dev/progress.json`，把這個 task 的 `status` 改成 `"in_progress"`（若已經是就不用重複寫）；若 `state.json` 目前的 `status` 是 `"Blocked"`（例如上次流程中斷但沒被明確判定 Blocked，是被其他機制設成 Blocked 的邊界情況），一併改回 `"Running"`、`waiting_on` 改回 `null`。
3. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-developer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）、這個 task 的完整物件、`plan-spec.json` 的 `technical_design`。
4. 若回報 `NEEDS_CONTEXT`：用 Read 讀取 `dev/progress.json` 這個 task 目前的 `needs_context_rounds` 實際數值，+1 後用 Write 寫回去。**寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步**：
   - 若這個實際數值超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同下一點設為 Blocked，把 Developer 一直缺少的資訊具體告訴使用者，**停止整個 Development 流程**。
   - 否則：補充資訊後重新 dispatch，不要更動 `dev/progress.json` 的 `status`。
5. 若回報 `BLOCKED`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"blocked"`，把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，**停止整個 Development 流程**，後面的 task 不處理。
6. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：把回報裡的 commit sha 記到 `dev/progress.json` 這個 task 的 `commits` 陣列，然後用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "{task.id}"`、這個 task 的完整物件、這個 task 目前所有 commit 的 commit range（用 `git diff {第一個 commit}^..HEAD` 取得完整差異）、Developer 的報告檔案路徑。
7. Reviewer 回報 `Approved`：用 Write 把這個 task 在 `dev/progress.json` 的 `status` 改成 `"done"`，繼續下一個 task。
8. Reviewer 回報 `Needs fixes`（有 Critical 或 Important 問題）：
   - 用 Read 讀取 `dev/progress.json` 這個 task 目前的 `fix_rounds` 實際數值，+1 後用 Write 寫回去。
   - **寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步，不可以跳過這個檢查**：
     - 若這個實際數值超過 2：把這個 task 的 `status` 改成 `"blocked"`，`state.json` 同第 5 點設為 Blocked，把還沒解決的 Critical/Important 問題列給使用者，**停止整個 Development 流程**。
     - 否則：重新 dispatch `agent-work-team-developer`（同一個 task），prompt 裡附上 Reviewer 這輪的具體問題清單，修完後回到第 6 點重新走一次 review。

## Step 5: 全部 task 完成後的整體審查

1. 確認 `dev/progress.json` 裡每個 task 的 `status` 都是 `"done"`。
2. 若 `state.json` 目前的 `current_stage` 已經是 `"PENDING_FINAL_APPROVAL"`（恢復執行、且最終審查先前已通過只是還沒收到人類回覆）：跳過這個 Step，直接進 Step 6 等待使用者回覆。
3. 若 `state.json` 目前的 `current_stage` 是 `"TESTING"` 且 `status` 是 `"Blocked"`（恢復執行、卡在最終審查階段）：用 Write 把 `dev/progress.json` 的 `final_review_fix_rounds` 重設為 `0`，`state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，繼續下面第 5 點重新 dispatch。
4. 否則（全新走到這裡）：用 Write 更新 `state.json`：`current_stage: "TESTING"`，`progress: 90`，`updated` 改成今天日期。
5. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-reviewer"`，`model: sonnet`），在 prompt 裡提供 `request_id`、`output_dir`、`scope: "final"`、整個 `plan-spec.json`、完整 commit range——用 `git diff {dev/progress.json 裡第一個 task 的第一個 commit}^..HEAD` 取得從 Development 階段開始到現在的完整差異，涵蓋所有 task 的 commit。
6. Reviewer 回報 `Needs fixes`：用 Read 讀取 `dev/progress.json` 目前的 `final_review_fix_rounds` 實際數值，+1 後用 Write 寫回去。**寫回去之後，用 Read 重新讀一次剛剛寫入的檔案，依讀到的實際數值（不要憑對話中的記憶判斷）決定下一步**：
   - 若這個實際數值超過 2：把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on: "Human"`，把問題列給使用者，停止流程。
   - 否則：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`（讓 dashboard 正確反映目前又在修改程式碼），把問題依內容對應到相關的 task，回到 Step 4 對應的 task 重新處理（把該 task 的 `status` 改回 `"in_progress"`），修完後回到本步驟第 5 點重新走一次整體審查。
7. Reviewer 回報 `Approved`：用 Write 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`，`progress: 95`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。

## Step 6: Human Approval Gate

1. 明確告訴使用者：「最終審查已產出於 `.agent-work-team/requests/{request_id}/dev/final-review.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。一定要請使用者去看實際檔案，不要只在對話裡貼摘要。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "DEV_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。用 Read 讀取 `dev/progress.json` 的 `base_branch`，告訴使用者這個需求的 Development 階段已完成，變更都在 `agent-work-team/{request_id}` 分支上，原本的分支是 `{base_branch}`，要不要 merge、何時 merge 由使用者自己決定，這裡不會自動執行任何 merge，後續請執行 `/agent-work-team-knowledge <request_id>` 將需求推進至 DONE（整理知識進 wiki）。流程到此結束。
3. 使用者提出修改意見：用 Write 把 `state.json` 更新回 `current_stage: "DEVELOPING"`，`progress: 70`，把意見整理成清楚的修正需求，回到 Step 4 對應的 task（把該 task 的 `status` 改回 `"in_progress"`，或視需要重新走一次整體 review），修完後重新走一次 Step 5。
