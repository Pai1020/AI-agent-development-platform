# Agent Work Team — Development 階段 Design

## 背景與目的

`agent-work-team` 的 Planning 階段（PM Agent → BA Agent → Plan/SA/SD Agent，止於 `SPEC_APPROVED`）已經上線並驗證可用（見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`）。本次 spec 是第二個 sub-project：把 MVP 文件（`AI_Development_Platform_MVP_v4.md`）裡的 Developer Agent 與 Review/Test Agent 落實成功能，讓一個已核准的 spec 能實際變成程式碼與經過審查的結果。

**本次範圍**：Developer Agent + Review/Test Agent，從 `SPEC_APPROVED` 延伸到 `DEV_APPROVED`。Knowledge Agent（整理知識庫）留到第三輪。

## 架構決策：沿用 Planning 階段的原則，把 subagent-driven-development 模式產品化

Developer/Review 的協作方式，直接沿用本次 session 用來建置這個 plugin 本身的 `subagent-driven-development` 模式：Controller（新 command）依序 dispatch Developer subagent 實作一個 task、Review subagent 審查這個 task，不過關就打回去修、重新審查，全部 task 做完再跑一次整體審查。這不是新發明的機制——是把我們自己這次 session 已經驗證好用的流程，變成 plugin 的一個功能。

沒有常駐服務、沒有資料庫，狀態一樣是使用者專案裡的檔案。

## 新入口 Command

`/agent-work-team-develop <RQ-ID>`

- 若省略 `<RQ-ID>`，自動掃描 `.agent-work-team/requests/*/state.json`，挑 `current_stage: "SPEC_APPROVED"` 且 `updated` 最新的一個。
- 若指定的 `<RQ-ID>` 不存在，或存在但 `current_stage` 不是 `SPEC_APPROVED`（例如還在規劃中，或已經是 `DEV_APPROVED`），停止並告訴使用者目前狀態，不要繼續。

## `plan-spec.json` 的 `task_breakdown` 格式加強

原本 `task_breakdown` 是字串陣列。Development 階段需要更多資訊才能讓 Developer subagent 做好，改為結構化物件陣列：

```json
"task_breakdown": [
  {
    "id": "T1",
    "description": "實作登入 API endpoint",
    "files": ["src/routes/auth.js", "src/controllers/authController.js"],
    "acceptance_criteria": "POST /login 帶正確帳密回傳 200 + token，帳密錯誤回傳 401"
  }
]
```

`file_impact`（整體受影響檔案總覽）維持不變。`agents/agent-work-team-plan-sd.md` 需要修改，讓它產出這個新格式。**這是對已上線 Round 1 程式碼的修改**，Round 1 已存在的 `plan-spec.json`（字串陣列格式）在這次改動後不會被自動轉換——如果要對舊需求跑 `/agent-work-team-develop`，會因為格式不符而在下面的驗證中被擋下（見「錯誤處理」）。

## 狀態機延伸與 Progress 重新編號

```
CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING → PENDING_SPEC_APPROVAL → SPEC_APPROVED
        → DEVELOPING → TESTING → PENDING_FINAL_APPROVAL → DEV_APPROVED
```

`BLOCKED` 語意不變：`current_stage`/`progress` 停在卡住當下的值，只有 `status`/`waiting_on` 改變。

**Progress 對照表（取代 Round 1 的版本）：**

| current_stage | progress |
|---|---|
| CREATED | 0 |
| PM_TRIAGE | 10 |
| BA_CLARIFYING | 20 |
| SPEC_DRAFTING | 30 |
| PENDING_SPEC_APPROVAL | 40 |
| SPEC_APPROVED | 50 |
| DEVELOPING | 70 |
| TESTING | 90 |
| PENDING_FINAL_APPROVAL | 95 |
| DEV_APPROVED | 100 |

`commands/agent-work-team.md` 裡所有既有的 progress 數字都要對照新表重新編號，不是只有 `SPEC_APPROVED`：`BA_CLARIFYING` 30→20、`SPEC_DRAFTING` 60→30、`PENDING_SPEC_APPROVAL` 90→40、`SPEC_APPROVED` 100→50（`PM_TRIAGE` 的 10 不變）。這是對 Round 1 已上線程式碼的調整。

## 目錄與檔案結構（延伸 `RQ-00X/`）

```
.agent-work-team/requests/RQ-001/
├── state.json
├── pm-triage.json / .md
├── ba-requirement.json / .md
├── plan-spec.json / .md        # task_breakdown 為新格式
└── dev/
    ├── progress.json           # 每個 task 的狀態、commit sha、修正次數
    ├── T1-report.json / .md    # Developer 對 T1 的實作報告
    ├── T1-review.json / .md    # Reviewer 對 T1 的審查結果
    ├── T2-report.json / .md
    ├── T2-review.json / .md
    └── final-review.json / .md # 全部 task 完成後的整體審查
```

**`dev/progress.json` 格式：**

```json
{
  "base_branch": "<執行當下 git branch --show-current 抓到的分支名稱，可能是 main、develop、feature/xyz 等任何分支，不假設一定是 main>",
  "tasks": [
    {"id": "T1", "status": "done", "commits": ["<sha>"], "fix_rounds": 0, "needs_context_rounds": 0},
    {"id": "T2", "status": "in_progress", "commits": [], "fix_rounds": 1, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

`base_branch` 是進入 Development 階段前使用者原本所在的分支（見上方「Git 分支策略」），所有 task 實際上是在 `agent-work-team/{request_id}` 這個新分支上進行的。`status`：`pending` | `in_progress` | `done` | `blocked`。`final_review_fix_rounds` 是整個需求最終審查的修正次數計數器，用同一套「超過 2 次仍不過就 Blocked」規則。`needs_context_rounds` 是同一個 task 連續回報 `NEEDS_CONTEXT` 的次數計數器，同樣「超過 2 次就 Blocked」，避免 Developer 一直拿不到足夠資訊時無限重試下去。

## 兩個新 Subagent

### `agent-work-team-developer`

- **輸入**：單一 task 物件（`id`/`description`/`files`/`acceptance_criteria`）、`plan-spec.json` 的 `technical_design`（提供整體技術脈絡）。
- **工作**：依 `description`/`files`/`acceptance_criteria` 實作程式碼、跑跟這個 task 相關的測試、commit。寫入 `dev/{task_id}-report.json` / `.md`（內容：實作了什麼、測試結果、變更的檔案、commit sha）。
- **回報**：`DONE` | `DONE_WITH_CONCERNS` | `BLOCKED` | `NEEDS_CONTEXT`（與本次 session 使用的四種狀態一致）。

### `agent-work-team-reviewer`

- **輸入**：同一個 task 物件、這個 task 的 git commit range（base/head sha）、Developer 的報告。
- **工作**：審查 spec 合規性（有沒有做到 `acceptance_criteria`）與程式碼品質，仿照本次 session 使用的 review 格式（Strengths / Issues by severity / Assessment）。寫入 `dev/{task_id}-review.json` / `.md`。
- **回報**：`Approved` | `Needs fixes` + Critical/Important/Minor 問題清單。

## Git 分支策略

`/agent-work-team-develop` 不會直接在使用者目前所在的分支上 commit。初始化時（見下方執行流程 Step 2）會：

- 記錄目前分支為 `base_branch`。
- 從 `base_branch` 切出新分支 `agent-work-team/{request_id}`（例如 `agent-work-team/RQ-001`），切換過去，所有 task 的 commit 都發生在這個分支上。
- 若這個分支已經存在（例如上次執行中斷後重新執行），直接切換過去繼續，不要覆蓋或重建。
- `base_branch` 寫進 `dev/progress.json`，供之後參考要 merge 回哪裡。

**DEV_APPROVED 之後不會自動 merge。** Merge/push 是會影響共享分支狀態的操作，交給使用者自己決定何時、如何處理——command 只會在核准後的訊息裡明確告訴使用者目前變更在哪個分支（`agent-work-team/{request_id}`）、原本的 `base_branch` 是什麼。

## `/agent-work-team-develop` 執行流程

1. 找到目標需求（見上）。驗證 `plan-spec.json` 的 `task_breakdown` 是新格式（每項都有 `id`/`description`/`files`/`acceptance_criteria`）；格式不符就停止並告訴使用者（見錯誤處理）。
2. 用 Bash 取得目前分支名稱，記錄為 `base_branch`；建立並切換到 `agent-work-team/{request_id}`（若已存在則直接切換過去）。更新 `state.json`：`current_stage: "DEVELOPING"`, `progress: 70`。建立 `dev/progress.json`：每個 task 初始 `status: "pending"`，並記錄 `base_branch`。
3. **依序處理每個 task**（不平行）：
   a. 更新 `dev/progress.json` 該 task 為 `in_progress`。
   b. Dispatch `agent-work-team-developer`，帶入這個 task 的物件與 `technical_design`。
   c. 若回報 `BLOCKED`：標記這個 task `status: "blocked"`，`state.json` 的 `status: "Blocked"`、`waiting_on: "Human"`，把原因告訴使用者，**停止整個流程**（後面的 task 不處理）。
   d. 若回報 `DONE`/`DONE_WITH_CONCERNS`：dispatch `agent-work-team-reviewer` 審查這個 task 的 diff。
      - `Approved` → 標記這個 task `status: "done"`，記錄 commit sha，進下一個 task。
      - `Needs fixes`（有 Critical/Important）→ 把問題丟回 `agent-work-team-developer` 修，`fix_rounds` +1，重新 review。
      - `fix_rounds` 超過 2 次仍是 `Needs fixes` → 標記這個 task `status: "blocked"`，`state.json` 同上設為 Blocked，把還沒解決的問題列給使用者，**停止整個流程**。
4. **全部 task 都 `done`**：更新 `state.json`：`current_stage: "TESTING"`, `progress: 90`。針對整個需求的完整 diff（所有 task 的 commit range），跑一次最終審查（沿用同一份 reviewer 邏輯，但範圍是整個需求，不是單一 task），寫入 `dev/final-review.json` / `.md`。
5. 更新 `state.json`：`current_stage: "PENDING_FINAL_APPROVAL"`, `progress: 95`, `status: "Pending Approval"`, `waiting_on: "Human Review"`。提示使用者：「最終審查已產出於 `dev/final-review.md`，請開啟確認，確認沒問題請回覆 approve，有問題請直接說明」。
6. **Human Approval Gate**：
   - 回覆 **approve** → `state.json`：`current_stage: "DEV_APPROVED"`, `status: "Approved"`, `waiting_on: null`, `progress: 100`。告訴使用者 Development 階段完成，變更都在 `agent-work-team/{request_id}` 分支上、原本的 `base_branch` 是 `{base_branch}`，要不要 merge、何時 merge 由使用者自己決定，Knowledge Agent 是後續版本。流程結束。
   - 提出修改意見 → 把意見整理成需要修的問題，重新走整體審查的 fix 流程（同單一 task 的 fix_rounds 邏輯，超過次數一樣停下來交給人）。

## 錯誤處理

- `plan-spec.json` 的 `task_breakdown` 格式不符（例如舊格式字串陣列，或缺少必要欄位）：不猜測、不嘗試自動轉換，直接停止並具體告訴使用者哪裡不符合，需要重新走 Plan/SA/SD 產出正確格式的 spec。
- 任一 task 或最終審查卡住超過重試次數：`status: "Blocked"`、`waiting_on: "Human"`，把具體問題列出來，停止流程，不自行猜測繼續。**這個門檻檢查同時由 command 的 prompt 指示與下方的 hook 共同把關**（見「Blocked 門檻改由 Hook 強制執行」）。

## Blocked 門檻改由 Hook 強制執行

`/agent-work-team-develop` 本身的 prompt 指示已經要求「+1 之後重新 Read 確認實際數值」，但這仍然是**建議** Controller 這樣做，不是保證。實測發現：在一個跑很多輪 subagent dispatch、又可能被使用者中途打斷的長流程裡，Controller（LLM）有機率忘記做這個門檻檢查，即使它自己知道規則——這跟一開始 dashboard 同步從 prompt 改成 hook 是同一類問題：**確定性的規則不該只靠 LLM 記得去執行**。

解法是新增一個 `PostToolUse` hook（`hooks/enforce-block.mjs`），監聽 `Write`：

- 只處理路徑符合 `.agent-work-team/requests/<id>/dev/progress.json` 的寫入，其他一律 exit 0、不做任何事、不輸出。
- 讀取整份 `progress.json`，檢查每個 task 的 `fix_rounds`／`needs_context_rounds`，以及頂層的 `final_review_fix_rounds`，是否有任何一個超過 2。
- 若有超過：讀取同一個需求的 `state.json`。若 `status` 還不是 `"Blocked"`，直接（不透過模型）把它改成 `status: "Blocked"`、`waiting_on: "Human"`，並呼叫 `sync-dashboard.mjs` 已經匯出的 `rebuildDashboard`（直接 import 使用，不要重複實作一份渲染邏輯）讓 `dashboard.md` 同步反映最新狀態。
- **這個 hook 偵測到超過門檻時，必須用 `hookSpecificOutput.additionalContext` 這個結構把訊息餵回模型的 context**，格式是：

  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": "⚠️ agent-work-team: 需求 {request_id} 已超過重試上限...state.json 已被自動設為 Blocked，請立即停止 Development 流程..."
    }
  }
  ```

  **不能只印純文字到 stdout。** PostToolUse hook 的純文字 stdout（即使沒有 `suppressOutput`）只會出現在人類看得到的 transcript／debug log 裡，**不會**被送進模型下一輪的 context——這點跟原本以為「不要 suppressOutput 就能讓 Controller 看到」的假設不同，已經實測／查證確認過。唯一能確定讓模型在下一輪讀到這段訊息、進而真的停下來的方式，就是這個 `additionalContext` 結構。跟 dashboard 同步 hook 不同，這裡不能用 `suppressOutput`／不能只印文字了事——沒有超過門檻、或已經是 Blocked 時，才維持完全不輸出任何東西。
- 若沒有超過門檻（或已經是 Blocked，這次寫入沒有新增卡住的項目）：安靜結束，不輸出，避免每次 task 進度更新都被打擾。

這樣一來，即使 Controller 自己的門檻檢查失手，`state.json` 的實際狀態也一定會被 hook correctly 設成 Blocked，不會出現「數字已經超過、但沒有真的停下來」的情況。

## Out of scope

- Knowledge Agent（整理 Decision/Architecture/Lessons Learned，第三輪）
- 多個 task 平行處理（本次仍是循序，一次一個 task）
- Validation Layer、多 Methodology、Child/Agent Dashboard
- 對 Round 1 舊格式（字串陣列）`plan-spec.json` 的自動遷移

## 驗證方式

在測試專案裡，先跑完 Round 1 到 `SPEC_APPROVED`（確認 `plan-spec.json` 是新格式），再驗證：

1. 執行 `/agent-work-team-develop`（不帶 ID），確認正確找到該需求，`state.json` 前進到 `DEVELOPING`，`dev/progress.json` 正確初始化每個 task，且**確認已經切換到新分支 `agent-work-team/{request_id}`**（`git branch --show-current` 確認），`base_branch` 正確記錄原本的分支名稱，原本分支沒有被直接改動。
2. 每個 task 依序執行，確認 `dev/T{n}-report.*`、`dev/T{n}-review.*` 正確產生，`dashboard.md` 也同步反映目前狀態，且所有 commit 都在 `agent-work-team/{request_id}` 分支上。
3. 刻意讓某個 task 的實作有明顯問題（例如漏做 acceptance criteria），確認 reviewer 抓到、fix 迴圈觸發、`fix_rounds` 正確累加。
4. 讓同一個 task 連續 2 次修正都過不了，確認流程正確停在 `Blocked` 並列出具體問題，且後面的 task 沒有被執行。手動把 `dev/progress.json` 某個 task 的 `fix_rounds` 改成 3（模擬 Controller 忘記自己停下來），確認 `hooks/enforce-block.mjs` 這個 hook 自己把 `state.json` 設成 Blocked，且**確認是 Controller 在下一輪真的因為這個訊息改變行為（停止繼續 dispatch），不是只有你自己在 transcript 裡看到一行字**——這是驗證 `additionalContext` 機制真的有效，不是只驗證「有東西印出來」。
5. 全部 task 過關後，確認 `state.json` 前進到 `TESTING` 再到 `PENDING_FINAL_APPROVAL`，`dev/final-review.*` 正確產生並提示使用者去看檔案。
6. 回覆 approve，確認 `state.json` 變成 `DEV_APPROVED`、`progress: 100`，且訊息裡正確告知目前變更所在的分支與 `base_branch`，**沒有自動執行任何 merge**。
7. 對同一個已經有分支的需求（例如上次 Blocked 後重新執行）再跑一次 `/agent-work-team-develop`，確認它切換到既有分支繼續，而不是覆蓋或重建。
