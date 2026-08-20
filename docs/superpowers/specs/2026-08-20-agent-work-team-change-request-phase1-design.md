---
title: 開發中需求變更 Phase 1：偵測、記錄與路由 Design
document_type: feature-design
status: Draft (not approved); implementation not started
created: 2026-08-20
updated: 2026-08-20
related:
  - docs/superpowers/specs/2026-08-20-agent-work-team-change-request-phase2-additive-design.md
  - docs/architecture/prompt-orchestration-determinism.md
---

# 開發中需求變更 Phase 1：偵測、記錄與路由 Design

## 背景與目的

目前 `plan-spec.json` 的 `task_breakdown` 在進入 Development 之後是**唯讀契約**：

- `commands/agent-work-team-develop.md` Step 3 只驗證格式，不對就要求重跑 Plan/SA/SD。
- `agents/agent-work-team-developer.md` 限制 Developer 只做單一 task、只改 `task.files`。
- 唯一的回頭修改入口是 `commands/agent-work-team-develop.md` Step 7 的「使用者提出修改意見」——那條迴路是為「**做錯了要修正**」設計的，不會新增 task、不會改 `plan-spec.json`。

因此使用者在 Development 期間提出需求變更時，實務上只剩三種做法：忍到最終審查用修正意見夾帶、手動編輯 `plan-spec.json`／`dev/progress.json`、或另開一個沒有任何關聯記錄的新需求。其中「手動編輯」是最危險的一種——它會讓磁碟上的 spec 與已完成 task 的實際產出**靜默不一致**，而現行流程沒有任何機制能偵測。

本 Phase 的目的**不是**讓變更能被自動套用，而是：

1. 讓「spec 被改過但 task 產出還是舊的」從靜默錯誤變成**可偵測、會擋下流程**的錯誤。
2. 讓每一次變更被**持久化記錄**，即使當下不套用。
3. 把使用者明確導向目前唯二安全的路徑（L1 修正意見／L3 開新需求）。
4. 累積實際資料，供 Phase 2 判斷是否值得點亮 `additive` 模式。

## 變更分級（本 Phase 建立的共同語彙）

| 級別 | 判準 | Phase 1 的合法路由 |
|---|---|---|
| L1 微調 | 不動任何 task 的 `acceptance_criteria`、不動 `files` | 走現行 `/agent-work-team-develop` Step 7 的修改意見迴路 |
| L2 修訂 | 需要改／增／刪 task，但 `requirement_summary` 本質不變 | Phase 1 **只記錄不套用**；提示使用者選擇降級為 L1 或升級為 L3 |
| L3 換需求 | 需求本體變了 | `/agent-work-team` 開新需求，兩邊以 `supersedes`／`superseded_by` 互相關聯 |

級別由使用者在 `/agent-work-team-change` 的互動中確認（見下），不由 Agent 單方面判定；但判定理由與最終級別一律寫進 CR 檔案。

## 範圍確認（避免歧義）

- Phase 1 **不修改** `plan-spec.json` 的 `task_breakdown`、不修改 `dev/progress.json` 的 `tasks` 陣列內容、不新增／不重設任何 task。
- Phase 1 **不新增任何 `current_stage` 值**，也不新增任何 stage 轉移。沿用既有設計哲學（見 Planning design 的「BLOCKED 不是 `current_stage` 的一個值」）。
- Phase 1 **不做**任何 Git 操作。
- `spec_version` 一致性檢查的行為一律是「**停下來告訴使用者**」，不自動修復、不自動同步。

## 架構決策

### 1. `plan-spec.json` 新增 `spec_version`

`plan-spec.json` 頂層新增整數欄位 `spec_version`，由 Plan/SA/SD 階段首次產出時寫入 `1`。

- 缺這個欄位的既有需求（本功能上線前建立）一律視為 `1`，不需要遷移，也不要自動補寫。
- Phase 1 沒有任何流程會把它加一——它在 Phase 1 是**純粹的一致性錨點**。Phase 2 才會有合法的遞增路徑。

### 2. `dev/progress.json` 的每個 task 新增 `spec_version`

`dev/progress.json` 的 `tasks` 陣列每一項新增整數欄位 `spec_version`，在該 task 被標記為 `"done"` 的當下，寫入當時 `plan-spec.json` 的 `spec_version`：

```json
{
  "base_branch": "feature/x",
  "tasks": [
    {"id": "T1", "status": "done", "spec_version": 1, "commits": ["<sha>"], "fix_rounds": 0, "needs_context_rounds": 0},
    {"id": "T2", "status": "pending", "spec_version": null, "commits": [], "fix_rounds": 0, "needs_context_rounds": 0}
  ],
  "final_review_fix_rounds": 0
}
```

- 尚未完成的 task 為 `null`。
- 缺這個欄位的既有 `progress.json` 一律視為 `1`（跟 §1 一致），不自動補寫。

### 3. `/agent-work-team-develop` Step 3 新增 `spec_version` 一致性檢查

在既有的 `task_breakdown` 格式驗證之後、Step 4 建立分支之前，新增一步（全新開始與恢復執行都要做）：

1. 讀取 `plan-spec.json.spec_version`（缺則視為 `1`）。
2. 讀取 `dev/progress.json`（若尚未建立則跳過本檢查，代表這是全新開始）。
3. 若存在任何 `status` 為 `"done"` 且 `spec_version` 小於 `plan-spec.json.spec_version` 的 task：**停止流程**，具體列出是哪些 task、它們是依哪一版 spec 完成的、目前 spec 是哪一版，請使用者人工確認要如何處理，不要自行猜測要不要重做。
4. 若存在 `status` 為 `"done"` 且 `spec_version` **大於** `plan-spec.json.spec_version` 的 task：同樣停止並警告——這代表 `plan-spec.json` 被回退或替換過，屬於資料損壞。

這個檢查刻意放在跟既有 `token` 一致性檢查同一類的位置與語氣：偵測到疑似不一致就停，把判斷交還給人。

### 4. 新 artifact：`changes/CR-{n}.json`

位置：`.agent-work-team/requests/{request_id}/changes/CR-{n}.json`，`{n}` 從 `1` 起遞增（掃描既有檔案取最大值 +1）。

```json
{
  "id": "CR-1",
  "request_id": "RQ-007",
  "token": "8f3a1c9d",
  "raised_at": "2026-08-20",
  "raised_during": { "current_stage": "DEVELOPING", "task": "T3" },
  "level": "L2",
  "level_reason": "需要新增一個 task 處理匯出格式，既有 task 的驗收標準不變",
  "description": "使用者原話的完整保留 + 整理後的變更敘述",
  "routing": "recorded_only",
  "resolution": null
}
```

- `token` 沿用既有的重用防護慣例：寫入時從 `state.json.token` 帶入。
- `routing` 在 Phase 1 只有 `"recorded_only"` 一個值；Phase 2 會新增其他值。
- `resolution` 由使用者後續回報（`"handled_as_l1"`／`"handled_as_l3"`／`"dropped"`／`null`），可以留空——**它是分析用資料，不驅動任何流程**。
- CR 檔案是 append-only 的記錄，任何流程都不得依它自動改動 `plan-spec.json` 或 `dev/progress.json`。

### 5. `planning/dev-config.json` 新增 `change_policy`

沿用 `commit_mode` 的既有形狀（同一個檔案、同樣在 Spec 核准關卡決定、同樣支援既有需求補選）：

```json
{ "commit_mode": "per_task", "change_policy": "record_only" }
```

- Phase 1 只實作 `"record_only"`，且它是**預設值**。
- 缺這個欄位時一律視為 `"record_only"`，**不要**為了它去打斷既有需求（跟缺 `commit_mode` 時停下來詢問不同——`commit_mode` 沒有安全預設，`change_policy` 有）。
- Spec 核准關卡不需要為 Phase 1 多問一題；`change_policy` 在 Phase 1 是給 Phase 2 預留的欄位，只有在 Phase 2 上線後才會有第二個合法值可選。

### 6. 新 command：`/agent-work-team-change <RQ-ID>`

刻意做成獨立 command，不塞進 `/agent-work-team-develop`。理由：

- 變更常常在沒有 develop session 在跑的時候才被想到，這跟 `/agent-work-team-resume` 存在的理由相同。
- `commands/agent-work-team-develop.md` 已接近 100 行，再增加分支只會加劇 `docs/architecture/prompt-orchestration-determinism.md` §1 描述的問題。

流程：

1. 解析 `<RQ-ID>`（未提供時比照 develop 的掃描規則挑最近在途的需求），讀取 `state.json`。
2. **token 一致性檢查**：比對 `state.json.token` 與 `pm-triage.json.token`，不一致就停止並警告（與既有指令同一套規則）。
3. 依 `current_stage` 判斷：
   - `CREATED`／`PM_TRIAGE`／`BA_CLARIFYING`／`SPEC_DRAFTING`／`PENDING_SPEC_APPROVAL`：告訴使用者這個需求還在 Planning，直接用 `/agent-work-team-resume` 修改需求即可，不需要 CR，然後停止。
   - `SPEC_APPROVED`／`DEVELOPING`／`TESTING`／`PENDING_FINAL_APPROVAL`：正常受理。
   - `DEV_APPROVED`／`DONE`：告訴使用者這個需求已經完成，變更請用 `/agent-work-team` 開新需求（並在新需求記錄 `supersedes`），然後停止。
4. 用 AskUserQuestion 讓使用者確認級別（L1／L2／L3 三個選項，附各自的判準說明），不要用純文字問以免拿到無法對應的模糊回答。
5. 不論級別，一律用 Write 建立 `changes/CR-{n}.json`。
6. 依級別給出路由指示，然後**停止**：
   - L1：告訴使用者直接回到 `/agent-work-team-develop {RQ-ID}`，在最終審查關卡以修改意見提出。
   - L2：明確說明目前 Phase 1 不會套用這個變更，請使用者選擇「拆成不影響既有 task 的 L1 修正」或「用 `/agent-work-team` 開新需求」；並提醒**不要手動編輯 `plan-spec.json`**（若手動編輯，Step 3 的 `spec_version` 檢查只有在 `spec_version` 也被改動時才擋得住）。
   - L3：指示使用者執行 `/agent-work-team "<新需求描述>"`，並在建立後回填關聯（見 §7）。
7. 這個 command **不修改** `state.json` 的 `current_stage`／`progress`／`status`。理由：Phase 1 不套用變更，流程實際上沒有停在等待 CR；把 `status` 改成 `Pending Confirmation` 會讓 dashboard 顯示一個 `/agent-work-team-resume` 接不回去的假軟停。

### 7. `state.json` 新增 `supersedes` / `superseded_by`

兩個欄位皆為 `string | null`，預設 `null`：

- 新需求的 `supersedes` 記錄它取代的舊 `RQ-ID`。
- 舊需求的 `superseded_by` 記錄取代它的新 `RQ-ID`。
- 兩邊必須同時寫入（由 `/agent-work-team` 在使用者聲明「這個需求取代 RQ-x」時一併完成）。
- 被取代**不改變**舊需求的 `current_stage`／`progress`；它只是關聯資訊。舊需求要不要繼續開發、要不要放棄，由使用者自行決定。

`hooks/sync-dashboard.mjs` 是否顯示這個關聯屬於選配：dashboard 目前的渲染是逐欄位取值，新增欄位不會使它出錯。若要顯示，加在需求名稱後面的括號註記即可，不要新增欄位造成表格變寬。

### 8. `/agent-work-team-help` 與 `/agent-work-team-resume` 的最小調整

- `help`：在指令列表新增 `/agent-work-team-change`；在說明中補一段「開發中需求變更的三種級別與各自路由」。
- `resume`：在列出在途需求時，若該需求的 `changes/` 底下存在 `resolution` 為 `null` 的 CR，於該需求的說明後面附註「有 N 筆尚未結案的變更記錄」。**只顯示，不改變 resume 的任何分支邏輯。**

## 不受影響的部分

- `agents/agent-work-team-developer.md`、`agents/agent-work-team-reviewer.md`、`agents/agent-work-team-plan-sd.md` 的 prompt 與契約完全不變。
- `hooks/` 不需要修改。
- Development 的 resume 判斷邏輯、Blocked 門檻、commit range 計算、`commit_mode` 行為皆不變。
- 既有需求（沒有 `spec_version`／`change_policy`／`supersedes` 的）在所有既有流程中的行為完全不變。

## 邊界與非目標

- 不套用任何 L2 變更（那是 Phase 2 與後續 core 的範圍）。
- 不做 CR 的核准關卡、不做影響評估 dispatch、不做 task disposition。
- 不偵測「使用者手動編輯 `plan-spec.json` 但沒改 `spec_version`」——本設計只保證「宣告過的版本差異」會被擋下，不做內容 hash。內容 hash 屬於 `docs/architecture/prompt-orchestration-determinism.md` §7／§8 的 artifact hash 範圍，留給 core。
- 不做 CR 的巢狀、並行或跨需求引用。
- 不做自動 merge、不做 Git 反向操作。

## 與 Phase 2 的關係

Phase 1 刻意讓所有新增的資料契約在 Phase 2 可以原樣沿用，不需要改寫：

| Phase 1 建立 | Phase 2 如何使用 |
|---|---|
| `plan-spec.json.spec_version` | Phase 2 是第一個會讓它遞增的流程 |
| `dev/progress.json` 每個 task 的 `spec_version` | Phase 2 用它區分「舊版完成」與「新版新增」的 task |
| `changes/CR-{n}.json` | Phase 2 沿用同一份 schema，只新增 `tasks_added`／`approval` 欄位與新的 `routing` 值 |
| `dev-config.json.change_policy` | Phase 2 點亮 `"additive"` 這個值 |
| `/agent-work-team-change` | Phase 2 在同一個 command 內新增 additive 分支，不另開指令 |

**Phase 2 是否實作，取決於 Phase 1 累積的 CR 記錄**：若實際資料顯示 L2 變更罕見、或多數 L2 其實可拆成 L1，就不需要 Phase 2。詳見 `docs/superpowers/specs/2026-08-20-agent-work-team-change-request-phase2-additive-design.md`。

## 待實作時一併處理

依 `CLAUDE.md` 的「Prompt 編排確定性協作」規範，本設計新增 artifact（`changes/CR-{n}.json`）、新增 command，並修改 `/agent-work-team-develop` 的驗證行為。實作階段（而非本 spec 階段）必須同步更新 `docs/architecture/prompt-orchestration-determinism.md`：

- `updated`／`last_verified_against_code` metadata。
- §7 Artifact 驗證原則：把 change request 加入需要 versioned schema 的清單。
- Implementation Mapping 新增：`spec_version` 一致性檢查的 current owner（Controller Prompt，與既有 token 檢查同層級）。
- Verification Evidence：記錄下方驗證方式實際跑過的結果。
- `DET-Q9`（開發中需求變更如何落地）維持 `Open`／`Proposed`，**不得**因為本 spec 寫完就標成 `Approved`。

## 驗證方式

實作完成後至少手動驗證：

1. 全新需求跑完 Planning，確認 `plan-spec.json` 含 `spec_version: 1`。
2. Development 跑完至少一個 task，確認該 task 在 `dev/progress.json` 的 `spec_version` 被寫成 `1`。
3. 手動把 `plan-spec.json.spec_version` 改成 `2`，重跑 `/agent-work-team-develop {RQ-ID}`，確認在 Step 3 被擋下、訊息具體指出是哪些 done 的 task 屬於舊版，且**沒有**任何檔案被自動修改。
4. 把 `spec_version` 改回 `1`，確認流程恢復正常、可以接續。
5. 對一個 `DEVELOPING` 中的需求執行 `/agent-work-team-change`，分別選 L1／L2／L3，確認：CR 檔案正確產生且 `token` 與 `state.json` 一致；三種級別給出的路由訊息正確；`state.json` 完全沒有被修改；dashboard 沒有出現假的軟停。
6. 對一個 `PENDING_SPEC_APPROVAL` 的需求執行 `/agent-work-team-change`，確認被導向 `/agent-work-team-resume` 且不建立 CR。
7. 對一個 `DEV_APPROVED` 的需求執行 `/agent-work-team-change`，確認被導向開新需求。
8. 用 `/agent-work-team` 開一個聲明取代舊需求的新需求，確認兩邊的 `supersedes`／`superseded_by` 都被寫入，且舊需求的 `current_stage`／`progress` 沒有被更動。
9. 對存在未結案 CR 的需求執行 `/agent-work-team-resume`，確認附註正確顯示，且 resume 的接續行為與沒有 CR 時完全相同。
10. 既有需求回歸：對一個沒有 `spec_version`／`change_policy` 的需求跑一次完整 Development，確認行為與本功能上線前一致，且不會被要求補選 `change_policy`。
