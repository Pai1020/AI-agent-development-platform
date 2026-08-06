---
title: Development 階段 Commit 模式（squash / per_task）Design
document_type: feature-design
status: Approved by user (2026-08-07); implementation not started
created: 2026-08-07
updated: 2026-08-07
---

# Development 階段 Commit 模式（squash / per_task）Design

## 背景與目的

目前 `/agent-work-team-develop` 的 commit 行為固定：每個 task 完成後由 `agent-work-team-developer` subagent 各自 `git add` + `git commit`（commit message 帶 task id），Reviewer 要求修正時再新增一個 commit（不 amend）。使用者希望能選擇另一種模式：**整個需求（RQ-ID）從頭到尾在 `agent-work-team/{request_id}` 分支上只留一個 commit**，涵蓋所有 task 與所有修正回合。

兩種模式都要能用：

- `per_task`：現行行為，完全不變。
- `squash`：分支最終只有一個 commit。

## 範圍確認（避免歧義）

- `squash` 指**整個 RQ-ID 的分支歷史**只剩一個 commit，不是「每個 task 一個 commit、但省略修正回合」。
- 這個功能只影響 `agent-work-team/{request_id}` 分支本身的 commit 數量，**不涉及自動 merge**——merge 回 `base_branch` 的時機與方式仍由使用者自行決定（沿用現行行為）。

## 架構決策

### 1. 新 artifact：`planning/dev-config.json`

位置：`.agent-work-team/requests/{request_id}/planning/dev-config.json`，跟 `planning/checkpoint.json` 同層。

```json
{ "commit_mode": "squash" | "per_task" }
```

- 這個檔案在 Spec 核准（`SPEC_APPROVED`）當下產生，之後不會再變。
- 內容不由 Agent 判斷，由**使用者**在 Spec 核准關卡明確選擇。

### 2. Planning 端：Spec 核准關卡新增一步選擇

修改 `commands/agent-work-team.md` 的 Step 5（Human Approval Gate）第 2 點：使用者回覆 approve 之後、寫入 `task-summary.md`／`state.json: SPEC_APPROVED` 之前，新增一步：

1. 明確問使用者：這次 Development 要用哪種 commit 模式——`squash`（整個需求最後只留一個 commit）或 `per_task`（現行行為，每個 task 各自 commit）。
2. 使用者回答後，用 Write 建立 `planning/dev-config.json`，寫入對應的 `commit_mode`。
3. 才繼續原本的 `task-summary.md`／`state.json` 更新流程。

若使用者在後續修改意見來回（Step 5 第 3 點，回到 Step 3/4 重新走技術設計）造成重新核准，不需要重問——`dev-config.json` 只在**第一次**真正核准（進入 `SPEC_APPROVED`）時寫入一次即可；若使用者在 approve 前改變心意想換模式，直接覆寫 `dev-config.json` 即可，不需要額外設計版本欄位（YAGNI，目前沒有跨版本需求）。

### 3. Development 端：讀取 commit 模式

修改 `commands/agent-work-team-develop.md`，在 Step 1（找到目標需求）判斷完 `is_resume` 之後、進入 Step 2 之前，新增一步：

1. 用 Read 讀取 `.agent-work-team/requests/{request_id}/planning/dev-config.json`。
2. 若檔案存在：取得 `commit_mode`，記下供後續步驟使用。
3. 若檔案不存在（這個需求是本功能上線前建立、已經 `SPEC_APPROVED` 甚至已經在 Development 中）：停下來，明確告訴使用者這個需求還沒有選過 commit 模式，請使用者現在選一個（`squash` 或 `per_task`）；拿到回答後用 Write 補建 `planning/dev-config.json`，再繼續。
4. 這一步不管全新開始或恢復執行（`is_resume` 為 `true` 或 `false`）都要做。

### 4. `per_task` 模式：完全不變

Step 2–6（task 驗證、分支建立、逐一開發審查、整體審查、Human Approval Gate）維持現行邏輯，一行都不用改。

### 5. `squash` 模式：只在使用者最終核准那一刻多做一次 squash

Step 2–5（每個 task 的開發／審查、整體最終審查）**維持現行邏輯不變**——一樣一個一個 task 各自 commit、修正回合各自新增 commit。這樣做的理由：

- Reviewer 現有的 commit range 邏輯（`git diff {task 第一個 commit}^..HEAD`、整體 `git diff {第一個 task 的第一個 commit}^..HEAD`）完全不用改。
- 中途中斷的 resume 邏輯（`dev/progress.json` 的 `status`／`commits` 陣列）完全不用改。
- 若使用者在 Step 6 對最終審查提出修改意見（流程退回 Step 4），因為這時候還沒 squash，跟現在的行為完全一樣，不受影響。

差異只在 **Step 6：使用者明確回覆 approve、要寫入 `DEV_APPROVED` 之前**，若 `commit_mode` 是 `squash`，額外執行一次性 squash：

1. 用 Bash 執行 `git status --porcelain -- . ':!.agent-work-team'`，確認除了 `.agent-work-team/`（plugin 自己的協調用中繼資料）以外，工作目錄是乾淨的。這裡刻意排除 `.agent-work-team/`：Controller 與 Developer subagent 在每個 task 的程式碼 commit 之後，仍會持續寫入 `dev/{task.id}-report.json`、`dev/progress.json`、`state.json` 等檔案，這些檔案本來就不會被納入任何 commit（只有 `task.files` 才會被 commit），所以在核准這一刻 `.agent-work-team/` 底下幾乎必然是「dirty」的，這是預期行為、不是使用者真的有未 commit 的工作。若排除 `.agent-work-team/` 之後的範圍仍不乾淨，代表確實還有其他未 commit 的變更，停下來告知使用者，不要自動處理。
2. 用 Read 讀取 `dev/progress.json` 的 `base_branch`。
3. 用 Bash 執行 `git merge-base HEAD {base_branch}` 取得 merge-base sha（用 merge-base 而不是直接用 `base_branch` 目前的 tip，避免 `base_branch` 在 Development 期間有其他更新時算錯要保留的變更範圍）。
4. 用 Bash 執行 `git reset --soft {merge-base sha}`。
5. 組出 commit message：`[{request_id}] {plan-spec.json 的 requirement_summary}（{dev/progress.json 裡所有 task id，逗號分隔}）`。
6. 用 Write 把組好的 commit message 寫進暫存檔（例如 `.agent-work-team/requests/{request_id}/dev/.squash-commit-message.txt`），再用 Bash 執行 `git commit -F {該暫存檔路徑}`，而不是把 message 直接內插進 `git commit -m "..."` 的雙引號字串——`requirement_summary` 是自由文字，若剛好包含 `"` 或反引號，直接內插會有 shell 跳脫問題。
7. 完成後才繼續原本 Step 6 的 `state.json` 更新（`current_stage: "DEV_APPROVED"` 等）。

若 `commit_mode` 是 `per_task`，這一步整段跳過，維持現行行為。

## 不受影響的部分

- `agents/agent-work-team-developer.md`、`agents/agent-work-team-reviewer.md` 的 prompt 與邏輯不變。
- Task 層級與整體 review 的 commit range 計算方式不變。
- `dev/progress.json` schema 不變。
- Resume（`/agent-work-team-develop` 重跑接續）判斷邏輯不變——因為 squash 只發生在流程的最後一步，不影響任何中途狀態的判讀。

## 邊界與非目標

- 不處理自動 merge（沿用現行「merge 由使用者自行決定」）。
- 不支援「squash 到一半又要改」——因為 squash 是 Step 6 approve 那一刻才做的最後一步，approve 之後若使用者又要改，屬於「已完成流程後的新一輪需求／修改」，不在本設計範圍內。
- 不新增 `dev-config.json` 的版本欄位或跨模式切換 UI，目前只有二選一、選過即定案，YAGNI。

## 待實作時一併處理

依 `CLAUDE.md` 的「Prompt 編排確定性協作」規範，本設計涉及修改 `commands/agent-work-team*.md` 的 approval 行為與新增一份 artifact（`dev-config.json`）、一段 Controller 直接控制的 Git 副作用（squash）。實作階段（而非本次 brainstorming/spec 階段）必須同步更新 `docs/architecture/prompt-orchestration-determinism.md`：

- `updated`／`last_verified_against_code` metadata。
- Implementation Mapping 新增一列：commit granularity 的 current owner（Controller Prompt 直接執行 `git reset --soft` + `git commit`）、狀態標記為與現行 Prompt 編排一致（不是新架構，只是在現行 Controller-in-Prompt 模式下新增一個受控 Git 副作用步驟）。
- Verification Evidence：記錄實際驗證過的情境（squash 模式端到端跑一次、per_task 模式回歸測試、legacy 需求缺 `dev-config.json` 時的補選流程）。

## 驗證方式

實作完成後至少手動驗證：

1. 全新需求走 `squash` 模式：Spec 核准時選 squash，Development 跑完多個 task，最終 approve 後確認分支上 `git log agent-work-team/{request_id}` 只有一個 commit，且 commit message 含需求摘要與所有 task id。
2. 全新需求走 `per_task` 模式：跟現行行為一致，分支上每個 task／修正回合各自一個 commit。
3. 既有需求（沒有 `dev-config.json`）執行 `/agent-work-team-develop`：確認會停下來詢問並補寫檔案，而不是直接報錯或靜默假設某個模式。
4. `squash` 模式下 Step 6 使用者提出修改意見（尚未 approve）：確認流程正常退回 Step 4，commit 歷史維持多個 commit（尚未 squash）。
