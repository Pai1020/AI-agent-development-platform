# 手動測試清單：Development 階段 + Git 分支策略 + Planning Resume

Planning 流程（`/agent-work-team`）與 Dashboard hook（`hooks/sync-dashboard.mjs`）已經驗證過，這份清單只涵蓋還沒驗證的部分：Development 階段（`/agent-work-team-develop`）、git 分支策略，以及 2026-07-14 新增的 Planning 軟停持久化 + `/agent-work-team-resume` + `/agent-work-team-help` + token 重用防護（測試 9-16）。

## 前置準備

- [x] 把這個 plugin repo 的最新 commit push 到 GitHub（若是用 GitHub 安裝）
- [x] 在測試專案裡執行 `/plugin marketplace update <marketplace-name>` + `/reload-plugins` 更新到最新版
- [x] 確認測試專案是一個 git repo，且**不要**在 `main` 分支上開始測試（下面會用到非 main 分支來驗證 `base_branch` 不會被誤判成 main）

## 測試 1：產出新格式的 plan-spec（Development 階段的前提）

- [x] 建立並切到一個測試分支（例如 `git checkout -b test-scratch`）
- [x] 執行 `/agent-work-team "隨便一個測試需求"`，走完 PM → BA → approve，直到 `SPEC_APPROVED`
- [x] 打開 `plan-spec.json`，確認 `task_breakdown` 是新格式（每個 task 都有 `id`/`description`/`files`/`acceptance_criteria`，不是純字串陣列）

## 測試 2：Development 階段 happy path + 分支建立

- [x] 執行 `/agent-work-team-develop {RQ-ID}`
- [x] 用 `git branch --show-current` 確認已經切到 `agent-work-team/{RQ-ID}`
- [x] 打開 `dev/progress.json`，確認 `base_branch` 記錄的是你剛剛的 `test-scratch`，**不是 main**
- [x] 每個 task 依序跑完，確認 `dev/T{n}-report.*`、`dev/T{n}-review.*` 有產生，`dashboard.md` 有跟著更新（不用額外呼叫指令）
- [x] 全部 task 過關後，確認 `state.json` 依序走過 `TESTING` → `PENDING_FINAL_APPROVAL`，`dev/final-review.md` 有產生且系統有請你去看這個檔案（不是只貼摘要）
- [x] 回覆 approve，確認 `state.json` 變成 `DEV_APPROVED`、`progress: 100`
- [x] 確認最後的訊息有講清楚：目前變更在 `agent-work-team/{RQ-ID}` 分支、原本分支是 `test-scratch`，**沒有自動幫你 merge**
- [x] 切回 `test-scratch`，確認這個分支乾淨、沒有被直接改動或混進 Development 階段的 commit

## 測試 3：Fix 迴圈觸發

- [x] 找一個新需求，故意讓某個 task 的實作漏做 acceptance criteria（例如刻意跳過一個檢查）
- [x] 確認 Reviewer 抓到問題、回報 `Needs fixes`
- [x] 確認 Developer 被重新 dispatch 去修、`dev/progress.json` 裡該 task 的 `fix_rounds` 正確 +1
- [x] 修完重新 review 過關後，確認流程正常繼續下一個 task

## 測試 4：超過修正次數變 Blocked

- [x] 讓同一個 task 連續 2 次修正都還是有 Critical/Important 問題
- [x] 確認第 3 次失敗時，流程停在 `Blocked`，`state.json` 的 `waiting_on: "Human"`，把具體問題列出來
- [x] 確認後面的 task **沒有**被繼續處理

## 測試 5：舊格式 plan-spec 被拒絕

- [x] 找一個 Round 1（舊版）產生的 `plan-spec.json`（`task_breakdown` 是字串陣列），或手動改一份成舊格式
- [x] 對這個需求執行 `/agent-work-team-develop`
- [x] 確認它明確告訴你格式不符、需要重新走 Plan/SA/SD，而不是硬著頭皮繼續或自己猜測轉換

## 測試 6：中斷後恢復（分支沿用）

- [x] 用測試 4 那個被 Blocked 的需求，重新執行一次 `/agent-work-team-develop {RQ-ID}`
- [x] 確認它**切換到既有的** `agent-work-team/{RQ-ID}` 分支繼續，而不是報錯或重新建立
- [x] 確認 `dev/progress.json` 裡先前已完成 task 的紀錄沒有被覆蓋掉

## 測試 7：恢復一個單純 in_progress（非 blocked）的 task

- [ ] 手動把某個 task 的 `status` 改成 `"in_progress"`（不是 `"blocked"`），`state.json.status` 維持 `"Running"`，模擬「流程中斷但沒被明確判定 Blocked」
- [ ] 重新執行 `/agent-work-team-develop {RQ-ID}`，確認直接從 dispatch developer 繼續處理這個 task
- [ ] 確認這個 task 的 `fix_rounds`／`needs_context_rounds` **維持原值、沒有被重設為 0**（跟 `blocked` 恢復的行為不同）

## 測試 8：在 PENDING_FINAL_APPROVAL 恢復

- [ ] 手動把 `state.json.current_stage` 改成 `"PENDING_FINAL_APPROVAL"`，所有 task 都是 `"done"`
- [ ] 重新執行 `/agent-work-team-develop {RQ-ID}`，確認直接跳到 Step 6（Human Approval Gate），提示你去看 `dev/final-review.md`
- [ ] 確認**沒有**重新跑 per-task 迴圈或整體審查

---

跑完這 8 組，Development 階段 + 分支策略就算完整驗證過了。有任何一步結果跟預期不一樣，記下當下的狀況（哪一步、預期是什麼、實際發生什麼），回來討論是設計問題還是實作問題。

## 測試 9：BA 澄清中 checkpoint 即時累積

- [ ] 執行 `/agent-work-team "測試 resume 用的需求"`，走過 PM 分類進入 BA 階段
- [ ] 回答第 1 題後，打開 `.agent-work-team/requests/{RQ-ID}/planning/checkpoint.json`，確認 `clarification_log` 已經有第 1 題的問答、`pending` 是第 2 題的內容
- [ ] 在第 2 題**還沒回答**的當下，打開 `state.json`，確認 `status` 是 `"Pending Confirmation"`、`waiting_on` 是 `"Human"`，`current_stage`／`progress` 仍是 `BA_CLARIFYING`/20（沒有被凍結錯值）
- [ ] 打開 `.agent-work-team/dashboard.md`，確認這個需求顯示的 Status 是 `Pending Confirmation`（不需要另外呼叫任何指令）

## 測試 10：中途遺失 session，用 resume 從全新 session 接回

- [ ] 延續測試 9，在回答第 2 題**之前**直接關閉整個終端機/session（不要正常結束對話）
- [ ] 開一個全新 session（跟原本完全無關的視窗/對話），執行 `/agent-work-team-resume`
- [ ] 確認清單裡列出這個 `RQ-ID`，且顯示的原因與待確認問題跟原本卡住的第 2 題**一字不差**
- [ ] 挑選這個需求，確認第 2 題被重新呈現，回答後流程正常繼續（第 1 題的問答沒有遺失、沒有被重問）
- [ ] 一路確認到 approve，`ba-requirement.json.clarification_log` 包含全部問答，`state.json.current_stage` 正確推進到 `SPEC_APPROVED`

## 測試 11：`PENDING_SPEC_APPROVAL` 的 resume 路徑

- [ ] 找一個卡在 `PENDING_SPEC_APPROVAL` 的需求（或走一個新需求到這一步後不要回覆 approve）
- [ ] 執行 `/agent-work-team-resume {RQ-ID}`，確認直接進入核准關卡，提示你去看 `plan-spec.md`，而不是重新問 BA 問題

## 測試 12：Blocked 需求顯示卡住原因

- [ ] 故意讓 PM 或 Plan/SA/SD 卡住（例如給一個無法分類的空白需求描述）
- [ ] 執行 `/agent-work-team-resume`（不帶參數），確認清單裡這個需求的 `status` 是 `Blocked`，且原因欄位顯示 subagent 當初回報的具體卡住原因（不是空白或「未知」）

## 測試 13：`CREATED` 的 stranded 需求

- [ ] 手動用 Write 建立一個只有 `state.json`（`current_stage: "CREATED"`）、沒有任何其他檔案的需求資料夾
- [ ] 執行 `/agent-work-team-resume`，確認它把這個需求列出來、標示為「還沒真正開始過」，並提議重新開始或刪除，**不會**嘗試重放任何不存在的問題或崩潰

## 測試 14：Dev/Knowledge 需求正確被導向

- [ ] 準備一個卡在 `DEVELOPING`（或其他 Dev-owned stage）的需求，執行 `/agent-work-team-resume`
- [ ] 確認清單裡這個需求標示「請執行 `/agent-work-team-develop {RQ-ID}`」，挑選它之後指令**不會**自己去跑 Development 的邏輯，只印出建議指令就停止

## 測試 15：`/agent-work-team-help`

- [ ] 執行 `/agent-work-team-help`
- [ ] 確認六個指令（`/agent-work-team`、`/agent-work-team-resume`、`/agent-work-team-develop`、`/agent-work-team-knowledge`、`/agent-work-team-dashboard`、`/agent-work-team-help`）都有列出且說明正確
- [ ] 確認 `current_stage` 生命週期圖與 `status` 圖例（含新的 `Pending Confirmation`）都有顯示

## 測試 16a：resume 的清單步驟改讀 dashboard.md，不逐一讀 state.json

- [ ] 準備至少 2-3 個在途需求（不同階段）
- [ ] 執行 `/agent-work-team-resume`（不帶參數），觀察它列清單這一步驟是否只 Read 了 `.agent-work-team/dashboard.md` 一次，**沒有**對每個需求各自 Read 一次 `state.json`（Planning-owned 項目為了顯示原因而讀 `planning/checkpoint.json` 是預期內、不算違反）
- [ ] 確認清單顯示的 `id`／`name`／`current_stage`／`status`／`waiting_on` 跟實際 `state.json` 內容一致

## 測試 16b：dashboard.md 不存在時的 fallback

- [ ] 手動刪除 `.agent-work-team/dashboard.md`
- [ ] 執行 `/agent-work-team-resume`，確認它明確告知「dashboard.md 不存在，已改用逐一讀取」，並仍然正確列出所有在途需求（改用 Glob+Read 逐一取得）

## 測試 16c：選定需求後一律重讀權威 state.json，不信任 dashboard 快取

- [ ] 準備一個在途需求，讓 `dashboard.md` 的內容跟實際 `state.json` **不同步**（例如手動編輯 `dashboard.md` 表格裡這個需求的 `current_stage` 欄位，但不動真正的 `state.json`）
- [ ] 執行 `/agent-work-team-resume {RQ-ID}`（或列表後挑選這個需求），確認它的續接行為（Step 4 路由）是依照**真正 `state.json` 裡的 `current_stage`**，不是 dashboard 表格裡被你手動改過的假值

## 測試 16：token 不一致時拒絕續接

- [ ] 找一個有 `planning/checkpoint.json` 的在途需求，手動把 `checkpoint.json` 裡的 `token` 改成一個不存在的值（跟 `state.json.token` 不一致）
- [ ] 執行 `/agent-work-team-resume {RQ-ID}`，確認它**停止並警告**「疑似 RQ-ID 被重用」之類的訊息，不會嘗試用這個 checkpoint 繼續對話
- [ ] 把 `token` 改回一致的值，確認恢復正常，能正確續接

## 測試 17：Spec 核准後產生 task-summary.md 靜態快照

- [ ] 走一個新需求到 `plan-spec.json` 產出、`task_breakdown` 有 2 個以上的 task
- [ ] 回覆 approve，確認 `.agent-work-team/requests/{RQ-ID}/task-summary.md` 有被建立，表格裡每個 task 的 ID／說明／預計異動檔案跟 `plan-spec.json.task_breakdown` 一致
- [ ] 確認回覆裡有提到這份檔案的路徑
- [ ] 執行 `/agent-work-team-develop {RQ-ID}` 走完幾個 task 後，回頭打開 `task-summary.md`，確認它**沒有**被更新（內容還是核准當下的原樣），跟 `dev/progress.json` 的即時狀態是分開的兩份資料

---

跑完測試 9-17，Planning 軟停持久化、`/agent-work-team-resume`、`/agent-work-team-help`、token 重用防護、task-summary.md 就算完整驗證過了。同樣地，有任何一步跟預期不同，記下狀況回來討論。
