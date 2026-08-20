---
title: 開發中需求變更 Phase 2：additive 變更套用 Design
document_type: feature-design
status: Draft (not approved); gated on Phase 1 evidence; implementation not started
created: 2026-08-20
updated: 2026-08-20
depends_on:
  - docs/superpowers/specs/2026-08-20-agent-work-team-change-request-phase1-design.md
related:
  - docs/architecture/prompt-orchestration-determinism.md
  - docs/superpowers/specs/2026-08-07-agent-work-team-develop-commit-mode-design.md
---

# 開發中需求變更 Phase 2：additive 變更套用 Design

## 前提與啟動條件

本設計**依賴** `docs/superpowers/specs/2026-08-20-agent-work-team-change-request-phase1-design.md` 已完整實作。Phase 1 建立的 `spec_version`、`changes/CR-{n}.json`、`dev-config.json.change_policy`、`/agent-work-team-change` 在此原樣沿用，不重新設計。

**Phase 2 不應在 Phase 1 上線後立即實作。** 啟動條件是 Phase 1 累積的 CR 記錄顯示：

- L2 變更確實反覆發生（不是一兩次的偶發），且
- 其中相當比例的 `level_reason` 屬於「只需要新增 task、既有 task 的驗收標準不變」。

若資料顯示多數 L2 其實可拆成 L1，或 L2 罕見到開新需求（L3）就足夠，**應主動決定不實作 Phase 2**，並在 `DET-Q9` 記錄這個結論。變更頻率因專案而異，所以這個判斷必須逐專案由實際記錄支持，不能靠推測。

## 為什麼只做 additive

完整的變更機制需要三種 task disposition：`added`、`modified`、`dropped`。三者的風險完全不對稱：

| disposition | 需要什麼 | 現行框架能不能安全做 |
|---|---|---|
| `added` | 只是把新 task 接在後面 | **能**——不需要失效判定、不需要 Git 反向操作、不動任何已完成的產出 |
| `modified` | 判定哪些已完成的產出失效、決定重做範圍 | 不能——這是 `LIM-01`／`LIM-03` 的核心，屬於 host-neutral core |
| `dropped` | 移除已 commit 的程式碼、處理歷史 | 不能——這是 `LIM-02` Git 副作用保護的範圍 |

`added` 的風險與變更頻率無關（它不會因為變更變多而變危險），所以它是唯一適合在現行 prompt 編排框架下實作的部分。`modified`／`dropped` 一律留給 core，Phase 2 遇到就退回 Phase 1 的路由。

## 範圍確認（避免歧義）

- Phase 2 只新增 task，**永遠不修改、不刪除、不重設**任何既有 task。
- Phase 2 **不新增任何 `current_stage` 值**。核准關卡沿用既有的 `status: "Pending Approval"` + `waiting_on: "Human Review"`，權威記錄放在 CR 檔案的 `approval`。理由與「BLOCKED 不是 `current_stage` 的一個值」相同：不要用新 stage 蓋掉需求實際停在哪一步。
- Phase 2 **不做任何 Git 操作**。新 task 的 commit 由既有的 Development 流程在後續 `/agent-work-team-develop` 中產生。
- 一個需求同時**最多只能有一個** `approval.state` 為 `"pending"` 的 CR。

## 架構決策

### 1. `dev-config.json.change_policy` 點亮 `"additive"`

```json
{ "commit_mode": "per_task", "change_policy": "record_only" | "additive" }
```

- 預設仍是 `"record_only"`。
- Spec 核准關卡（`commands/agent-work-team.md` 的 Human Approval Gate，與 `commit_mode` 同一步）新增一個選項讓使用者選擇這個需求的 `change_policy`。既有需求缺這個欄位時**不打斷流程**，一律當 `"record_only"`（與 Phase 1 一致）。
- 允許在 `/agent-work-team-change` 內經使用者明確確認後改寫這個欄位（例如原本選 `record_only`，開發到一半決定要接受 additive 變更）。改寫是安全的，因為它不影響任何已完成的產出；但必須是使用者主動選擇，Controller 不得自行升級。

### 2. `/agent-work-team-change` 新增 additive 分支

Phase 1 的 Step 1–4（解析 RQ-ID、token 檢查、`current_stage` 分流、級別確認）完全不變。差異從級別確認之後開始：

- 級別是 L1 或 L3：行為與 Phase 1 完全相同。
- 級別是 L2 **且** `change_policy` 是 `"additive"`：進入下面的 additive 流程。
- 級別是 L2 **且** `change_policy` 是 `"record_only"`：行為與 Phase 1 完全相同（只記錄並路由），但額外告知使用者可以改用 additive（見 §1）。

進入 additive 流程前，先檢查是否已存在 `approval.state` 為 `"pending"` 的 CR。若有：告訴使用者哪一筆還沒結案、請先處理完，然後停止。

### 3. 可行性判定與提案交給 Plan/SA/SD Agent，寫入 staging

用 Agent 工具 dispatch `agent-work-team-plan-sd`，在 prompt 裡提供 `request_id`、`output_dir`、完整的 `plan-spec.json`、完整的 `dev/progress.json`、以及本次 CR 的 `description`。要求它把結果寫進 **staging 檔案** `changes/CR-{n}-proposal.json`：

```json
{
  "cr_id": "CR-1",
  "verdict": "ADDITIVE_OK",
  "verdict_reason": "既有 T1–T5 的 acceptance_criteria 與 files 都不受影響，只需新增匯出格式處理",
  "tasks_added": [
    {
      "id": "T6",
      "description": "...",
      "files": ["src/export/csv.ts"],
      "acceptance_criteria": "..."
    }
  ],
  "technical_design_delta": "接續既有設計的補充說明，不重寫原本的 technical_design"
}
```

`verdict` 只有兩個合法值：

- `"ADDITIVE_OK"`：本次變更可以只靠新增 task 達成。
- `"NOT_ADDITIVE"`：需要修改或刪除既有 task。此時 `tasks_added` 必須為空、`verdict_reason` 必須具體說明是哪個既有 task 受影響。

Agent **只寫 staging 檔案**，不得改動 `plan-spec.json`、`dev/progress.json` 或 `state.json`。這與 `docs/architecture/prompt-orchestration-determinism.md` §9 的「staging 不是正式 artifact」一致。

拿到 `NOT_ADDITIVE` 時：Controller 把理由完整呈現給使用者，CR 的 `routing` 寫成 `"not_additive_rejected"`，並依 Phase 1 的方式路由到 L1／L3，然後停止。

### 4. Controller 驗證 staging（Agent 說可以不等於可以）

套用前 Controller 必須逐項檢查，任何一項不過就停止並告知，不得嘗試自動修正：

1. `tasks_added` 非空，且每一項都有 `id`、`description`、`files`（非空陣列）、`acceptance_criteria`——與 `/agent-work-team-develop` Step 3 同一套格式要求。
2. 每個新 `id` 都**沒有**在 `plan-spec.json.task_breakdown` 或 `dev/progress.json.tasks` 出現過。task id 在一個需求的整個生命週期內不重用。
3. `tasks_added` 內部的 `id` 彼此不重複。
4. staging 沒有夾帶任何既有 task 的修改（比對 `plan-spec.json.task_breakdown` 中既有項目應完全一致）。
5. `cr_id` 與本次處理的 CR 相符。

### 5. 人工核准關卡

驗證通過後：

1. 用 Write 更新 `state.json`：`status: "Pending Approval"`、`waiting_on: "Human Review"`。**`current_stage` 與 `progress` 一律不動。**
2. 明確請使用者開啟 `changes/CR-{n}-proposal.json` 確認新增的 task 內容，並說明核准後會發生什麼（spec 版本加一、新 task 進入待開發、若已在最終審查階段會退回開發階段）。
3. 使用者 approve：更新 CR 的 `approval`（`state: "approved"`、`at`），繼續 §6 的套用。
4. 使用者提出修改意見：把意見整理後重新 dispatch §3，覆寫 staging，再回到本步驟。
5. 使用者拒絕：CR 的 `approval.state` 寫成 `"rejected"`、`routing` 寫成 `"rejected"`，把 `state.json` 的 `status` 改回 `"Running"`、`waiting_on: null`，**不刪除** staging 檔案（保留記錄），然後停止。

### 6. 套用順序（Controller 直接執行，不經 Agent）

刻意採 `docs/architecture/prompt-orchestration-determinism.md` §9 的順序，權威 state 最後才動：

1. **`plan-spec.json`**：`spec_version` 加一；`task_breakdown` 後面 append `tasks_added`；`technical_design` 後面 append `technical_design_delta`（標明來自哪一筆 CR）。既有內容一律不改寫。
2. **`dev/progress.json`**：append 新 task 物件（`status: "pending"`、`spec_version: null`、`commits: []`、`fix_rounds: 0`、`needs_context_rounds: 0`）。
3. **既有 done task 的 `spec_version` 一併提升**到新的 `spec_version`，並在 CR 記錄 `carried_over_tasks`。

   這一步是 Phase 1 與 Phase 2 的關鍵銜接：Phase 1 的一致性檢查會把「done task 的 `spec_version` 低於 spec 目前版本」判定為錯誤並擋下流程。additive 的定義就是既有 task 不受影響，而且這件事已經過 §4 的機械驗證與 §5 的人工核准，所以此處提升版本是**有依據的宣告**，不是繞過檢查。反過來說，任何**沒有**經過這條路徑產生的版本落差，仍然會被 Phase 1 的檢查擋下——檢查的語意（「有人在流程外改過 spec」）維持不變。
4. **`task-summary.md`**：重新生成，標註目前的 `spec_version` 與造成變更的 CR id。這份檔案是快照，過期的快照比沒有快照更糟。
5. **既有最終審查結果失效處理**：若 `dev/final-review.md`／`.json` 存在，改名為 `dev/final-review-spec{舊版本號}.md`／`.json` 保存，避免使用者看到一份不涵蓋新 task 的過期審查。
6. **`state.json`**（最後才動）：
   - `current_stage` 是 `SPEC_APPROVED`（還沒開始開發）：只把 `status` 改回 `"Running"`、`waiting_on: null`，`current_stage`／`progress` 不動。
   - `current_stage` 是 `DEVELOPING`：同上，不動 `current_stage`／`progress`。
   - `current_stage` 是 `TESTING` 或 `PENDING_FINAL_APPROVAL`：退回 `current_stage: "DEVELOPING"`、`progress: 70`、`status: "Running"`、`waiting_on: null`，並把 `dev/progress.json` 的 `final_review_fix_rounds` 重設為 `0`。理由：新 task 尚未實作，最終審查必須重跑。
7. **CR 定案**：`routing: "applied_additive"`、`tasks_added`（實際套用的 id 陣列）、`carried_over_tasks`、`spec_version_before`／`spec_version_after`、`resolution: "applied"`。
8. 告訴使用者套用完成，請執行 `/agent-work-team-develop {RQ-ID}` 續接——新 task 是 `pending`，既有的 resume 邏輯會自然撿起來。**本 command 不自動啟動 Development。**

### 7. 中斷與冪等

套用過程若中斷，重跑 `/agent-work-team-change` 時依下列順序判斷，不重複套用：

- CR 的 `approval.state` 是 `"approved"` 但 `routing` 還不是 `"applied_additive"`：代表套用中斷。逐項比對 `plan-spec.json.spec_version` 是否已遞增、`task_breakdown`／`progress.json` 是否已含新 task，**只補做缺的部分**，然後完成 §6 第 7 點。
- CR 的 `routing` 已是 `"applied_additive"`：告訴使用者這筆 CR 已套用完成，不重做。
- CR 的 `approval.state` 是 `"pending"`：回到 §5 的核准關卡等待。

### 8. 與正在執行的 Development 的關係

`/agent-work-team-change` 與 `/agent-work-team-develop` 是兩個獨立 command，不會同時執行，所以**變更天然只在 task 邊界之外套用**——不需要設計中斷 dispatch 中的 Developer subagent 的機制。

若使用者在 develop 執行到一半想提變更：正確做法是讓目前這個 task 跑完（或按既有方式停下），再執行 `/agent-work-team-change`。這一點要寫進 command 的說明與 `/agent-work-team-help`。

### 9. 與 `commit_mode` 的關係

- `per_task`：新 task 的 commit 與既有 task 完全相同，無差異。
- `squash`：squash 只在最終核准那一刻執行（見 commit-mode design），而 Phase 2 只受理 `DEV_APPROVED` 之前的需求，因此套用 CR 時 squash 必然尚未發生，無交互作用。
- `DEV_APPROVED` 之後（squash 已執行、需求已完成）一律不受理 CR，導向開新需求——與 Phase 1 相同。

## 不受影響的部分

- `agents/agent-work-team-developer.md`、`agents/agent-work-team-reviewer.md` 的 prompt 與契約不變。
- `agents/agent-work-team-plan-sd.md` 新增一種被呼叫的情境（additive 提案），但既有的 spec 產出情境不變。
- `hooks/` 不需要修改。
- `/agent-work-team-develop` 除了 Phase 1 已加入的 `spec_version` 檢查之外，不需要為 Phase 2 再改任何邏輯——新 task 是 `pending`，既有 resume 規則已涵蓋。

## 邊界與非目標

- 不支援 `modified`／`dropped` disposition（見「為什麼只做 additive」）。
- 不做已完成產出的失效判定。
- 不做 Git revert、reset、rebase 或任何歷史改寫。
- 不做 CR 的巢狀、並行（同時只允許一筆 pending）或跨需求引用。
- 不做 `plan-spec.json` 的內容 hash 驗證（屬 core 的 artifact hash 範圍）。
- 不自動啟動 Development、不自動 merge。
- 不因為套用 CR 而改變 Knowledge 階段的任何行為。

## 待實作時一併處理

依 `CLAUDE.md` 的「Prompt 編排確定性協作」規範，本設計新增一個人工核准關卡、一種 Agent dispatch 情境、以及 Controller 對權威 artifact 的直接寫入。實作階段必須同步更新 `docs/architecture/prompt-orchestration-determinism.md`：

- `updated`／`last_verified_against_code` metadata。
- §6 狀態轉移表：新增 additive 變更相關的 event 候選（`CHANGE_REQUESTED`／`CHANGE_PROPOSED`／`CHANGE_APPROVED`／`CHANGE_REJECTED`／`CHANGE_APPLIED`），並標明它們在現行 prompt 編排下由 Controller 承擔，屬於 core 落地時要接管的範圍。
- §7 Artifact 驗證原則：新增 CR proposal 的語意規則（task id 不重用、既有 task 不得被夾帶修改）。
- Implementation Mapping 與 Verification Evidence。
- `DET-Q9` 依實際決策更新；**不得**在使用者未明確核准前標成 `Approved`。

## 驗證方式

實作完成後至少手動驗證：

1. `change_policy: "additive"` 的需求，在 `DEVELOPING` 中提出一個純新增的 L2 變更：確認 staging 產出、核准關卡出現、`state.json` 的 `current_stage`／`progress` 在核准前後都沒有被誤改。
2. 核准後確認：`plan-spec.json.spec_version` 由 1 變 2、`task_breakdown` 只有 append、既有項目一字未改；`dev/progress.json` 新增 pending task；既有 done task 的 `spec_version` 被提升到 2；`task-summary.md` 重新生成並標註 CR id。
3. 接著執行 `/agent-work-team-develop {RQ-ID}`：確認 Phase 1 的 `spec_version` 檢查**不會**誤擋，且流程直接接續新 task，既有 done task 沒有被重做。
4. 在 `PENDING_FINAL_APPROVAL` 階段套用 additive CR：確認退回 `DEVELOPING`／`progress: 70`、`final_review_fix_rounds` 歸零、既有 `final-review.md` 被改名保存；重跑 develop 後最終審查涵蓋新 task。
5. 提出一個需要修改既有 task 的變更：確認 Plan/SA/SD 回報 `NOT_ADDITIVE`、Controller 停止並路由到 L1／L3、**沒有任何檔案被套用**。
6. 人為竄改 staging（例如新 task 的 id 用既有的 `T1`、或夾帶修改既有 task）：確認 §4 的驗證擋下並停止。
7. 存在一筆 pending CR 時再執行 `/agent-work-team-change`：確認被拒絕並指出未結案的那一筆。
8. 核准後在套用中途中斷（例如只寫完 `plan-spec.json`），重跑 `/agent-work-team-change`：確認只補做缺的部分、不重複 append、不重複遞增 `spec_version`。
9. 使用者在核准關卡拒絕：確認 `state.json` 的 `status` 回到 `"Running"`、沒有任何 artifact 被套用、staging 檔案仍保留。
10. `change_policy: "record_only"` 的需求提出 L2 變更：確認行為與 Phase 1 完全相同，且有提示可改用 additive。
11. 既有需求回歸：沒有 `change_policy` 的需求，所有既有流程行為不變。
