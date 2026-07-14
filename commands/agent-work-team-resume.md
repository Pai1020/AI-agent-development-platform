---
description: 列出所有在途／待確認／卡住的需求，顯示各自停住原因與待確認問題，並從持久化 checkpoint 續接 Planning；Dev/Knowledge 階段的需求則導向對應指令
---

你正在執行 `/agent-work-team-resume [RQ-ID]` — agent-work-team pipeline 的續接入口。這個指令存在的理由是：Planning 階段（`/agent-work-team`）的軟停（例如 BA 澄清中途、等待使用者確認需求摘要）只活在對話 session 裡，一旦 session 找不到就無法接續。這個指令從磁碟上的 `state.json` 與 `planning/checkpoint.json` 重建「停在哪、為什麼停、有哪些待確認問題」，讓你可以在**全新的 session** 裡把任何在途需求接回去，不需要找到原本的對話。

Development／Knowledge 階段本身已經能靠 `/agent-work-team-develop`／`/agent-work-team-knowledge` 從磁碟續接，所以這個指令不重做那兩個階段的邏輯，只負責把它們列出來並指向正確的指令。

## Step 1: 掃描並分類所有需求

1. 若使用者在指令後面提供了 `<RQ-ID>`（例如 `RQ-001`），用這個當作 `request_id`，跳過 Step 2 的清單呈現，直接進 Step 3。
2. 若沒有提供，**優先用 Read 讀取 `.agent-work-team/dashboard.md` 一次**，不要逐一 Glob+Read 每個 `state.json`——dashboard 已經是 hook 自動同步好的彙整表格，內容跟 `state.json` 一致，沒有必要重複讀權威來源做這一步的粗分類：
   - **若 `dashboard.md` 不存在**（例如從沒同步過，或被手動刪除）：退回原始做法——用 Glob 找出 `.agent-work-team/requests/*/state.json`，用 Read 讀出每一個取得 `id`／`name`／`current_stage`／`status`／`waiting_on`；並告訴使用者「`.agent-work-team/dashboard.md` 不存在，已改用逐一讀取（較慢），建議之後執行 `/agent-work-team-dashboard` 重建它」。
   - **若 `dashboard.md` 存在**：解析表格——跳過標題行 `# Agent Work Team Dashboard`、表格標題列、分隔線列；若有一行以 `> ⚠️` 開頭的警示行，記下它的內容（代表有幾個需求因為 `state.json` 壞掉被 dashboard 跳過，稍後要提醒使用者這幾個需求在這裡看不到、這個指令也無法幫它們續接）。剩下每一列資料依固定欄位順序（ID／需求名稱／類型／來源／Team／優先級／Progress／Current Stage／Current Agent／Status／Waiting／Created／Updated）取出 `id`、`name`（`(未命名)` 視為 `null`）、`current_stage`、`status`、`waiting_on`（`-` 視為 `null`）。**這一步不讀任何一個 `state.json`**，只用 dashboard 現有內容做分類與呈現。
3. 依 `current_stage` 分成三類：
   - **Planning-owned（這個指令負責續接）**：`CREATED`、`PM_TRIAGE`、`BA_CLARIFYING`、`SPEC_DRAFTING`、`PENDING_SPEC_APPROVAL`。
   - **Dev-owned（導向 `/agent-work-team-develop <id>`）**：`SPEC_APPROVED`、`DEVELOPING`、`TESTING`、`PENDING_FINAL_APPROVAL`。
   - **Knowledge-owned（導向 `/agent-work-team-knowledge <id>`）**：`DEV_APPROVED`、`PENDING_KNOWLEDGE_APPROVAL`。
   - `current_stage` 是 `"DONE"` 的需求：已完成，不列入清單（除非使用者明確要求看已完成的）。
4. 若三類加總後一個需求都沒有：告訴使用者「目前沒有任何在途或待確認的 agent-work-team 需求」（若 Step 1.2 有記下 dashboard 的跳過警示，一併告訴使用者），然後停止。

## Step 2: 呈現清單、讓使用者挑選

若 Step 1 從 dashboard 讀到跳過警示（有 `state.json` 無法解析的需求），先把這件事告訴使用者——這幾個需求本指令看不到、也無法續接，需要使用者自己去看那些資料夾發生什麼事。

對每一個在途需求（不分三類，全部列出；這裡用的都是 Step 1 從 dashboard 或 fallback 拿到的資料，**不需要**為了列清單再去讀一次對應的 `state.json`），印出 `id`／`name`／`current_stage`／`status`／`waiting_on`，並加一行**具體原因**：

- **Planning-owned 的項目**：用 Read 讀取 `.agent-work-team/requests/{id}/planning/checkpoint.json`（若存在）：
  - 若 `pending` 不是 `null`：顯示 `checkpoint.reason` + `pending.prompt` 全文（讓使用者不用回想、直接看到當初問到哪、要確認什麼）。
  - 若 `pending` 是 `null` 但 `reason` 有值（例如 PM/Plan-SD 被 subagent 判定 `BLOCKED` 時寫入的原因）：顯示 `reason`。
  - 若 checkpoint 不存在（例如卡在 `CREATED`，連 PM 都還沒 dispatch 過）：顯示「尚未進入任何有紀錄的階段」。
- **`status` 是 `"Blocked"` 的項目（不分三類）**：這是「卡住」而非「軟停」，一律要顯示卡住原因：
  - Planning-owned：原因來自上面 checkpoint 的 `reason`（PM/Plan-SD 的 `BLOCKED` 具體原因，或本身就有 `pending` 的軟停原因）。
  - Dev-owned：告訴使用者「詳見 `.agent-work-team/requests/{id}/dev/{最後處理中的 task-id}-review.md` 或 `final-review.md`」——Developer/Reviewer 的報告檔案已經記錄了具體問題，不必在這裡重複。
  - Knowledge-owned：告訴使用者「重新執行 `/agent-work-team-knowledge {id}` 會重新 dispatch 並回報卡住原因」。
- **`PENDING_SPEC_APPROVAL`**：顯示「Spec 已產出、待核准 → 開啟 `.agent-work-team/requests/{id}/plan-spec.md`」。
- **Dev-owned 項目（非 Blocked）**：顯示「請執行 `/agent-work-team-develop {id}` 繼續」。
- **Knowledge-owned 項目（非 Blocked）**：顯示「請執行 `/agent-work-team-knowledge {id}` 繼續」。

列完後用 `AskUserQuestion` 讓使用者從清單裡明確挑一個。**不要自動挑 `updated` 最新的那個**——使用者執行這個指令正是因為已經搞不清楚哪個需求在哪、要看到全部才能自己判斷，跟 `/agent-work-team-develop` 的自動挑選行為不同。

若使用者挑到的是 Dev-owned 或 Knowledge-owned 的需求：把對應指令（`/agent-work-team-develop {id}` 或 `/agent-work-team-knowledge {id}`）告訴使用者，然後停止——這個指令不代替它們做事。

若使用者挑到的是 Planning-owned 的需求，繼續 Step 3。

## Step 3: 讀取權威狀態、token 把關

Step 1／2 用的 `current_stage`／`status`／`waiting_on` 來自 dashboard.md（衍生產物，用來省掉逐一 Read 的成本），**選定需求之後不能再信任那份快取**——這裡要重新讀一次權威來源，之後 Step 4 的路由判斷一律用這裡讀到的新資料，不沿用 Step 1 的舊值：

1. 用 Read 讀取 `.agent-work-team/requests/{request_id}/state.json`**全文**（不只 `token`）——之後 Step 4 判斷 `current_stage`／`status` 都用這次讀到的值，忽略 Step 1 從 dashboard 拿到的版本。
2. 用 Read 讀取 `.agent-work-team/requests/{request_id}/planning/checkpoint.json` 的 `token`（若檔案存在）。
3. 用 Read 讀取 `.agent-work-team/requests/{request_id}/pm-triage.json` 的 `token`（若檔案存在）。
4. 把有讀到的 token 兩兩比對。**只要有任何一組不一致**，就停止並明確告訴使用者：「`{request_id}` 疑似被重用過（token 不一致），手上的 checkpoint／pm-triage 可能屬於一個已經不存在的舊需求，請人工確認這個資料夾的內容是否可信，再決定要不要繼續」。不要嘗試自動判斷哪個是對的、也不要自動修正或刪除檔案。
5. 全部一致才繼續 Step 4。

## Step 4: 依 `current_stage` 續接

路由一律以 **Step 3 第 1 點剛讀到的 `state.json.current_stage`** 為準（不是 Step 1 從 dashboard 拿到的那份）；細節（要重放的問題、要顯示的摘要）用 `planning/checkpoint.json` 補，能容忍 checkpoint 與 state 之間漏寫的中間狀態。

- **`current_stage` 是 `"BA_CLARIFYING"`**：
  1. 用 Read 讀取 `planning/checkpoint.json`。若不存在或 `pending` 是 `null`：告訴使用者「沒有持久化的待確認問題」，把 `clarification_log`（若有）簡短回放給使用者看目前進度，然後從下一個問題繼續問（或若 `clarification_log` 也是空的，就從頭開始問）——直接進入 `agent-work-team.md` Step 3 第 2 點的迴圈。
  2. 若 `state.json.status` 是 `"Pending Confirmation"`：先用 Write 把它改回 `"Running"`、`waiting_on` 改回 `null`（比照清 `Blocked` 的做法，讓 dashboard 反映目前又在互動）。
  3. 若 `pending.kind` 是 `"question"`：先用 `clarification_log` 簡短跟使用者回顧目前已經問過、答過的內容，再用 `AskUserQuestion` 把 `pending.prompt`（+ `pending.options`，若非空）原樣重新呈現一次。使用者回答後，**完全比照 `agent-work-team.md` Step 3 第 2 點以後的程序繼續**（append 進 `clarification_log`、寫 checkpoint、繼續問或進摘要確認、通過後寫 `ba-requirement.json` 並推進到 `SPEC_DRAFTING`）。
  4. 若 `pending.kind` 是 `"summary_confirmation"`：直接把 `pending.prompt`（完整需求摘要 + AC 清單）重新呈現給使用者確認，之後比照 `agent-work-team.md` Step 3 第 5 點以後的程序繼續。
  5. 若 `state.json.status` 是 `"Blocked"`（PM 或內部判斷卡住，且 `checkpoint.pending` 是 `null`）：使用者重新執行本身就是「已經處理過問題、要重試」的訊號——用 Write 把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on` 改回 `null`，回到本階段正常的提問迴圈繼續（等同從頭或從最後的 `clarification_log` 接著問）。
- **`current_stage` 是 `"PENDING_SPEC_APPROVAL"`**：直接進 `agent-work-team.md` Step 5（Human Approval Gate）：提示使用者開啟 `plan-spec.md`，回覆 approve 或修改意見，照該 Step 的規則處理後續。
- **`current_stage` 是 `"SPEC_DRAFTING"`**：代表卡在 Plan/SA/SD subagent 尚未回報（例如上次 session 死在 dispatch 途中，或前一輪被判定 `BLOCKED`）。用 Read 讀取 checkpoint 的 `reason`（若有）告訴使用者上次卡住的原因，然後問使用者是否要重新 dispatch；確認後比照 `agent-work-team.md` Step 4 重新走一次（若之前是 `Blocked`，先把 `state.json.status` 清回 `"Running"`、`waiting_on` 清回 `null`）。
- **`current_stage` 是 `"PM_TRIAGE"`**：代表卡在 PM subagent 尚未回報。用 Read 讀取 checkpoint 的 `reason`（若有）告訴使用者上次卡住的原因，確認後比照 `agent-work-team.md` Step 2 重新走一次（若之前是 `Blocked`，先清回 `"Running"`／`null`）。
- **`current_stage` 是 `"CREATED"`**：這個需求磁碟上除了 `state.json` 之外沒有任何 durable 進度（連 checkpoint 都不會存在）。告訴使用者這個需求還沒真正開始過，問他是要繼續（比照 `agent-work-team.md` Step 2 開始 PM 分類，需要先確認 `raw_description`——`state.json` 本身沒存這個欄位，要請使用者重新提供原始需求描述）還是要刪掉這個資料夾放棄。**不要**嘗試重放任何問題或猜測這個需求原本要做什麼。

## 補充：一致性容錯

若 `planning/checkpoint.json` 存在但和 `state.json.current_stage` 對不上（例如 checkpoint 還停在 `BA_CLARIFYING` 但 `state.json.current_stage` 已經是 `SPEC_DRAFTING`）：一律以 `state.json.current_stage` 為準來決定路由分支，checkpoint 只用來補充那個分支需要的細節；若細節缺失就照上面各分支「checkpoint 不存在」的規則處理，不要因為兩者不一致而中止整個流程。
