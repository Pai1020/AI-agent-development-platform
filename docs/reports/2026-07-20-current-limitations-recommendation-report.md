---
title: Agent Work Team 現況限制討論與建議報告
document_type: recommendation-report
status: Partially Accepted
created: 2026-07-20
updated: 2026-07-20
---

# Agent Work Team 現況限制討論與建議報告

## 摘要

目前工具已具備完整的 Planning、Development、Knowledge 階段與人工核准關卡。主要風險不在角色能力不足，而在工作流控制責任大量存在於自然語言 Prompt：Controller 必須自行遵循 stage 路由、檔案寫入、重試、Git 操作與續接規則。

建議未來優先提高核心編排、Git 副作用及持久化狀態的可驗證性，同時保留 Agent 在需求理解、設計、實作、審查與知識萃取上的判斷空間。自動 merge、移除人工關卡及 task 平行化不應列為第一波目標。

本報告仍是整體討論輸入，不是完整轉換或實作方案。`REC-01` 的方案 B、PowerShell 7+／安裝管理 CLI、audit-only event log、隔離 worktree 責任邊界，以及 Copilot VS Code Chat customization 分工已於 2026-07-20 獲使用者核准；其他建議仍待逐項討論。

## 評估結論

### 1. 最高優先問題：工作流可靠性

建議優先處理三個彼此相關的問題：

1. Prompt 編排的確定性。
2. Git 工作目錄與既有使用者變更保護。
3. state、checkpoint、progress、report 與 commit 的一致性。

若這三項沒有先建立清楚邊界，增加 GitHub、CI 或 dashboard 整合只會把目前的不確定行為擴散到更多系統。

### 2. 應保留的產品原則

- Spec、Development final review、Knowledge 維持人工核准。
- Reviewer 維持唯讀，不直接修產品程式碼。
- Development 預設不自動 merge。
- Agent 繼續負責需要語意理解與專業判斷的工作。
- 使用者專案中的檔案繼續保持可閱讀、可稽核，不把所有狀態藏入不透明服務。

### 3. 不宜過早處理的能力

- Task 平行化：需要 dependency graph、隔離工作區與整合策略。
- 自動 merge：風險高，且可能破壞現有人工控制邊界。
- Web dashboard：主要改善體驗，不能解決核心狀態可靠性。
- 多人權限模型：需要先確立 host、身份與核准事件來源。

## 建議方向

### REC-01 建立確定性流程外框

採用「確定性 Controller + 非確定性 Agent」：Controller 控制合法 event、stage、schema、重試、持久化與副作用；Agent 完成單步語意工作。詳細建議見 `docs/architecture/prompt-orchestration-determinism.md`。

**決策：Approved。** 核心 workflow 採 host-neutral 設計；Claude Code 與 GitHub Copilot 使用各自 adapter，但共用狀態轉移、事件、驗證、重試與 Git 安全規則。目前尚未開始實作；runtime implementation details 仍需透過後續 spec／plan 具體化。

**後續核准及釐清：** Host-neutral core 以 PowerShell 7+ 為主要實作語言；CLI 只作為安裝／管理入口；GitHub Copilot 安裝完成後由使用者在 VS Code Chat 指定 Agent Work Team custom agent 執行工作；core 隨使用者選擇的 Claude Code／Copilot 工具一起安裝並進行版本相容性檢查。先前「Copilot CLI adapter」措辭已被此釐清取代。

**後續核准：** Event log 第一階段只作 audit，`state.json` 維持權威；Developer 在 core 建立的隔離 worktree 編輯與測試，由 core 控制 branch／stage／commit，Reviewer 維持唯讀。

**後續核准：** GitHub Copilot 第一版由使用者在 VS Code Chat 選擇 user-facing Agent Work Team custom agent；五個角色 agent 作 hidden subagents；core 唯一掌握流程；hooks 作第二道防線；short instructions 必要；skills／prompt files 第一版非必要。

**後續核准：** Human approval 採 artifact-bound、single-use challenge 並提供 `local-explicit` assurance；validator 採 hard／policy／advisory 三層模型；legacy request 採 side-by-side protocol，經 explicit dry-run、人工確認、snapshot 與 stage-aware converter 後才遷移。

### REC-02 統一 Agent outcome 與 artifact schema

所有會推動狀態的 Agent 結果使用固定 outcome enum 與 versioned envelope。Controller 必須驗證 artifact 結構與必要語意後，才能接受 `completed` 並推進 stage。

### REC-03 建立 Git preflight 與變更範圍保護

Development 開始與每次 commit 前，至少檢查：

- 目前 repository、branch 與預期 request 是否一致。
- 是否存在未提交或已 staged 的使用者變更。
- 本輪修改是否超出 task 宣告範圍。
- branch 是否已被其他 request 或 worktree 使用。
- commit 是否只包含本輪允許的檔案。

preflight 失敗時應停止並要求人工選擇，不讓 Agent自行 stash、discard 或混入 commit。

### REC-04 加入 action identity、冪等性與事件紀錄

每個可重跑步驟應有穩定 action ID、輸入 hash、artifact hash、版本與結果。另以 append-only event log 記錄狀態轉移與人工決定，使跨 session 恢復能判斷「未執行、部分執行、已完成或產物遭修改」。

### REC-05 先驗證再改變狀態

採 prepare／validate／commit 順序：先產生暫存 artifact，驗證後原子替換，最後更新權威 state 並記錄 transition。Agent 的文字回報不能單獨成為推進狀態的依據。

### REC-06 將外部整合放在穩定核心之上

完成核心控制邊界後，再評估 GitHub Issue／PR 與 CI 整合。外部系統只應接收已驗證事件，不應成為修補內部狀態不一致的替代方案。

### REC-07 採分階段交錯交付

**決策：Approved。** 不先完整改完 Claude Code plugin 才開始 GitHub Copilot，也不在 core contract 未穩定時全面同步開發。交付順序為：

1. 定義 host-neutral core contract 與 contract tests。
2. 以現有 Claude Code plugin 完成第一個 Planning 垂直切片。
3. 立即以 Copilot VS Code Chat adapter 驗證同一 golden scenario。
4. 後續 workflow 能力逐項採 `Core → Claude → Copilot parity`。
5. Core／adapter layout 穩定後，再收斂安裝與管理 CLI。

此流程直接適用 `LIM-01`～`LIM-05`、`CAP-09`、`CAP-11`。平行排程、多人權限、跨 repository 與 Knowledge reviewer 必須等待前置條件或產品決策。外部整合採單一 provider，不在兩個 adapter 各自實作。刻意安全邊界預設保留。

## 建議交付波次

| 波次 | 範圍 | 主要交付方式 |
|---|---|---|
| Wave 1：Core reliability | `LIM-01`～`LIM-05`、`CAP-09`、`CAP-11` | 每個能力切片依 Core → Claude → Copilot parity 驗證 |
| Wave 2：安全外部整合 | `CAP-01`、`CAP-02` | Core event／API → 單一 integration provider → host presentation |
| Wave 3：複雜執行模型 | `LIM-06`、`BND-04`、`CAP-06`～`CAP-08` | 前置條件與產品決策完成後另立 spec |
| Wave 4：操作體驗 | `CAP-03`～`CAP-05`、`CAP-10` | 依實際需求獨立排程，不阻擋核心可靠性 |

`BND-01`～`BND-03` 與 `CAP-12` 持續作為預設安全邊界，不列入移除計畫。

## 建議優先級

| 優先級 | 項目 | 預期價值 |
|---|---|---|
| P0 | Prompt 編排確定性 | 降低漏步、重複 dispatch 與非法轉移 |
| P0 | Git preflight | 避免污染或遺失使用者既有工作 |
| P0 | 狀態／artifact 一致性 | 提高跨 session 恢復可信度 |
| P1 | Schema 與 outcome protocol | 降低 Agent 輸出漂移 |
| P1 | Event log 與冪等 action | 支援稽核、恢復與重放判斷 |
| P1 | Human gate 表達方式 | 保留控制權並適配未來 host |
| P1 | GitHub PR／CI 整合 | 接近 GitHub Copilot 的實際工作環境 |
| P2 | Dashboard／通知 | 改善可見性與操作體驗 |
| P2 | Task dependency／平行化 | 縮短大型需求時間，但複雜度高 |
| P3 | 自動 merge | 風險高，暫不建議優先 |

## 建議的決策關卡

在形成任何實作計畫前，應先回答：

1. Worktree lifecycle、鎖定、清理與中斷恢復規則為何？
2. Knowledge 寫入外部 vault 時採何種隔離與核准 policy？
3. GitHub PR／CI 是必要的第一版能力，還是核心可靠性完成後的第二階段？

## 建議的下一步產物

本報告核准後，才依決策結果建立：

- 核心 workflow responsibility matrix。
- 狀態機與 event catalog。
- Agent outcome protocol 與 JSON Schema 清單。
- Git safety policy。
- 分階段實作 spec／plan。

只有本文與 `docs/architecture/prompt-orchestration-determinism.md` 明確標記為 Approved／Decided 的內容可寫成既定需求；Open 或 Proposed 項目仍需人工決策。

## 相關文件

- 現況確認：`docs/agent-work-team-current-state-review.md`
- 跨 session 現況：`docs/agent-work-team-current-state-context.md`
- 議題清單：`docs/discussions/2026-07-20-current-limitations-issues.md`
- Prompt 確定性：`docs/architecture/prompt-orchestration-determinism.md`
