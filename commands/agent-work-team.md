---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。這個指令**只用來開一個全新需求**；若要接續一個已經在途（尚未到 `SPEC_APPROVED`）的需求，請改用 `/agent-work-team-resume`。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

`.agent-work-team/dashboard.md` 會由 plugin 的 hook 自動同步，你不需要做任何事去維護它。

**寫入順序不變式：** 任何時候要把 `planning/checkpoint.json` 與 `state.json` 一起更新（軟停、核准關卡），一律**先寫 checkpoint，再寫 state.json**。這樣即使兩次寫入之間 session 中斷，磁碟上的 checkpoint 一定不會比 state 舊，`/agent-work-team-resume` 才能安全地以它重建「停在哪、為什麼停」。

## Step 1: 建立新需求

1. 用 Bash 算出下一個 request id：

```bash
next=$(ls -d .agent-work-team/requests/RQ-* 2>/dev/null | sed 's#.*/RQ-##' | sort -n | tail -1)
next=${next:-0}
printf "RQ-%03d\n" $((10#$next + 1))
```

把輸出結果當作這次的 `request_id`（例如 `RQ-001`）。

2. 用 Bash 產生這個需求專屬的隨機識別碼 `token`（之後用來偵測 `request_id` 是否被重用——例如舊資料夾被刪除後同一個編號被分配給另一個需求）：

```bash
openssl rand -hex 4 2>/dev/null || printf '%04x%04x' $RANDOM $RANDOM
```

把輸出結果當作這次的 `token`（例如 `8f3a1c9d`）。`token` 是這個需求從建立到結束都不會改變的身分識別，之後每個階段寫自己的產出檔案時都要原樣帶著它。

3. 用 Bash 建立資料夾：`mkdir -p .agent-work-team/requests/{request_id}`
4. 用 Bash 取得今天日期：`date +%Y-%m-%d`，結果當作 `{today}`。
5. 用 Write 建立 `.agent-work-team/requests/{request_id}/state.json`：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "name": null,
  "type": null,
  "source": null,
  "team": null,
  "priority": null,
  "progress": 0,
  "current_stage": "CREATED",
  "current_agent": null,
  "status": "Running",
  "waiting_on": null,
  "created": "{today}",
  "updated": "{today}"
}
```

## Step 2: PM Agent 分類

1. 用 Write 更新 `state.json`：`current_stage: "PM_TRIAGE"`，`current_agent: "PM Agent"`，`progress: 10`，`updated` 改成今天日期（用 Bash 重新取得）。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-pm"`，`model: haiku`），在 prompt 裡提供：
   - `request_id`: `{request_id}`
   - `token`: `{token}`
   - `output_dir`: `.agent-work-team/requests/{request_id}`
   - `raw_description`: `$ARGUMENTS` 的原文
3. 若回報 `BLOCKED`：先用 Write 建立 `planning/checkpoint.json`（這個檔案在這個分支還不存在，Step 3 才會正常建立）記下卡住原因，讓之後 `/agent-work-team-resume` 能顯示「為什麼卡在這裡」：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "sub_step": "PM_TRIAGE",
  "pending": null,
  "clarification_log": [],
  "reason": "<PM 回報的具體卡住原因>",
  "updated": "{today}"
}
```

再用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把 PM 回報的具體原因告訴使用者，然後停止，不要繼續往下走。
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 20`，`updated` 改成今天日期。

## Step 3: BA 階段（你自己直接跟使用者對話，不要 dispatch subagent）

這個階段的每一組問答與每一次暫停，都要**即時**寫進 `.agent-work-team/requests/{request_id}/planning/checkpoint.json`，不要等到整段澄清結束才落地——這是讓這個階段能在 session 中斷後被 `/agent-work-team-resume` 接回去的關鍵。

1. 進入這個 Step 時，先用 Write 建立 `planning/checkpoint.json`：

```json
{
  "id": "{request_id}",
  "token": "{token}",
  "sub_step": "BA_CLARIFYING",
  "pending": null,
  "clarification_log": [],
  "reason": null,
  "updated": "{today}"
}
```

2. 一次問一個問題，釐清需求範圍、限制、成功標準，直到你能寫出完整的 Acceptance Criteria 清單。優先用 AskUserQuestion 工具讓使用者用選的，開放式問題才用純文字問。**在每次提問（第一題除外）之前**：先把上一組問答 `{"question": "...", "answer": "..."}` append 進 checkpoint 的 `clarification_log`；然後把 checkpoint 的 `pending` 設成這次要問的問題（`{"kind": "question", "prompt": "<問題原文>", "options": ["<選項>", ...]}`，純文字問題就把 `options` 設成 `[]`），`reason` 設成一行給人看的摘要（例如「BA 釐清中，等待回答：<問題摘要>」），`updated` 改成今天日期，用 Write 寫回 checkpoint；**接著**用 Write 更新 `state.json`：`status: "Pending Confirmation"`，`waiting_on: "Human"`（`current_stage`／`progress`／`current_agent` 維持不變，凍結在 `BA_CLARIFYING`/20/`BA Agent`）。做完這兩次 Write 才實際發問。
3. 使用者回答後，用 Write 把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，再進行下一輪（回到本步驟第 2 點，或視情況進第 4 點）。
4. 當你認為需求已經清楚：先把最後一組問答 append 進 checkpoint 的 `clarification_log`，把 `pending` 設成 `{"kind": "summary_confirmation", "prompt": "<完整需求摘要 + Acceptance Criteria 清單全文>", "options": []}`，`reason` 設成「需求摘要待確認」，用 Write 寫回 checkpoint；接著用 Write 更新 `state.json`：`status: "Pending Confirmation"`，`waiting_on: "Human"`。做完才把完整的「需求摘要」與「Acceptance Criteria 清單」念給使用者確認一次。
5. 使用者明確回覆確認（例如「確認」「approved」「可以」）才算通過；如果使用者提出修改，用 Write 把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，回到本步驟第 2 點繼續問，不要自己假設已經通過。
6. 通過後，用 Bash 取得今天日期，再用 Write 建立 `.agent-work-team/requests/{request_id}/ba-requirement.json`（`clarification_log` 直接取用 checkpoint 目前累積的完整陣列，不要重打）：

```json
{
  "id": "{request_id}",
  "requirement_summary": "<你整理的需求摘要>",
  "acceptance_criteria": [
    "<第一條 AC>",
    "<第二條 AC>"
  ],
  "clarification_log": [
    {"question": "<你問的問題>", "answer": "<使用者的回答>"}
  ],
  "approved_at": "{today}"
}
```

7. 用 Write 建立對應的 `.agent-work-team/requests/{request_id}/ba-requirement.md`（`# BA Requirement — {request_id}`，接著用 `##` 標題呈現需求摘要、Acceptance Criteria 清單、問答紀錄，內容跟 json 一致）。
8. 用 Write 更新 checkpoint：`pending: null`，`sub_step: "SPEC_DRAFTING"`，`reason: null`，`updated` 改成今天日期（保留這個檔案作為稽核紀錄，不要刪除）。
9. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 30`，`status: "Running"`，`waiting_on: null`，`updated` 改成今天日期。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`。
3. 若回報 `BLOCKED`：先用 Write 更新 checkpoint（此時已存在，Step 3 結尾建立過）：`sub_step: "SPEC_DRAFTING"`，`pending: null`，`reason: "<Plan/SA/SD 回報的具體卡住原因>"`，`updated` 改成今天日期；再用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：先用 Write 更新 checkpoint：`sub_step: "PENDING_SPEC_APPROVAL"`，`pending: {"kind": "spec_approval", "prompt": "Spec 已產出，待核准", "artifact": ".agent-work-team/requests/{request_id}/plan-spec.md"}`，`reason: "Spec 待人工核准"`，`updated` 改成今天日期；再用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 40`，`updated` 改成今天日期。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：
   1. 先用 Write 更新 checkpoint：`pending: null`，`sub_step: "SPEC_APPROVED"`，`reason: null`，`updated` 改成今天日期（保留檔案，不刪除）。
   2. 用 Read 讀取 `plan-spec.json` 的 `task_breakdown`，用 Write 建立 `.agent-work-team/requests/{request_id}/task-summary.md`——一份純粹方便掃描「後續有哪些工作」的**靜態快照**，不是即時進度表（Development 開始後每個 task 的實際完成狀態要看 `dev/progress.json` 或 `.agent-work-team/dashboard.md`，這份檔案之後不會再更新）：

```markdown
# Task 總表 — {request_id}

> 這是 Spec 核准當下（{today}）的靜態快照，只反映當時的任務拆解，之後不會再更新。Development 開始後，每個 task 的即時完成狀態請看 `dev/progress.json` 或 `.agent-work-team/dashboard.md`。

| Task ID | 說明 | 預計異動檔案 |
|---|---|---|
| T1 | <task.description> | <task.files 用頓號或逗號連接成一行> |
| T2 | <task.description> | <task.files> |

共 {task_breakdown 陣列長度} 個 task。完整的驗收標準與技術設計脈絡請見 `plan-spec.md`。
```

   3. 用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 50`，`updated` 改成今天日期。
   4. 告訴使用者這個需求的 Planning 階段已完成，任務總表已產出於 `.agent-work-team/requests/{request_id}/task-summary.md`，可以執行 `/agent-work-team-develop {request_id}` 進入 Development 階段。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
