# Agent Work Team — Planning 軟停持久化 + Resume/Help Design

## 背景與目的

`/agent-work-team`（Planning 入口）與 Development／Knowledge 兩個階段不一樣：後兩者已經能從磁碟續接（`current_stage` + `dev/progress.json` 驅動 fresh vs resume 判斷），但 Planning 完全不讀既有狀態——每次執行都用 `ls | sort -n | tail` 算出全新的 `RQ-###`（`commands/agent-work-team.md` Step 1），而且 BA 澄清是主線程即時對話，問答只存在 session context 裡，直到使用者核准整段摘要才落地成 `ba-requirement.json`。

實際踩到的情境：Planning 跑到「工具丟出尚未確認的內容、軟停等使用者確認」時，session 意外找不到，導致那段討論無法接續，只能想辦法翻回原本的 session。本次設計解決這個問題，並補上一個統一的「在途清單」入口。

**目標成果：**
1. Planning 的軟停點（BA 提問、需求摘要確認、Spec 核准）內容**即時寫進磁碟**，任何全新 session 都能還原「停在哪、為什麼停、有哪些待確認問題」。
2. 軟停有自己專屬的狀態碼，跟 `Running`／`Blocked` 區分。
3. `/agent-work-team-resume`：列出所有在途／停住的需求、各自停住原因與待確認問題，讓使用者挑一個接續；Dev/Knowledge 需求導向對應指令。
4. `/agent-work-team-help`：一次說明工具所有 command 與各自功能。
5. `/agent-work-team` 維持「只開新需求」不變。
6. 順帶處理既有的 `RQ-ID` 重用風險：`ls | sort -n | tail` 取最大號 +1，若編號最高的資料夾被刪除，下一個需求會重用同一個編號，可能撞到仍被引用的舊分支或舊 checkpoint。

本次**不改** Development／Knowledge 既有的續接邏輯（`commands/agent-work-team-develop.md` / `commands/agent-work-team-knowledge.md` 的 fresh-vs-resume 判斷本來就正確），只在它們用到既有分支的地方加一道 token 檢查（見下）。

## 狀態碼：新增 `"Pending Confirmation"`

`state.json.status` 原本是 `Running | Pending Approval | Blocked | Approved`（Development/Knowledge 另加 `Completed`）。新增第六種：

| status | 語意 | waiting_on |
|---|---|---|
| `Running` | Controller 正在處理 / subagent 執行中 | `null` |
| **`Pending Confirmation`（新）** | 一段**即時對話**暫停，等使用者回答或確認；沒有成品產出 | `"Human"` |
| `Pending Approval`（不變） | 已有成品在磁碟、等正式關卡簽核 | `"Human Review"` |
| `Blocked`（不變） | agent 放棄 / 重試上限 | `"Human"` |

**為何不共用 `Pending Approval`：** 軟停要能顯示「待確認問題」並重新進入一段即時對話，行為上不同於「開啟成品檔案 → approve」。三個正式關卡（`PENDING_SPEC_APPROVAL` 及 Dev/Knowledge 的對應關卡）維持用 `Pending Approval`，保留既有語意與續接路徑。

**Freeze 語意（比照既有的 `Blocked` 規則）：** 軟停時 `current_stage`／`progress`／`current_agent` 全部凍結在卡住當下的值，只改 `status`／`waiting_on`。

## `planning/checkpoint.json`：Planning 的持久化 checkpoint

路徑：`.agent-work-team/requests/RQ-NNN/planning/checkpoint.json`（`planning/` 子資料夾比照既有 `dev/` 慣例）。

```json
{
  "id": "RQ-001",
  "token": "8f3a1c9d",
  "sub_step": "BA_CLARIFYING",
  "pending": {
    "kind": "question",
    "prompt": "<問題原文，或 summary_confirmation 時的完整需求摘要 + AC，或 spec_approval 時固定文案>",
    "options": ["<AskUserQuestion 選項>"],
    "artifact": ".agent-work-team/requests/RQ-001/plan-spec.md"
  },
  "clarification_log": [
    {"question": "…", "answer": "…"}
  ],
  "reason": "<給 resume 清單看的一行『為什麼停』>",
  "updated": "2026-07-15"
}
```

- `pending.kind`：`"question"`（BA 逐題提問）| `"summary_confirmation"`（BA 摘要確認）| `"spec_approval"`（Spec 核准關卡）。`spec_approval` 時額外帶 `artifact`（要請使用者去看的檔案路徑），`pending` 為 `null` 時代表 Controller 正在處理、沒有東西在等回覆。
- `clarification_log`：最終會被複製進 `ba-requirement.json` 的同一份陣列，差別是**每問完一組就增量寫入**——這是修復「BA 問答只活在 session 裡」的核心。
- `reason`：一行人類可讀的「為什麼停」，`Pending Confirmation` 軟停與 `Blocked`（PM/Plan-SD 主動放棄）兩種情況都會寫這個欄位，讓 `/agent-work-team-resume` 不必分兩套邏輯讀取原因。
- **checkpoint 永不驅動 progress／routing**：`state.json.current_stage` 才是單一真實來源，checkpoint 只補「停住細節」。`sub_step` 應等於 `current_stage`（僅供人類核對，不被程式邏輯依賴）。
- 檔案在需求走完 Planning（`SPEC_APPROVED`）後**保留**，作為稽核紀錄，不刪除。

### 寫入順序不變式

任何時候要同時更新 checkpoint 與 `state.json`（軟停、核准關卡、Blocked），一律**先寫 `planning/checkpoint.json`，再寫 `state.json`**。這確保 dashboard／resume 看到「狀態已暫停」的當下，durable 的細節一定已經落地；即使兩次寫入之間 session 中斷，`/agent-work-team-resume` 仍能以 `current_stage` 路由、用已經寫好的 `pending` 重放，不會出現「state 說在等回覆、但 checkpoint 是空的」這種不可解的中間態。

## `token`：RQ-ID 重用防護（nonce）

### 問題

`commands/agent-work-team.md` Step 1 用 `ls .agent-work-team/requests/RQ-* | sort -n | tail -1` 取現有最大編號 +1。若使用者刪除了編號最高的資料夾，下一個新需求會**重用**那個編號——但舊的 git 分支（`agent-work-team/RQ-NNN`）、舊的 wiki 條目、或（在本次修復前）舊的殘留 checkpoint 可能還在，會被誤認成新需求的一部分。

### 做法

每個需求在建立時（`agent-work-team.md` Step 1）用 Bash 產生一個隨機 `token`（`openssl rand -hex 4`，或退回 `printf '%04x%04x' $RANDOM $RANDOM`），寫進 `state.json.token`。這個 token 是該需求不可變的身分，之後每個階段的產出檔案都原樣帶著它：

- `state.json.token`（canonical）
- `pm-triage.json.token`（PM Agent 從 dispatch prompt 收到 `token` 後原樣寫入，見 `agents/agent-work-team-pm.md`）
- `planning/checkpoint.json.token`（Planning 軟停時寫入）

### 使用時機

- **`/agent-work-team-resume`**：續接前一律比對 `state.json.token` / `checkpoint.token` / `pm-triage.token`（存在者），任一不一致就停止並警告「疑似 RQ-ID 重用」，不自動修正、不自動刪除，交給人工判斷。
- **`/agent-work-team-develop`**：Step 3 切換到既有分支 `agent-work-team/{id}` 之前，先比對 `state.json.token` 與 `pm-triage.json.token`；不一致就拒絕切換並警告。Step 1 額外做一次一致性檢查（`state.json.token` vs `pm-triage.json.token`），涵蓋還沒有分支存在的情況。
- **`/agent-work-team-knowledge`**：Step 1 找到 `request_id` 後做同樣的一致性檢查（Knowledge 階段的 subagent 在目前所在分支 commit，不自己 checkout 特定分支，所以檢查放在 Step 1 而不是分支切換點）。

### 已知殘留限制

token 能擋下「舊 checkpoint／舊分支殘留，但 `state.json`／`pm-triage.json` 已經是新需求」這類不一致；但若整個資料夾被刪除後、同一個 id 全新重建（`state.json` 與 `pm-triage.json` 同時是新 token，彼此一致），token 機制無從偵測——不過這種情況本身也沒有殘留檔案會污染新需求，唯一剩下的風險是舊的 git 分支 `agent-work-team/RQ-NNN` 仍然存在，且新需求剛好也走到要用同名分支的那一步（此時 token 比對會抓到：新 `state.json`/`pm-triage.json` 的 token 一致，但分支本身的存在不會被誤判為「屬於新需求」，因為 checkout 前的比對比的是檔案 token 而非分支內容——若使用者手動確認分支內容跟新需求無關，應先手動刪除或改名該分支）。

**完整根治（本次未做，列為可選的後續工作）：** 把 Step 1 的 ID 配置方式改成持久化單調計數器（例如 `.agent-work-team/.counter`），永不重用編號，從源頭消除重用可能性。

## `/agent-work-team-resume [RQ-ID]`

新增指令，完整流程見 `commands/agent-work-team-resume.md`。摘要：

1. **掃描分類**：**優先讀 `.agent-work-team/dashboard.md` 一次**（而不是逐一 Glob+Read 每個 `state.json`）解析表格，依 `current_stage` 分三類——Planning-owned（本指令處理）、Dev-owned（導向 `/agent-work-team-develop`）、Knowledge-owned（導向 `/agent-work-team-knowledge`）。`dashboard.md` 不存在時退回逐一 Glob+Read 的原始做法。
2. **呈現清單**：列出所有在途需求 + 一行具體原因（Planning 讀 checkpoint 的 `reason`/`pending.prompt`；`Blocked` 的項目不分階段都要顯示原因來源）。**不自動挑 `updated` 最新的**——使用者執行這個指令正是因為已經搞不清楚在途需求分佈在哪，需要看到全部自己選。
3. **token 把關 + 重新讀取權威狀態**：見上節與下方「為何只在列表步驟用 dashboard」。
4. **依 `current_stage` 續接**：路由用 Step 3 重新讀到的 `state.json.current_stage`（不是列表步驟從 dashboard 拿到的快取值）。`BA_CLARIFYING` 重放 `pending` 並接回 `agent-work-team.md` Step 3 的迴圈；`PENDING_SPEC_APPROVAL` 直接進 Step 5 核准關卡；`SPEC_DRAFTING`/`PM_TRIAGE` 卡在 subagent 尚未回報，提議重新 dispatch；`CREATED` 是 stranded 狀態（沒有 durable 進度可重放），提議重新開始或刪除。

### 為何只在列表步驟用 dashboard，選定之後仍讀權威來源

`dashboard.md` 是 hook 從所有 `state.json` 衍生出來的彙整表格，內容通常跟權威來源一致，拿來做「有哪些需求、大致在哪個階段」的粗分類可以省掉對每個需求都 Read 一次 `state.json` 的成本。但它有兩個限制：

1. **可能過期或不存在**：`dashboard.md` 可能被手動刪除、或因為某個 `state.json` 解析失敗而跳過該需求（`/agent-work-team-dashboard` 這個備援重建指令的存在，本身就是承認這種情況會發生）。
2. **不帶 `token`、不帶 `reason`/`pending` 細節**：這些欄位刻意沒有放進 dashboard（見下方「Hook 影響」），續接時本來就需要另外讀取。

因此設計上把 dashboard 的用途限定在 Step 1／2 的**列表呈現**；一旦使用者選定了要續接的需求，Step 3 會重新完整讀一次該需求的 `state.json`，Step 4 的路由判斷一律用這次重新讀到的值，不沿用列表階段的快取——安全性與正確性判斷永遠不依賴衍生產物。

## `/agent-work-team-help`

靜態指令，列出全部六個 command（`/agent-work-team`、`/agent-work-team-resume`、`/agent-work-team-develop`、`/agent-work-team-knowledge`、`/agent-work-team-dashboard`、`/agent-work-team-help`）與各自功能，附一份 `current_stage` 生命週期圖與 `status` 圖例。完整內容見 `commands/agent-work-team-help.md`。

## Hook 影響

- **`hooks/sync-dashboard.mjs`：不需改碼。** 它照 `status` 字串原樣渲染，`Pending Confirmation` 自動顯示。刻意不加「為什麼停」欄位到 dashboard 表格——那會逼 hook 去讀每個需求的 `planning/checkpoint.json`，擴大它的職責；原因細節留在 `/agent-work-team-resume` 裡呈現。
- **`hooks/enforce-block.mjs`：不需改碼。** 只綁定 `dev/progress.json` 的寫入，Planning 沒有 `fix_rounds` 這類計數器，不受影響。
- **`hooks/hooks.json`：不需改碼。** 既有 PostToolUse/Write 規則對 `planning/checkpoint.json` 這個新路徑，兩個 script 都會正確地判斷「與自己無關」而 no-op。
- **不新增 hook。** checkpoint 維持 prompt-driven（hook 無從得知對話中的待確認問題內容），跟 `ba-requirement.json`/`plan-spec.json` 的寫法一致。

## 驗證方式（prompt 驅動，手動）

見 `docs/manual-testing-checklist.md` 新增的「Planning 軟停 + Resume/Help + Token」段落。重點涵蓋：checkpoint 隨問答增量累積、`Pending Confirmation` 正確顯示於 dashboard、中途關閉 session 後用 `/agent-work-team-resume` 在全新 session 接回並重現待確認問題、`PENDING_SPEC_APPROVAL`/`Blocked`/`CREATED` 的續接分支、`/agent-work-team-help` 輸出、以及 token 不一致時 resume 正確拒絕續接。

## Out of scope

- Development／Knowledge 階段本身的續接邏輯（已存在、正確，不動）。
- RQ-ID 重用的完整根治（持久化單調計數器）——本次只用 token 偵測並擋下，不改變 ID 配置演算法本身。
- Dev/Knowledge 階段 `Blocked` 時的具體原因持久化到專屬欄位——這兩個階段已經有 `dev/{task.id}-review.md`／`final-review.md` 等既有報告檔案承載具體原因，`/agent-work-team-resume` 直接指向這些檔案，不重複建置。
