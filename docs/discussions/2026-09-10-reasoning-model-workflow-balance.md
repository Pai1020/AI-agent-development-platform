---
title: Reasoning Model 與確定性 Workflow 的衝突分析與平衡做法（討論稿）
document_type: discussion-issues
status: Open
created: 2026-09-10
updated: 2026-09-10
baseline: docs/architecture/prompt-orchestration-determinism.md
scope: commands/、agents/、evals/quality/
---

# Reasoning Model 與確定性 Workflow 的衝突分析與平衡做法（討論稿）

## 文件目的

記錄一次針對「現行 command／agent prompt 是否與 reasoning model 互相衝突」的分析，以及在
**「主力執行者是中低階模型」** 這個前提下的平衡建議，供後續逐項確認「採用、調整、延後或不處理」。

本文件**不是實作計畫，也不代表任何建議已獲核准**。與
`docs/architecture/prompt-orchestration-determinism.md` 的關係：該文件是 living document 且已有部分
`Approved` 決策；本文件只是討論輸入，不得據此變更該文件的 `decision_status`。

`docs/manual-testing-checklist.md` 已過時，不作為現況或驗證證據。

## 分析基準

- `commands/agent-work-team.md`、`commands/agent-work-team-develop.md`、`commands/agent-work-team-knowledge.md`
- `agents/agent-work-team-{pm,plan-sd,developer,reviewer,knowledge}.md`
- `docs/architecture/prompt-orchestration-determinism.md`（§1 問題陳述、§3 責任邊界、§5 單步 Agent 契約、
  §6 狀態轉移、§10 Prompt 版本化、§11 漸進順序、§17 DET-Q5）
- `evals/quality/`（cases.json、README.md）

---

## 第一部分：衝突分析

### 結論

不是「reasoning model 不能執行這些 prompt」，而是**這批 prompt 的核心假設是「模型逐字照做、不自行優化」，
而 reasoning model 的核心行為是「先規劃、再重排、能合併就合併」**。這正是 determinism 文件 §1 已指出的問題
（command Markdown 同時承擔 workflow engine 責任），reasoning model 只是把它放大。

加上「主力是中低階模型」的前提後，真正的問題變成**兩種相反的失敗模式必須用同一套設計涵蓋**：

- 高階／推理模型：**過度推理**——重排步驟、合併寫入、自行補齊脈絡、修正它認為不合理的常數。
- 中低階模型：**遵循不足**——漏步驟、schema 漂移、輸出契約不穩定。

### 衝突點清單

| # | 衝突點 | 位置 | 影響 | 目前是否有偵測機制 |
|---|---|---|---|---|
| C1 | 寫入順序不變式 vs. 平行工具呼叫 | `commands/agent-work-team.md:11` | resume 讀到比對話舊的狀態 | 無 |
| C2 | 「先落地再發問」vs. 動作壓縮 | `commands/agent-work-team.md:99` | 軟停持久化失效 | 無 |
| C3 | 「一次問一個問題」vs. AskUserQuestion 支援 1–4 題 | `commands/agent-work-team.md:99` | `clarification_log` 問答配對失準 | 無 |
| C4 | 固定數值欄位 vs. 模型「自我修正」 | 各 command 的 `progress`／`current_stage` | 狀態數值漂移 | 無 |
| C5 | 明確「停下來」vs. 續航傾向 | `agents/agent-work-team-developer.md`（`BLOCKED`／`NEEDS_CONTEXT`、只改 `task.files`） | 越權修改、該停未停 | 無 |
| C6 | 混合模型層級造成契約不對稱 | PM 為 `model: haiku`，其餘 `model: sonnet`，Controller 在主線程 | 行為差異無法歸因 | 無（§10 的 Model identity 尚未實作） |
| C7 | 外層指令與 pipeline 競合 | SessionStart 注入的 superpowers「創造性工作前先 brainstorming」vs. 自有 BA 澄清流程 | 重複的需求釐清程序 | 無 |

**C1 詳述**：`commands/agent-work-team.md:11` 要求「先寫 checkpoint，再寫 state.json」，但 harness 本身鼓勵
「無相依的呼叫放同一個 block 平行執行」。reasoning model 在規劃階段很容易判定這兩個 Write 彼此獨立而合併發出，
順序保證即失效。這條不變式完全依賴自然語言，且違反時無任何偵測。

### 不衝突、甚至受益的部分

- `agents/agent-work-team-reviewer.md`：「不要照單全收 Developer 報告，自己讀 diff 驗證」、依嚴重度分類——
  屬判斷型工作，推理能力越強越好。
- Plan/SA/SD 的技術設計與 task 拆解、Knowledge Agent 的知識歸納，同理。

---

## 第二部分：平衡建議

### 核心原則

把設計基準從「模型會照做」換成**「假設執行者既可能過度推理、也可能能力不足」**。兩種失敗的解法是同一個：
**凡是不需要判斷的事，都不要交給模型**。步驟從 prompt 移進程式，兩種失敗同時消失。

以中低階模型為主力的取捨原則：**省在「格式化與狀態維護」，不省在「審查與設計」。**

### 建議項目（依投入／效益排序）

#### A. 消滅雙寫順序

**問題**：C1、C4。

兩個做法二選一：

1. **單一事實來源**：`state.json` 的 `current_stage`／`status`／`progress` 全部由 checkpoint 的 `sub_step`
   查表推導，模型只寫 checkpoint 一個檔案，`state.json` 由 hook 或腳本重新生成（比照 `dashboard.md` 現行做法）。
   順序問題直接消失。
2. 保留兩個檔案，但提供一支 `pwsh` 腳本做原子寫入；prompt 從「先寫 A 再寫 B」改成「執行這一行指令」。

同時把 `progress: 10/20/30/40/50` 這類常數移出 prompt——低階模型會填錯，高階模型會「合理化」地調整。

**待確認**：選 1 或 2；若選 1，`state.json` 是否仍是 hook 的產物（與 `dashboard.md` 同層級）。

#### B. 能用模板就不要用模型

**問題**：成本 + 一致性。

目前 `ba-requirement.md`、`task-summary.md`、`dev/{task}-report.md` 都要求 agent「再寫一份 markdown，
內容跟 json 一致」。這是花模型的錢做字串格式化，且 json 與 md 不一致時無人攔截。改為由 json 以固定樣板渲染，
模型只產出 json。

對「主力是中低階模型」效益最直接：大幅減少輸出 token，同時消除一整類不一致。

**待確認**：渲染由 hook、command 內的腳本呼叫，或獨立 CLI。

#### C. 單步封閉 action + 固定 envelope

即 determinism 文件 §5 的提案。值得強調：**它對低階模型的效益比對高階模型更大**——中低階模型在
「短、封閉、有 schema、不需記住流程位置」的任務上表現接近高階模型；一旦要求它同時維護 stage 路由，落差就拉開。
對會自行規劃的高階模型，封閉 action 正好收掉重排流程的空間。一份契約同時修好兩種失敗模式。

**問題**：C1–C5。

#### D. Fail-closed validator + 一次帶錯誤重試

**問題**：中低階模型的 schema 漂移。

對策不是升級模型，而是便宜的重試：validator 擋下 → 把具體錯誤（缺哪個欄位、enum 不合法）回灌給同一個模型重跑
→ retry counter 由 Controller 管。一次中階模型重試遠比整條 pipeline 升級便宜。

determinism 文件 §17 DET-Q5（三層 validator、fail-closed）已是 `Approved`，此項可直接往下規劃。

#### E. 分層寫 prompt：契約歸機器，判斷歸模型

同一份 `.md` 不要混「機器可驗的契約」與「需要理解的指引」。

- 程序性步驟：越短越好，並加上明確執行約束（例如「這幾個寫入不得合併或重排」）。
  **但這只是第二道防線**，第一道永遠是 A 項的程式化。
- 判斷型任務：不要塞流程。Reviewer 現行寫法方向正確。

#### F. 模型分層建議

| 階段 | 建議 | 理由 |
|---|---|---|
| state／checkpoint／progress／md 渲染 | **程式，不用模型** | 純確定性 |
| PM 分類 | 低階 + enum validator | 封閉分類，錯了重試比升級便宜 |
| BA 出題 | 中階以上，一次只出一題 | 需要判斷，封閉後可控 |
| Plan/SA/SD | 中高階 | 設計品質決定後面所有 task |
| Developer | 中階 | 有 task／AC／files 三重約束 |
| **Reviewer** | **不要省** | 整條流程唯一品質閘門，省在這裡等於關掉煞車 |
| Knowledge | 中階 | 輸出可人工核准，錯誤成本低 |

若預算只夠一個角色用高階模型：優先 Reviewer，其次 Plan/SA/SD。

**待確認**：是否把模型層級寫成可設定項（而非 command 內寫死 `model: haiku`／`model: sonnet`），
以便 G 項做跨層級比較。

#### G. 用既有 eval 量測「契約遵循率」

`evals/quality/` 已在記錄 model 識別與 `model_settings`。建議新增一類與品質分數分開的指標：
同一 case 換模型層級跑，量測 **schema 合法率、stage 轉移正確率、寫入順序正確率**。

沒有這個數據，A–F 都只是推測；有了它，「哪一段可以降級」才是可回答的問題。

### 建議推進順序

1. **A + B**：不改變流程語意、不需新決策，同時降低成本與漂移。
2. **C + D**：結構性改動，但 determinism 文件已有對應原則（§5、§17 DET-Q5）。
3. **G**：可並行，是驗證 A–F 是否有效的唯一憑據。

此順序與 determinism 文件 §11 的漸進順序一致（統一 outcome／schema → 集中狀態轉移 → action ID 與冪等性 →
收回 Git／檔案副作用）。

---

## 邊界與未決事項

- determinism 文件中標 `Proposed` 的項目（event log 是否為 state 來源、Agent 是否可直接編輯產品檔案）
  **未經核准**，本文件不依賴、也不擴張這些項目。
- 本文件所有建議狀態均為「待討論」，未經使用者明確核准前不得進入實作。
- 依 `CLAUDE.md`，後續任何實作都必須另開分支，不得直接在 `main` 修改。
- 若決定推進 A／C，屬於變更 Controller／state machine 契約，需在同一工作中更新
  `docs/architecture/prompt-orchestration-determinism.md` 的 metadata、implementation mapping 與驗證證據。

## 逐項決議記錄（待填）

| 項目 | 決議 | 決議者 | 日期 | 備註 |
|---|---|---|---|---|
| A. 消滅雙寫順序 | 待討論 | | | |
| B. 模板取代模型渲染 | 待討論 | | | |
| C. 單步封閉 action | 待討論 | | | |
| D. Validator + 重試 | 待討論 | | | |
| E. 分層 prompt | 待討論 | | | |
| F. 模型分層 | 待討論 | | | |
| G. 契約遵循率 eval | 待討論 | | | |
