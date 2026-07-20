---
title: Agent Work Team 現況限制與未提供能力議題清單
document_type: discussion-issues
status: Open
created: 2026-07-20
updated: 2026-07-20
baseline: docs/agent-work-team-current-state-review.md
---

# Agent Work Team 現況限制與未提供能力議題清單

## 文件目的

本文件把現況盤點中值得討論的問題拆成可追蹤議題，供後續逐項確認「保留、改善、延後或不處理」。它不是實作計畫，也不代表列出的建議已獲核准。

現況基線以 `docs/agent-work-team-current-state-review.md` 與 `docs/agent-work-team-current-state-context.md` 為準。`docs/manual-testing-checklist.md` 已過時，不作為問題判定或驗證證據。

## 分類原則

- **現況限制**：目前設計會直接影響可靠性、安全性、可恢復性或執行效率。
- **刻意設計邊界**：目前沒有提供，但可能是基於控制權或安全性的合理選擇，不應直接視為缺陷。
- **未提供能力**：產品整合或操作體驗目前不存在，是否需要取決於未來使用情境。

## A. 現況限制

### LIM-01 Prompt 編排的確定性

- **現況**：多數 stage 路由、寫入順序、dispatch、重試與人工關卡由 command Markdown 指示 Controller 執行。
- **風險**：模型、上下文或 session 差異可能造成漏步、重複操作、非法狀態轉移或不同的恢復行為。
- **討論問題**：哪些責任應留給 Agent 判斷，哪些責任應改由確定性程式掌握？
- **已核准方向**：採方案 B，建立 host-neutral workflow core；Claude Code 與 GitHub Copilot 使用不同 adapter，但共用狀態轉移、事件、驗證、重試與 Git 安全規則。詳細內容記錄於 `docs/architecture/prompt-orchestration-determinism.md`。
- **已核准實作邊界**：core 以 PowerShell 7+ 為主；CLI 只負責安裝／管理；Copilot 安裝後由使用者在 VS Code Chat 指定 user-facing custom agent；core 隨所選 adapter 一起安裝。
- **後續核准**：Event log 第一階段採 audit-only，`state.json` 維持權威；Developer 在 core 建立的隔離 worktree 編輯／測試，core 控制 Git 副作用，Reviewer 唯讀。
- **後續核准**：Copilot 第一版採 VS Code Chat user-facing custom agent + hidden role subagents；core 掌握流程；hooks 作第二道防線；short instructions 必要；skills／prompt files 第一版非必要。
- **後續核准**：Human approval 採 artifact-bound、single-use challenge 並標記 `local-explicit` assurance；validator 採 hard／policy／advisory 三層；legacy request 採 side-by-side protocol 與 explicit、stage-aware migration。
- **決策狀態**：`Approved direction; implementation not started`。

### LIM-02 Git 工作目錄與使用者變更保護

- **現況**：Development 會建立／切換分支，Developer 會執行 `git add` 與 `git commit`。
- **風險**：未提交變更、錯誤 staged files、worktree、submodule 或 merge conflict 可能影響使用者原有工作。
- **討論問題**：開始 Development 前需要哪些硬性 preflight？Agent 可否直接 stage 所有變更？
- **初步建議**：先建立可機器判斷的 Git preflight 與允許的變更範圍，再考慮其他 Git 自動化。
- **決策狀態**：`Open`。

### LIM-03 跨檔案狀態與 artifact 一致性

- **現況**：一次流程可能先後更新 checkpoint、state、progress、report 與 commit，檔案系統沒有跨檔案交易。
- **風險**：session 或工具執行中斷時，可能留下部分完成狀態。
- **討論問題**：容錯應只依賴恢復規則，還是需要 action log、暫存寫入與可重放事件？
- **初步建議**：先定義每個 action 的完成條件與冪等鍵，再加入 append-only transition log。
- **決策狀態**：`Open`。

### LIM-04 結構化契約與語意驗證不足

- **現況**：Development 入口會檢查 task 物件基本欄位；其他 JSON 多由 Prompt 約束產生，沒有統一 schema validation 層。
- **風險**：Agent 回報 `DONE` 時，artifact 仍可能缺欄位、跨檔案不一致或未完整覆蓋上游要求。
- **討論問題**：哪些 artifact 需要 JSON Schema，哪些語意規則需要額外 validator？
- **已核准方向**：採 hard validator、policy gate、advisory check 三層模型；只有確定性、可重現檢查可直接阻擋 transition；結構化 AI outcome 由 core 固定政策處理；無法判斷時 fail closed。
- **決策狀態**：`Approved direction; implementation not started`。

### LIM-05 跨 session 完整性只受部分保護

- **現況**：token 可發現 RQ-ID 資料混用；Planning checkpoint 與 Development progress 支援續接。
- **風險**：手動修改、部分刪除、artifact 與 commit 不一致等問題不一定會被 token 發現。
- **討論問題**：是否需要 artifact hash、prompt/schema version、commit existence 與 repair command？
- **初步建議**：先記錄 action identity、input hash、artifact hash 與版本，再設計修復能力。
- **決策狀態**：`Open`。

### LIM-06 Task 只能循序執行

- **現況**：Development 明確要求依 task 順序處理，不平行 dispatch。
- **風險**：大型需求耗時較長；但直接平行化可能導致檔案與 Git 衝突。
- **討論問題**：是否真的需要平行化？若需要，誰提供 dependency 與 conflict 判斷？
- **初步建議**：在沒有 task dependency graph 與隔離工作區前維持循序執行。
- **決策狀態**：`Open`。

## B. 刻意設計邊界

### BND-01 不自動 merge

- **現況**：Development 完成後只告知 request branch 與 base branch，由使用者決定 merge。
- **判斷**：這是合理的安全邊界，不應直接列為缺陷。
- **可討論方向**：是否增加 merge-readiness 報告、衝突預檢或 PR 建立，而非直接自動 merge。
- **決策狀態**：`Preserve by default`。

### BND-02 三個人工核准關卡

- **現況**：Spec、final review 與 Knowledge 都需要人工開啟實體 artifact 並核准。
- **判斷**：這是工具保留人類控制權的核心設計。
- **可討論方向**：改善核准介面與證據摘要，不預設移除關卡。
- **決策狀態**：`Preserve by default`。

### BND-03 Reviewer 不直接修改產品程式碼

- **現況**：Reviewer 唯讀審查，問題交回 Developer 修正。
- **判斷**：角色分離有助維持審查獨立性。
- **可討論方向**：維持不直接修碼，但讓 review output 更結構化、可定位與可追蹤。
- **決策狀態**：`Preserve by default`。

### BND-04 Knowledge 沒有自動 Reviewer

- **現況**：Knowledge 由 Agent 整理後直接進人工核准，沒有 fix-round counter。
- **判斷**：可能是避免自動大規模改寫 wiki 的刻意選擇。
- **可討論方向**：先評估知識誤寫成本，再決定是否加入唯讀檢查器。
- **決策狀態**：`Open`。

## C. 未提供能力

| ID | 能力 | 現況 | 初步優先級 |
|---|---|---|---|
| CAP-01 | GitHub Issue／Pull Request | 沒有既有 command-level 整合 | P1，與 Copilot 使用情境相關 |
| CAP-02 | CI/CD 與遠端測試結果 | 沒有整合 | P1 |
| CAP-03 | Jira／其他工作項目系統 | 沒有整合 | P2，依團隊需要 |
| CAP-04 | Web／互動式 Dashboard | 只有自動生成的 Markdown dashboard | P2 |
| CAP-05 | 通知與待辦提醒 | 沒有整合 | P2 |
| CAP-06 | 多人角色、權限與審批 | 沒有身份或權限模型 | P2／P3 |
| CAP-07 | 跨 repository／monorepo 協調 | 沒有明確支援 | P2／P3 |
| CAP-08 | Task dependency graph／平行排程 | 沒有支援 | P2，需先解決隔離與衝突 |
| CAP-09 | Artifact validator／repair tool | 沒有統一工具 | P1 |
| CAP-10 | 成本、token、時間與 Agent 統計 | 沒有觀測能力 | P2 |
| CAP-11 | 完整 transition audit trail | 只有目前狀態與各階段檔案 | P1 |
| CAP-12 | 自動 merge | 刻意未提供 | P3，預設不建議優先 |

## 交付路線分類

已核准採「Core contract 先行、Claude Code 第一個垂直切片、Copilot 提早驗證同一切片，後續按能力切片維持 parity」的交錯策略，不採先完成整套 Claude plugin 才開始 Copilot，也不在 core contract 未穩定時全面平行開發。

| 路線 | 適用議題 | 處理方式 |
|---|---|---|
| A：跨 host workflow | `LIM-01`～`LIM-05`、`CAP-09`、`CAP-11` | `Core → Claude → Copilot parity`；同一 golden scenario 必須產生等價 state、event 與 artifact |
| B：延後的 core 能力 | `LIM-06`、`BND-04`、`CAP-06`～`CAP-08` | 先完成可靠性前置條件與個別產品決策，再按能力切片實作 |
| C：共用外部整合 | `CAP-01`～`CAP-05`、`CAP-10` | `Core event/API → integration provider → host presentation`；不得在 Claude／Copilot 各複製整合邏輯 |
| D：保留安全邊界 | `BND-01`～`BND-03`、`CAP-12` | 預設不移除；只改善核准證據、readiness report 或操作體驗 |

此分類是交付路線，不代表所有列入 A／B／C 的能力都已核准實作。各議題原有的 `Open`、優先級與產品決策仍然有效。

## 建議討論順序

1. `LIM-01` Prompt 編排的確定性。
2. `LIM-02` Git 工作目錄與使用者變更保護。
3. `LIM-03` 狀態與 artifact 一致性。
4. `LIM-04` 結構化契約與 schema validation。
5. `BND-02` 人工核准關卡在未來 host 中的保留形式。
6. `CAP-01`／`CAP-02` GitHub PR 與 CI 整合。
7. 其餘操作體驗與效能能力。

## 議題更新規則

- 討論形成決定後，更新該議題的 `決策狀態`，並連結對應 decision、spec 或 plan。
- 實作完成不等於議題結案；必須確認現況文件與可執行驗證也已更新。
- 新增問題時沿用 `LIM`、`BND`、`CAP` 編號，不重排既有 ID。
- 本文件只追蹤議題，不在此展開實作步驟。
