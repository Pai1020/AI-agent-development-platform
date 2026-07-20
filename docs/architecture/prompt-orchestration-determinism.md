---
title: Prompt 編排確定性協作文件
document_type: living-architecture-discussion
status: Accepted Direction
decision_status: Approved
created: 2026-07-20
updated: 2026-07-20
last_verified_against_code: 2026-07-20
maintained_by: Human and Claude Code
---

# Prompt 編排確定性協作文件

## Claude Code 協作契約

本文件是「Prompt 編排確定性」議題的 living document，供人類與 Claude Code 跨 session 共同維護。

Claude Code 在處理下列工作前必須先讀本文：

- 修改 `commands/agent-work-team*.md` 的 stage、status、dispatch、resume、retry 或 approval 行為。
- 修改 `agents/agent-work-team-*.md` 的輸入、outcome 或 artifact 契約。
- 修改 `hooks/` 中的狀態、重試或 dashboard 行為。
- 新增 Controller、state machine、event、schema、validator、action log 或 Git 副作用管理。
- 設計 Claude Code 以外 host（包含 GitHub Copilot）的對等編排能力。

Claude Code 完成上述變更後，必須在同一工作中重新檢查並更新本文的：

1. `updated` 與 `last_verified_against_code`。
2. 現況問題與責任邊界。
3. 已核准決策、未決問題與被拒絕方案。
4. 實作對照與驗證證據。

Claude Code 不得自行把 `Proposed` 改成 `Approved`。只有使用者明確核准後，才能更新 `decision_status` 並記錄核准日期與範圍。若程式與本文不一致，先以現行程式／command／agent／hook 判斷實際行為，指出差異，再更新本文；不得只為符合本文而靜默修改程式。

「自我更新」在此表示：Claude Code 執行相關 repository 工作時主動維護本文；不表示背景程序會在沒有 session 或沒有檔案變更時自行執行。

## 1. 問題陳述

目前 command Markdown 同時承擔兩種責任：

1. 描述需要 Agent 理解與判斷的工作。
2. 充當 workflow engine，指示 Controller 讀寫檔案、切換 stage、dispatch、重試與等待人工。

第二類責任需要精確、可重放與可驗證，但目前主要依賴模型遵循長篇自然語言。Prompt 已經很詳細，繼續增加規則會提高上下文負擔，不能保證相同比例地提高遵循率。

## 2. 已核准架構原則

> 採用「確定性 Controller + 非確定性 Agent」。Agent 負責語意判斷與內容產生；程式負責合法流程、驗證、持久化、重試與副作用。

核心 workflow 必須設計為 **host-neutral**。Claude Code 與 GitHub Copilot 可以使用不同的互動 adapter，但必須共用相同的狀態轉移、事件、資料驗證、重試與 Git 安全規則；同一份 `.agent-work-team` 資料不得存在兩套合法解讀方式。

此方向已由使用者於 2026-07-20 明確核准。核准的是責任邊界與跨 host 共用原則，**不代表已核准或決定**：

- Agent 是否可直接修改產品檔案。
- event log 是否成為 state 的可重建來源。
- GitHub Copilot 的 prompt、skill、agent 或 hook 選型。

後續於同日進一步核准：

- Host-neutral core 以 PowerShell 腳本為主要實作語言；為支援不同作業系統與一致 runtime，目標執行環境為 PowerShell 7+（`pwsh`），不以 Windows PowerShell 5.1 專屬行為作為核心契約。
- 整體工具採 CLI 形式提供安裝與管理入口。使用者依需求選擇安裝 Claude Code plugin、GitHub Copilot 工具，或兩者。
- GitHub Copilot 的實際操作介面是 VS Code Chat custom agent。使用者安裝後從 Agent picker 指定 Agent Work Team custom agent 執行工作；CLI 不取代 VS Code Chat，也不以 GitHub Copilot CLI 作為第一版 runtime。
- Host-neutral core 隨選定工具一起安裝並由 adapter 呼叫；不能要求使用者另外手動取得一套不同版本的 core。

目前尚未實作此架構，runtime 仍維持現行 Prompt 編排行為。

### 已核准的配布與執行分層

```text
Installer / Management CLI (PowerShell 7+)
├── install Claude Code adapter
├── install GitHub Copilot VS Code Chat customizations
└── install matching Host-neutral core

Host-neutral core (PowerShell 7+)
├── state machine and event validation
├── schema and semantic validation
├── retry and idempotency policy
├── artifact persistence
└── Git safety policy

Host adapters
├── Claude Code plugin: dialogue, subagent dispatch, approval UX
└── GitHub Copilot VS Code Chat adapter: user-facing custom agent, subagent dispatch, approval UX
```

「隨工具一起安裝」不代表複製兩份可獨立演進的 core。安裝產物必須帶有 core／protocol version，adapter 啟動時必須檢查相容性。

## 3. 建議責任邊界

### 交給 Agent

- PM 分類與理由。
- BA 下一題、需求摘要與 Acceptance Criteria 草案。
- User Story、技術設計、task 拆分與測試計畫。
- 單一 task 的程式實作。
- Review 問題、嚴重度與 verdict 建議。
- 值得沉澱的知識與筆記內容。

### 交給確定性 Controller

- 合法 stage／status／event 與唯一下一步。
- 是否允許 dispatch、resume、retry 或進入人工關卡。
- state、checkpoint、progress 與 event log 寫入。
- JSON Schema 與跨 artifact 前置條件驗證。
- retry counter 與 Blocked 判斷。
- Git preflight、branch、staging 與 commit 範圍控制。
- action identity、冪等性、artifact hash 與版本記錄。
- 人工 approve／reject event 的落地。

### 交給使用者

- 需求摘要確認。
- Spec 核准與修改方向。
- Development final review 核准。
- Knowledge 核准。
- Git 衝突、未提交變更與 merge 的高風險決定。

## 4. 目標互動模型

```text
Controller 判斷目前允許的 action
→ Agent 完成一個封閉的語意任務
→ Validator 驗證 outcome 與 artifact
→ Controller commit artifact 與合法 transition
→ 需要時等待 Human event
```

Agent 不應自行決定下一個 stage，也不應以一段自然語言 `DONE` 直接驅動狀態推進。

## 5. 單步 Agent 契約

建議 Controller dispatch 一個封閉 action，而不是把整段 workflow 交給 Agent：

```json
{
  "protocol_version": 1,
  "action_id": "RQ-001:plan-spec:1",
  "action": "draft_spec",
  "request_id": "RQ-001",
  "input": {
    "requirement_summary": "...",
    "acceptance_criteria": ["..."]
  }
}
```

建議 Agent 使用固定 envelope 回覆：

```json
{
  "protocol_version": 1,
  "action_id": "RQ-001:plan-spec:1",
  "request_id": "RQ-001",
  "agent": "plan-sd",
  "outcome": "completed",
  "data": {},
  "concerns": [],
  "blocking_reason": null,
  "requested_context": []
}
```

建議 outcome enum：

- `completed`
- `completed_with_concerns`
- `needs_context`
- `blocked`
- `failed`

人類可讀報告可以繼續存在，但 Controller 不應解析自由文字來決定流程。

## 6. 狀態轉移應集中定義

建議以 event 驅動的轉移表取代散落於多份 Prompt 的自然語言路由。例如：

| From | Event | To | 必要條件 |
|---|---|---|---|
| `BA_CLARIFYING` | `QUESTION_ANSWERED` | `BA_CLARIFYING` | answer 已持久化 |
| `BA_CLARIFYING` | `SUMMARY_CONFIRMED` | `SPEC_DRAFTING` | BA artifact schema 與語意驗證通過 |
| `SPEC_DRAFTING` | `AGENT_COMPLETED` | `PENDING_SPEC_APPROVAL` | plan spec 驗證通過 |
| `SPEC_DRAFTING` | `AGENT_BLOCKED` | `SPEC_DRAFTING`／`Blocked` | blocking reason 非空 |
| `PENDING_SPEC_APPROVAL` | `HUMAN_APPROVED` | `SPEC_APPROVED` | approval 與 task summary 已記錄 |
| `PENDING_SPEC_APPROVAL` | `REQUIREMENT_REJECTED` | `BA_CLARIFYING` | feedback 非空 |
| `PENDING_SPEC_APPROVAL` | `TECHNICAL_REJECTED` | `SPEC_DRAFTING` | feedback 非空 |

完整 event catalog 尚未建立。表內名稱是討論用候選，不是現行資料契約。

## 7. Artifact 驗證原則

建議至少為下列 JSON 建立 versioned schema：

- state
- planning checkpoint
- PM triage
- BA requirement
- plan spec
- Development progress
- Developer report
- Review report
- Knowledge report
- Agent outcome envelope

Schema 只能驗證結構，仍需額外語意規則，例如：

- task ID 唯一。
- task files 非空且路徑符合允許範圍。
- report task ID 與 action request 一致。
- review commit range 存在且屬於 request branch。
- final review 涵蓋所有已核准 task。
- 上游 Acceptance Criteria 已被 spec／task 對應。
- artifact token、request ID、schema version 一致。

驗證通過前，不推進權威 state。

## 8. 冪等性與半完成操作

每個可重跑步驟應有穩定 `action_id`，並記錄：

```json
{
  "action_id": "RQ-001:plan-spec:1",
  "action": "draft_spec",
  "status": "completed",
  "prompt_version": "plan-sd-v1",
  "schema_version": "plan-spec-v1",
  "input_hash": "...",
  "artifact_hash": "...",
  "started_at": "...",
  "completed_at": "..."
}
```

重跑時的建議規則：

- 已完成且 hash 一致：沿用結果，不重複 dispatch 或 commit。
- 已開始但未完成：標記 interrupted，再依 action policy 重試。
- 已完成但 artifact hash 不一致：停止並要求人工確認。
- 同一 action 不重複建分支、不重複 append 問答、不重複建立相同 commit。

## 9. 寫入與事件紀錄

建議副作用採下列順序：

1. Prepare：計算 from、event、to、預計寫入與前置條件。
2. Write temp：將 Agent artifact 寫入暫存位置。
3. Validate：執行 schema 與語意驗證。
4. Commit artifact：用同檔案系統的原子 rename 替換正式 artifact。
5. Transition：最後更新權威 state。
6. Audit：append event log，記錄 action、hash、版本與人工事件。

候選事件檔：

```text
.agent-work-team/requests/<RQ-ID>/events.jsonl
```

event log 用來解釋如何到達目前狀態、發現重複／非法 transition，以及支援跨 session 判斷。它不應直接取代現有可閱讀 artifact；是否能重建 state 仍待決策。

## 10. Prompt 版本化

action 應記錄至少：

- Agent identity。
- Prompt version。
- Schema／protocol version。
- Model identity（host 可提供時）。
- Input hash。

這使舊需求在 Prompt 更新後重跑時，能辨識輸出契約與行為來源。

## 11. 建議漸進順序

1. **統一 Agent outcome 與 schema**：先降低輸出漂移，不改變產品流程。
2. **集中狀態轉移與合法 event**：將 stage 路由移出長篇 Prompt。
3. **加入 action ID、event log 與冪等性**：改善跨 session 與半完成操作。
4. **收回 Git／檔案副作用**：Agent 提供工作結果，Controller 執行受控副作用。

每一步都應保持現有人工核准與可閱讀 artifact，除非另有明確決策。

## 12. Agent 編輯產品檔案：討論內容與建議

這個問題在決定「Agent 產生程式碼後，誰真正改動工作樹與建立 commit」。它不是在問 Agent 能不能寫程式，而是在問副作用由誰掌握。

### 選項 A：Agent 直接編輯目前工作樹

- **做法**：延續現況，Developer Agent 直接 Edit／Write、stage、commit。
- **優點**：工具需求低、互動直接、實作效率高。
- **風險**：容易混入使用者未提交變更；中斷時難判斷哪些修改屬於哪個 action；Controller 很難在套用前阻擋越界修改。

### 選項 B：Agent 只回傳 patch／change set

- **做法**：Agent 不碰工作樹，只產生 patch；Controller 驗證後套用。
- **優點**：副作用最容易控制與稽核。
- **風險**：大型或多輪修改的 patch 容易失效；Agent 無法自然地邊改、邊編譯、邊測試；不同 host 的 patch 契約成本高。

### 選項 C：Agent 在 Controller 建立的隔離 worktree 直接編輯

- **做法**：Controller 完成 Git preflight，建立 request／task 專用 worktree；Agent 在該 worktree 編輯與測試；Controller 驗證 diff、允許檔案與測試結果後負責 stage／commit。
- **優點**：保留 Agent 實作效率，同時隔離使用者工作樹並收回 Git 副作用。
- **成本**：需要 worktree lifecycle、磁碟清理、branch 鎖定及中斷恢復規則。

### 建議

採用 **混合的選項 C**，已由使用者於 2026-07-20 核准：

- Planning artifact：Agent 回傳結構化資料，由 core 驗證並寫檔。
- Product code：Developer Agent 可在 Controller 建立的隔離 worktree 直接編輯與執行測試。
- Git branch、stage、commit：只由 host-neutral core 控制。
- Reviewer：維持唯讀，只讀 diff、report 與測試證據。
- Knowledge 筆記：先採與 product code 相同的隔離／diff 驗證原則；是否允許直接編輯外部 vault 需另定 policy。

此決策確立 Developer 與 core 的責任邊界；worktree 目錄命名、保留期限、清理、鎖定與外部 vault policy 尚待實作設計。

## 13. Event log 是否可重建 state：討論內容與建議

這個問題是在決定 `events.jsonl` 的權威程度。

### 選項 A：Event log 只作 audit

- `state.json` 仍是唯一權威來源。
- Event log 記錄「發生過什麼」，供除錯、稽核與偵測半完成操作。
- State 損毀時不能宣稱只靠 event log 一定可重建。

### 選項 B：Event log 是 state 的來源（event sourcing）

- 每一個狀態變化都必須是完整、順序明確且不可遺漏的 event。
- `state.json` 只是由 events 投影出的快取，可刪除後重建。
- 需要 event schema version、migration、sequence、duplicate detection、snapshot 與 replay 規則。

### 建議

第一階段採 **選項 A：audit-only**，已由使用者於 2026-07-20 核准。原因是現有 command／artifact 並非 event-sourced；直接把新 event log 宣告成可重建來源，會對舊 request 與半完成流程產生不實保證。

建議第一階段提供：

- Append-only event log。
- 單調遞增 sequence 或穩定 event ID。
- action ID、from／to、artifact hash、prompt／schema version。
- `state.json` 與 event tail 的一致性檢查。
- 診斷／人工修復建議，但不自動由 event 重建 state。

若未來確認所有 transition 都只能經過 core，並建立完整 migration／replay 測試，再另立決策升級為 event sourcing。

## 14. GitHub Copilot customization 選型建議

### CLI 定義與實際操作介面

本專案中的 CLI 是**安裝／管理 CLI**：負責下載、安裝、更新、移除及檢查 Claude Code／GitHub Copilot adapter 與相容的 host-neutral core。

GitHub Copilot 安裝完成後，實際操作介面是 **VS Code Chat custom agent**：

1. 使用者開啟 VS Code Chat。
2. 從 Agent picker 指定 Agent Work Team custom agent。
3. 使用者以自然語言提出新需求、續接、開發或知識整理。
4. User-facing custom agent 呼叫隨附 PowerShell core 取得唯一合法 action。
5. User-facing custom agent dispatch 對應的角色 subagent。
6. Subagent 回傳結構化 outcome；user-facing custom agent交回 core 驗證及推進。
7. 需要人工關卡時，由 VS Code Chat 顯示 artifact 與選項並等待使用者回覆。

GitHub Copilot CLI 的 `copilot --agent --prompt` 或 ACP 可保留為未來可選的 headless／terminal adapter，但不屬於目前第一版決策。

### 第一版建議組合

| 元件 | 建議用途 | 是否承擔 workflow correctness |
|---|---|---|
| Installer／management CLI | 下載、安裝、更新、移除 adapter 與 matching core | 否，不執行 AI workflow |
| PowerShell core | 合法 action、狀態、驗證、worktree、Git 與 approval event | 是，唯一權威 |
| User-facing custom agent | VS Code Chat 操作入口、參數收集、呼叫 core、dispatch subagent、呈現人工關卡 | 否，不自行決定 transition |
| Role subagents | PM、Plan/SA/SD、Developer、Reviewer、Knowledge 的語意 worker 與工具隔離 | 否，只處理一個 action 並產生 outcome |
| Repository hooks | 在 Copilot tool 執行前立即阻擋禁止的 Git／路徑操作，並記錄 session／tool audit | 否，defense in depth；core 必須重複驗證 |
| `copilot-instructions.md` | 精簡宣告「Agent Work Team 一律經 core、不得自行改 state、不得繞過 approval」 | 否 |
| Skills | 需要時按需載入共用 domain knowledge 或較長工作方法 | 否，第一版可不安裝 |
| Prompt files | 可選的 VS Code Chat slash command 捷徑 | 否，第一版非必要 |

### 第一版建議執行序列

```text
1. User selects "Agent Work Team" in VS Code Chat
  - asks to create, resume, develop, or document a request

2. User-facing Agent Work Team custom agent
  - invokes PowerShell core with the user's intent and request id
  - receives exactly one next_action plus action input/output paths

3. User-facing agent dispatches one role subagent
  - PM / Plan-SD / Developer / Reviewer / Knowledge

4. Role subagent
  - reads only the supplied action and allowed project context
  - edits/tests only inside the isolated worktree when role permits
  - does not change state, branch, stage, commit, or approval
  - writes or returns a schema-shaped outcome for staging

5. User-facing custom agent invokes PowerShell core
  - validate outcome schema and semantics
  - validate diff, allowed paths, tests, hashes, and action id
  - stage/commit when permitted
  - append audit event
  - perform the one legal state transition

6. Loop or human gate
  - run the next action, or
  - display the artifact and wait for explicit approval
```

User-facing custom agent與 core 不應從一般對話文字判斷成功。Worker 必須依 action contract 產生 outcome，由 core 驗證後才接受。Staging 不是正式 artifact，也不能由 Agent 直接改寫權威 state。

### Custom agents：第一版必需

建議安裝一個 user-facing orchestrator 與五個 role subagents：

```text
.github/agents/
├── agent-work-team.agent.md
├── agent-work-team-pm.agent.md
├── agent-work-team-plan-sd.agent.md
├── agent-work-team-developer.agent.md
├── agent-work-team-reviewer.agent.md
└── agent-work-team-knowledge.agent.md
```

`agent-work-team.agent.md` 是使用者在 VS Code Chat Agent picker 選擇的入口；五個角色 agent 應設為不直接顯示給一般使用者，只供 orchestrator 作為 subagent 呼叫。

若工具安裝到單一專案，使用 repository-level `.github/agents/`，讓 agent contract 能跟專案中的 core／protocol version 一起追蹤。若未來支援使用者層級安裝，installer 仍必須維護 manifest 與版本相容性。Installer 不得無條件覆寫使用者既有同名 customization，需用 managed files、managed block 或衝突提示處理。

角色權限建議：

- PM／Plan：讀取 action input 與必要專案內容；只寫 staging outcome。
- Developer：可讀、編輯隔離 worktree並執行必要 build／test；不能執行 Git mutation。
- Reviewer：read/search/受限 test，禁止 edit 與 Git mutation。
- Knowledge：讀取 request artifacts；只能寫入 core 指定的隔離或 staging 範圍。
- User-facing orchestrator：可呼叫 PowerShell core 與 role subagents；不直接實作角色工作，不直接修改權威檔案。

### Hooks：建議安裝，但只作第二道防線

建議至少提供 `preToolUse` hook：

- 阻擋 Agent 執行 `git add`、`git commit`、`git checkout`、`git switch`、`git worktree`、`git reset`、`git push` 等由 core 擁有的操作。
- 阻擋寫入 action 所允許 worktree／staging 以外的位置。
- Reviewer 使用 edit／write 時直接 deny。
- 所有判斷同時由 core 在接收 outcome 後重驗，避免 hook 未載入或被繞過。

Hook 應快速、可稽核，且呼叫同一套 PowerShell policy function；不要在 hook 內重寫另一份 Git 規則。

### Instructions：需要，但只能是短版 bootstrap

`copilot-instructions.md` 應只包含每個 Copilot 工作都必須知道的規則：

- Agent Work Team action 必須由已安裝 CLI／core 建立。
- 不直接修改 `.agent-work-team` 的權威 state／progress／events。
- 不自行建立 branch、stage、commit 或跳過人工 approval。
- 依 action ID 與 staging contract 回傳結果。

完整 state machine、schema 與 retry policy 只存在 core 與正式 architecture docs，不複製進 instructions。

### Skills：第一版非必要

Custom agent 本身已能定義角色、工具與輸出格式。第一版先不建立 skill，可以減少 discovery 與版本同步複雜度。

只有出現下列實際重用時再加 skill：

- 多個 agent 共用一套長篇 domain procedure。
- 需要連同 scripts／templates／references 按需載入。
- 該知識不屬於 state machine，且不會驅動合法 transition。

Skill 不得建立 request、改 state 或決定下一個 action。

### Prompt files：VS Code Chat 第一版非必要

`.prompt.md` 是 VS Code Chat 的單次任務／slash command 入口。第一版已有 user-facing custom agent，因此 prompt files 不是必要元件。

若希望保留 `/agent-work-team-develop` 類似的快捷體驗，可以額外提供薄 prompt files，但它們只能切換／委派到同一個 user-facing custom agent，再呼叫同一個 core，不得內嵌 workflow。

### GitHub Copilot CLI／ACP：不屬於第一版 runtime

先前曾建議第一版由 PowerShell CLI 使用 `copilot --agent=<name> --prompt <task>` 啟動 worker。經使用者釐清，這不是本專案對「CLI」的定義，因此該建議被取代。

GitHub Copilot CLI／ACP 可在未來需要下列能力時，作為另一個 host adapter 另行評估：

- Headless 或 terminal-only workflow。
- 長時間保留或恢復同一 Copilot session。
- Streaming 顯示與程式化 permission callback。
- 一個 process 管理多個 agent session。
- 外部 UI 或 IDE client。

它們不得與 VS Code Chat adapter 各自實作不同的 state machine。

### 不建議的做法

- 不給 user-facing custom agent 或 role subagent 無限制工具；依角色只提供最低必要工具。
- 不讓 Copilot custom agent自行呼叫「下一個 agent」完成整段 pipeline。
- 不讓 prompt、skill、agent 與 hook 各保存一份 stage transition 表。
- 不解析自由文字 `DONE`／`Approved` 作為流程事件。
- 不把 custom agent 安裝成功視為 core／protocol 相容。

此選型已由使用者於 2026-07-20 核准，成為 GitHub Copilot VS Code Chat adapter 的第一版實作要求。GitHub Copilot CLI／ACP 仍只屬未來可選 adapter，不包含在本次核准範圍。

## 15. Claude Code 規畫與實作就緒邊界

本文件與相關現況／議題／報告文件已足以供 Claude Code：

- 理解現行 Claude Code plugin 的 as-is 行為。
- 依已核准決策建立 architecture spec、implementation plan 與 task breakdown。
- 在獨立分支上實作不依賴未決問題的基礎能力。
- 維護 Decision Log、Implementation Mapping 與 Verification Evidence。

Claude Code 規畫時的讀取順序：

1. `CLAUDE.md`：repository 規則與 living document 維護義務。
2. `docs/agent-work-team-current-state-context.md`：現行工具 as-is 快速基線。
3. 本文件：已核准 target direction、責任邊界與未決問題。
4. `docs/discussions/2026-07-20-current-limitations-issues.md`：議題與優先級。
5. `docs/reports/2026-07-20-current-limitations-recommendation-report.md`：整體建議脈絡。
6. 實際 owning command／agent／hook：實作前核對真實現況。

可直接納入規畫／實作的已核准範圍：

- Host-neutral、PowerShell 7+ workflow core。
- CLI 作為 adapter／core 的安裝、更新、移除與版本檢查工具。
- Claude Code plugin 與 GitHub Copilot VS Code Chat adapter 共用 core。
- Copilot user-facing custom agent + hidden role subagents。
- Core 掌握 state、transition、validation、retry、worktree 與 Git 副作用。
- Developer 使用隔離 worktree；Reviewer 唯讀。
- Event log 第一階段 audit-only；`state.json` 保持權威。
- Hooks 作第二道防線；short instructions 必要；skills／prompt files 第一版非必要。
- Human approval 採 artifact-bound、single-use challenge，assurance 為 `local-explicit`。
- Validator 採 hard validator、policy gate、advisory check 三層模型。
- Legacy request 採 side-by-side protocol 與 explicit、stage-aware migration。

`DET-Q1` 至 `DET-Q8` 均已決定。Claude Code 可將完整第一版架構納入分階段 plan；但「方向已核准」不等於「runtime 已實作或驗證」，不得在沒有可執行證據時宣稱端到端相容。

任何 implementation plan 都必須保留現有人工核准關卡、可閱讀 artifact 與既有 request 資料，除非後續決策明確修改。

### 已核准交付策略

實作不得採「先完整重寫 Claude Code plugin，最後才處理 Copilot」，也不得在 core contract 尚未穩定時平行完成兩套 adapter。採用以下交錯策略：

1. **Core contract 先行**：先定義 PowerShell core command surface、protocol manifest、outcome envelope、transition table、approval challenge、validator result、event、錯誤碼及 host-neutral contract tests。
2. **Claude Code 第一個垂直切片**：利用現有 plugin 作行為基線，先驗證一個同時涵蓋 state、artifact、resume 與 human approval 的 Planning 切片；legacy workflow 以 side-by-side protocol 保留。
3. **Copilot 提早驗證同一切片**：在 Claude 切片穩定後立即建立最薄的 VS Code Chat adapter，以相同 golden scenario 驗證 state、event 與 artifact 等價，及早發現 core 的 host-specific 假設。
4. **後續按能力切片擴充**：每個 workflow 能力依 `Core → Claude adapter → Copilot adapter parity` 推進，不以「先完成某個 host 的全部功能」作排程單位。
5. **安裝／管理 CLI 後收斂**：早期只建立可重現的開發安裝方式；待 core 與 adapter layout 穩定後，再固定 install、update、remove 與 version compatibility 行為。

此交付策略依議題類型套用：

| 類型 | 議題 | 交付路線 |
|---|---|---|
| 共用 workflow core | `LIM-01`～`LIM-05`、`CAP-09`、`CAP-11` | 直接採 Core → Claude → Copilot parity |
| 具前置條件的 core 能力 | `LIM-06`、`BND-04`、`CAP-06`～`CAP-08` | 先完成基礎可靠性與個別產品決策，再採相同切片流程 |
| 外部整合／操作介面 | `CAP-01`～`CAP-05`、`CAP-10` | Core event／API → 單一 integration provider → 各 host 顯示；不得在兩個 adapter 複製整合邏輯 |
| 刻意安全邊界 | `BND-01`～`BND-03`、`CAP-12` | 預設保留；可改善證據與 UX，不以移除邊界作為修復 |

每個跨 host workflow 切片只有在下列條件全部成立時才算完成：

- Host-neutral core contract tests 通過。
- Claude Code adapter 行為測試通過。
- Copilot adapter 對同一 golden scenario 產生等價 state、event 與 artifact。
- Adapter 沒有自己的 transition、retry 或 validation 規則副本。
- Legacy request 未被自動或半完成遷移。
- Implementation Mapping 與 Verification Evidence 已更新。

Q4-Q6 已確立 approval、validator 與 migration contract，但不代表 `LIM-02`、`LIM-03`、`LIM-05` 的 implementation details 已完成；Git preflight、跨檔案 transaction 與 repair policy 仍需在對應 spec／plan 中具體化。

## 16. 非目標

本議題目前不直接處理：

- GitHub Copilot 的具體檔案格式與 API 選型。
- 自動 merge。
- Task 平行排程。
- Web dashboard。
- 移除人工核准。
- 將所有 Agent 判斷改成規則引擎。

## 17. 決策問題紀錄

使用下表持續保留問題與決策結果；新問題未決時標記為 `Open`，不得在沒有決策時刪除。

| ID | 問題 | 狀態 | 決定／備註 |
|---|---|---|---|
| DET-Q1 | 核心 Controller 是否要跨 host 共用？ | Decided | 是；採 host-neutral workflow core，Claude Code 與 GitHub Copilot 共用狀態機與控制規則 |
| DET-Q2 | 事件紀錄是否為 state 的可重建來源，或只作 audit？ | Decided | 第一階段 audit-only；`state.json` 維持權威，不自動由 event 重建 state |
| DET-Q3 | Agent 是否仍可直接修改產品檔案，或只回傳 patch／change set？ | Decided | 採混合選項 C：Developer 在 core 建立的隔離 worktree 編輯／測試；core 控制 branch、stage、commit；Reviewer 唯讀 |
| DET-Q4 | Human event 如何取得可驗證 identity？ | Decided | 採 artifact-bound、single-use challenge；assurance 為 `local-explicit`，不宣稱真實身份驗證；強身份留作 provider |
| DET-Q5 | 哪些語意 validator 必須阻擋 transition？ | Decided | 確定性 hard validators 可阻擋；結構化 AI outcome 由固定 policy gate 處理；advisory 不阻擋；validator 無法判斷時 fail closed |
| DET-Q6 | 現有 JSON／Markdown 如何向新 protocol 漸進相容？ | Decided | 採 side-by-side protocol；安裝不自動遷移；explicit dry-run、人工確認、snapshot、stage-aware converter 與 atomic validation 後才遷移 |
| DET-Q7 | Host-neutral core 採何種語言、包裝與配布方式？ | Decided | PowerShell 7+ 為主；CLI 只負責安裝／管理；core 隨 Claude plugin／Copilot VS Code Chat adapter 一起安裝並檢查版本相容性 |
| DET-Q8 | GitHub Copilot 的 prompt／skill／agent／hook 如何分工？ | Decided | VS Code Chat user-facing custom agent 作入口；hidden role subagents 執行單步工作；core 唯一掌握流程；hooks 第二道防線；short instructions 必要；skills／prompt files 第一版非必要 |

### DET-Q4 Human approval 的 identity 與 assurance

#### 問題真正含義

現行流程把對話中的「approve／可以／沒問題」視為人工核准，但 core 若只收到 adapter 傳入的字串，無法證明：

- 這句話確實來自人類的最新一輪輸入，而不是 Agent 自行生成。
- 說話者是特定 GitHub／企業帳號。
- 核准的是目前這一版 artifact，而不是修改前內容。

純 custom agent、Prompt 或本機 PowerShell 無法提供密碼學等級的人類身份證明。第一版必須誠實區分「明確的人類意圖紀錄」與「經外部身份系統驗證的簽核」。

#### 選項 A：一般聊天文字

- Adapter 判斷使用者是否說 approve。
- 操作最簡單，但 Agent 可能誤判語意，artifact 變更後也可能沿用舊核准。
- 不建議作為新 core 的正式 approval contract。

#### 選項 B：本機 challenge-bound approval

- Core 進入 approval gate 時產生一次性 challenge，綁定 `request_id`、`action_id`、stage 與 artifact hash。
- VS Code Chat 顯示固定格式，例如：`approve RQ-001 7F3A9C`。
- 只有使用者下一輪明確提供 matching challenge，adapter 才能呼叫 core 的 approve action。
- Core 驗證 challenge 未使用、未過期、stage 與 artifact hash 未變，再寫入 approval event。
- 記錄 host、session ID（可取得時）、OS user、Git identity 等 attribution metadata，但 assurance 標示為 `local-explicit`，不宣稱已驗證真實身份。

#### 選項 C：外部身份系統核准

- 以 GitHub PR review、企業 SSO-backed approval service 或其他獨立身份系統作為核准來源。
- 可取得較強的身份與稽核保證，但需要外部服務、權限分離與防止 Agent 使用相同 credential 自行核准。
- 適合未來多人／合規模式，不適合作為本機第一版必要前提。

#### 第一版決策

採 **選項 B：local challenge-bound approval**，狀態為 `Approved`：

- Challenge 至少綁定 request、stage、action、artifact hash、expiry 與 single-use nonce。
- Core 只接受完全匹配的顯式 approval，不接受模糊同義詞自行推論。
- Artifact hash 改變後，舊 challenge 立即失效並重新要求核准。
- Approval event 記錄 attribution metadata 與 `assurance: local-explicit`。
- Agent／adapter 不得聲稱已驗證 GitHub 帳號或法定身份。
- 未來可增加 `github-reviewed`／`enterprise-verified` assurance provider，但不得改變核心 approval event contract。

核准決策：

> 第一版 Human approval 採 artifact-bound、single-use challenge，提供本機明確意圖與可稽核 attribution，不宣稱密碼學身份驗證；強身份核准留作可插拔 provider。

### DET-Q5 阻擋 transition 的 validator

#### 問題真正含義

不是所有「檢查」都應有權阻擋流程。若讓非確定性 AI 評語直接成為 core validator，會把不穩定性重新帶回狀態機；若只做 JSON Schema，又無法阻止跨檔案、Git 或 approval 不一致。

建議將檢查分成三層：

1. **Hard validator**：確定性、可重現；失敗時不改 state，action 回報 validation failure／Blocked。
2. **Policy gate**：Core 對已驗證的結構化 Agent outcome 套用固定規則，例如有 Critical issue 就不能 approve。
3. **Advisory check**：品質提示，不直接改變合法 transition。

#### 建議 Hard validators

下列任一失敗都應阻擋 transition：

- **Protocol／identity**：protocol、schema、request ID、token、action ID、role 與 core／adapter version 相容。
- **State legality**：from stage／status、event、to stage 符合集中 transition table；action 未完成或已被消耗時不得重放。
- **Schema**：必要 artifact 可解析且符合 versioned JSON Schema。
- **Referential integrity**：task ID 唯一；report／review 對應正確 task；所有引用 artifact、commit、action 存在。
- **Artifact integrity**：輸入與 approval 綁定的 hash 未改變；staging 與正式 artifact 邊界正確。
- **Git safety**：repository、worktree、branch、lock、allowed paths、diff 與預期 request／task 一致；Agent 未執行 core 專屬 Git mutation。
- **Required execution evidence**：task／transition 宣告為必要的 build、test 或 validator 已實際執行且 exit code 成功；不得只接受 Agent 文字聲稱通過。
- **Review completeness**：final review commit range 包含所有核准 task commits；沒有遺漏或額外未歸屬 commit。
- **Retry／idempotency**：counter、action status、nonce、event ID 與 lock 沒有重複、倒退或超限。
- **Human gate**：matching challenge、stage、artifact hash、expiry 與 single-use 條件全部通過。

#### 建議 Policy gates

Core 不判斷程式碼好不好，而是對結構化結果套用固定政策：

- Reviewer outcome 含 Critical／Important issue：轉入修正，不進 approval。
- Agent outcome 是 `needs_context`：保持 stage，依 policy 重試或等待人類。
- Agent outcome 是 `blocked`／`failed`：不推進成功路徑，記錄原因。
- `completed_with_concerns`：依 action policy 決定是否允許進人工 gate，但 concerns 必須顯示且持久化。

Reviewer 如何判斷 issue 嚴重度仍是非確定性 Agent 工作；core 只驗證 outcome contract 並確定性套用政策。

#### Advisory checks

以下預設不應單獨阻擋 transition：

- 文案風格、命名偏好或一般改善建議。
- 沒有對應客觀規則的「設計是否最佳」。
- AI 推測的 AC 覆蓋品質分數。
- Minor review issues。

若某 advisory 未來要升級為 hard validator，必須先定義可重現規則、錯誤碼、修復方式與測試。

#### 第一版決策

採上述 **三層模型**，狀態為 `Approved`。Hard validator 採 fail-closed：validator error、timeout 或無法判斷時，不得視為通過；回報可區分 `validation_failed`、`validator_error` 與 `blocked`。

核准決策：

> 只有確定性、可重現的 hard validators 能直接阻擋 transition；AI 判斷必須先成為 versioned structured outcome，再由 core 的固定 policy gate 處理；advisory 不直接改變 state。

### DET-Q6 舊 JSON／Markdown 與在途 request 的漸進相容

#### 問題真正含義

新 core 會增加 protocol、schema、action、event、worktree 與 approval contract；現有 request 沒有這些欄位。若安裝時自動改寫所有資料，可能損壞仍可由舊 plugin 續接的需求；若完全不處理，新 adapter 又可能誤讀 legacy request。

#### 核准相容策略

採 **side-by-side protocol + explicit migration**，狀態為 `Approved`：

1. **Legacy detection**
  - 沒有 request protocol manifest 的需求視為 `legacy-v0`。
  - 新 core 不依欄位猜測後直接改寫。

2. **Sidecar manifest**
  - 新需求建立 request-level manifest，記錄 protocol、schema set、core version、adapter version 與 artifact map。
  - 優先使用 sidecar，避免為了加 version 而一次重寫所有舊 JSON／Markdown。

3. **No automatic migration on install**
  - 安裝／更新 CLI 只能掃描與報告 legacy requests，不得自動轉換。
  - Legacy request 不得同時由舊 Prompt workflow 與新 core 寫入。

4. **Explicit migration command**
  - 提供 dry-run，列出可遷移、需人工處理與不支援項目。
  - 使用者明確確認後才取得 request lock、建立不可變 migration snapshot，並執行轉換。
  - 先寫 staging、驗證，再原子替換／新增 sidecar；失敗時保留 legacy 資料並可回滾。

5. **Stage-aware policy**
  - `DONE`：預設只讀／封存，不強制遷移。
  - `SPEC_APPROVED`、`DEV_APPROVED`、各 Pending Approval gate：可作為優先支援的乾淨 migration boundary。
  - `BA_CLARIFYING`、`DEVELOPING`、`TESTING` 等進行中階段：需要專屬 converter 與完整 checkpoint／progress 驗證；沒有 converter 時必須先用 legacy adapter完成到安全 boundary，或人工處理，不能猜測。

6. **Baseline audit event**
  - 遷移完成後新增 `MIGRATION_BASELINE` event，記錄 legacy snapshot hash、原 stage／status、converter version 與產物 hash。
  - 因 DET-Q2 採 audit-only，這個 event 不代表 events 可重建遷移前歷史。

7. **Compatibility gate**
  - Adapter 啟動時檢查 request protocol；不支援時停止並提供 migrate／legacy route，不得嘗試 best-effort 寫入。
  - 同一 request 同一時間只能有一個 protocol writer。

8. **Markdown preservation**
  - 既有人類可讀 Markdown 預設原樣保留。
  - JSON／manifest 是機器契約；Markdown 只有在內容確實需要更新時才重建，不能因 schema migration 造成無意義格式 churn。

#### 第一版核准支援範圍

- 新建立 request：只寫新 protocol。
- Legacy completed request：可讀、可顯示，不強制轉換。
- Legacy active request：先提供 inventory／dry-run；第一版只自動遷移已明確實作 converter 的安全 stage。
- 不支援 stage：停止並提供具體人工路徑，不刪除、不猜測、不半轉換。

核准決策：

> 新舊 request 採 side-by-side protocol；安裝時不自動遷移。Legacy request 經 explicit dry-run、人工確認、snapshot、stage-aware converter 與 atomic validation 後遷移；不支援狀態 fail closed，且同一 request 不允許新舊 writer 併行。

## 18. Decision Log

| 日期 | 決策 | 狀態 | 核准者 | 影響 |
|---|---|---|---|---|
| 2026-07-20 | 提出「確定性 Controller + 非確定性 Agent」作為討論方向 | Proposed | 尚未核准 | 作為後續討論基線，不得視為實作授權 |
| 2026-07-20 | 採方案 B：建立 host-neutral workflow core；Claude Code 與 GitHub Copilot 使用各自 adapter，但共用狀態轉移、事件、驗證、重試與 Git 安全規則 | Approved | 使用者 | 核准責任邊界與跨 host 共用原則；實作形式與其他未決問題另行決定，且目前尚未實作 |
| 2026-07-20 | Host-neutral core 以 PowerShell 7+ 為主；整體產品採 CLI 安裝／管理；Copilot 採 CLI adapter；core 隨所選 adapter 一起安裝 | Approved | 使用者 | 關閉 DET-Q7；CLI 與 adapter 必須檢查 core／protocol version 相容性 |
| 2026-07-20 | Event log 第一階段採 audit-only；`state.json` 保持權威且不自動從 events 重建 | Approved | 使用者 | 關閉 DET-Q2；先建立事件稽核與一致性診斷，不承諾 event sourcing |
| 2026-07-20 | Developer 在 core 建立的隔離 worktree 編輯與測試；core 掌握 Git 副作用；Reviewer 唯讀 | Approved | 使用者 | 關閉 DET-Q3；worktree lifecycle 與外部 vault policy 留待實作設計 |
| 2026-07-20 | 釐清 CLI 僅為安裝／管理工具；GitHub Copilot 第一版 runtime 為 VS Code Chat user-facing custom agent，而非 GitHub Copilot CLI | Approved clarification | 使用者 | Supersedes 上述「Copilot 採 CLI adapter」措辭；保留 PowerShell core 與配布決策，重開 Q8 的 VS Code Chat customization 分工 |
| 2026-07-20 | GitHub Copilot 第一版採 VS Code Chat user-facing custom agent + hidden role subagents；core 掌握流程；hooks 作第二道防線；short instructions 必要；skills／prompt files 非必要 | Approved | 使用者 | 關閉 DET-Q8；可開始規畫 Copilot adapter，GitHub Copilot CLI／ACP 不在第一版範圍 |
| 2026-07-20 | Human approval 採 artifact-bound、single-use challenge，提供 `local-explicit` assurance；強身份留作 provider | Approved | 使用者 | 關閉 DET-Q4；核准綁定 artifact，不宣稱本機 attribution 等同真實身份驗證 |
| 2026-07-20 | Validator 採 hard validator、policy gate、advisory check 三層模型；只有確定性檢查可直接阻擋，無法判斷時 fail closed | Approved | 使用者 | 關閉 DET-Q5；AI outcome 必須結構化，再由 core 固定政策處理 |
| 2026-07-20 | Legacy request 採 side-by-side protocol 與 explicit migration；安裝不自動轉換，不支援 stage fail closed | Approved | 使用者 | 關閉 DET-Q6；需 dry-run、人工確認、snapshot、stage-aware converter、atomic validation，且禁止新舊 writer 併行 |
| 2026-07-20 | 交付採 Core contract 先行、Claude 第一個垂直切片、Copilot 提早驗證同一切片，後續按能力維持雙 adapter parity | Approved | 使用者 | 不採 Claude 全部完成後才做 Copilot，也不在 contract 未穩定時全面平行開發；外部整合與安全邊界依類型走不同路線 |

新增決策時只 append，不覆寫歷史。若決策被取代，將舊項標記為 `Superseded` 並連結新決策。

## 19. Implementation Mapping

架構方向已核准，但尚未開始實作。本表在實作發生時由 Claude Code 更新：

| Concern | Current owner | Proposed/implemented owner | Code or artifact | Status |
|---|---|---|---|---|
| Stage routing | Command Prompt／Controller | Host-neutral workflow core | `commands/agent-work-team*.md` | Approved direction; not implemented |
| Retry limit | Prompt + hook | Host-neutral workflow core | `hooks/enforce-block.mjs` | Approved direction; not implemented |
| Dashboard rebuild | Hook | Hook | `hooks/sync-dashboard.mjs` | Current |
| Artifact schema | 部分 Prompt 檢查 | Host-neutral workflow core | 尚無統一 schema | Approved direction; not implemented |
| Action idempotency | Stage/progress 推論 | Host-neutral workflow core；event log 第一階段 audit-only | 尚無 action log | Approved direction; not implemented |
| Git side effects | Developer／Controller Prompt | Core 建立隔離 worktree並控制 branch／stage／commit；Developer 編輯／測試；Reviewer 唯讀 | `commands/`、`agents/` | Approved direction; not implemented |
| Core runtime／distribution | 尚無 | PowerShell 7+ CLI；隨 adapter 安裝 | 尚無實作 | Approved direction; not implemented |
| Copilot workflow entry | 尚無 | VS Code Chat user-facing custom agent + hidden role subagents | `vscode-extension-github-copilot/` 目前為空 | Approved direction; not implemented |
| Human approval assurance | 對話中的自然語言核准 | Core 產生 artifact-bound、single-use challenge；adapter 只轉交 matching explicit approval | 尚無實作 | Approved direction; not implemented |
| Transition validation | 分散的 Prompt 欄位／語意檢查 | Core hard validators + deterministic policy gates；advisory 不阻擋 | 尚無統一 validator | Approved direction; not implemented |
| Legacy request compatibility | 現行 JSON／Markdown 直接由 Prompt workflow 讀寫 | Side-by-side protocol + explicit stage-aware migration | 尚無 manifest／converter | Approved direction; not implemented |

## 20. Verification Evidence

`docs/manual-testing-checklist.md` 已過時，必須忽略。只記錄本議題相關且可在目前版本重新執行的驗證：

| 日期 | 變更／行為 | 驗證命令或方法 | 結果 | 證據位置 |
|---|---|---|---|---|
| 2026-07-20 | 建立討論文件與 Claude Code 維護入口，未修改 runtime 行為 | Frontmatter／必要章節契約檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 記錄方案 B 核准、關閉 DET-Q1 並同步決策文件，未修改 runtime 行為 | 決策欄位／Decision Log／未決問題一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 記錄 PowerShell／CLI／配布決策，補充 DET-Q2、DET-Q3、DET-Q8 討論建議，未修改 runtime 行為 | 決策與未決問題一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 核准 DET-Q2 audit-only 與 DET-Q3 隔離 worktree 責任邊界，未修改 runtime 行為 | 決策欄位／Decision Log／Implementation Mapping 一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 補充 DET-Q8 的 Copilot CLI programmatic invocation、custom agents、hooks、instructions、skills、prompt files 與 ACP 選型說明，未修改 runtime 行為 | Q8 必要段落／安全邊界／Open 狀態檢查、官方 GitHub Copilot CLI 文件核對、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 釐清 CLI 為安裝／管理入口，Copilot 第一版操作介面改為 VS Code Chat custom agent；先前 Copilot CLI runtime 建議標記為 superseded | 決策歷史／Q7／Q8／Implementation Mapping 一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 核准 DET-Q8 並新增 Claude Code 規畫／實作就緒邊界，未修改 runtime 行為 | Q8／Decision Log／Implementation Mapping／就緒邊界一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 核准 DET-Q4-Q6 的 approval assurance、validator 分層與 legacy migration contract，未修改 runtime 行為 | Q4-Q6／Decision Log／Implementation Mapping／就緒邊界一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |
| 2026-07-20 | 核准分階段交錯交付策略及 LIM／BND／CAP 適用分類，未修改 runtime 行為 | Delivery strategy／議題分類／報告波次一致性檢查、Markdown diagnostics、`git diff --check` | Passed | `docs/plugin-current-state` 分支的本次 diff |

未執行的測試不得記為通過。Prompt 中描述的預期行為不得直接當作 runtime 驗證證據。

## 21. 自我更新檢查表

Claude Code 在相關變更完成前逐項確認：

- [ ] 已讀取實際 owning command／agent／hook，不只依賴本文。
- [ ] 已更新 metadata 日期。
- [ ] 已保持 `Proposed` 與 `Approved` 的區別。
- [ ] 已更新責任邊界或明確註記無變更。
- [ ] 已更新未決問題與 decision log。
- [ ] 已更新 implementation mapping。
- [ ] 已記錄本次真正執行的驗證，不引用過時清單。
- [ ] 已同步現況文件中受影響的 as-is 描述。
- [ ] 已執行 Markdown／diff 檢查。

## 22. 相關文件

- `CLAUDE.md`
- `docs/agent-work-team-current-state-review.md`
- `docs/agent-work-team-current-state-context.md`
- `docs/discussions/2026-07-20-current-limitations-issues.md`
- `docs/reports/2026-07-20-current-limitations-recommendation-report.md`
