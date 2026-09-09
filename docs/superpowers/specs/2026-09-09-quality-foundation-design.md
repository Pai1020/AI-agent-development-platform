# 第一輪：品質基準與 Agent 契約設計草案

- 日期：2026-09-09
- 狀態：Proposed，供審閱；本次只建立計畫，沒有修改 runtime。
- 程式基準：`7ccbaf7`，實際 owning command／agent 優先於現況摘要。
- 來源：使用者指定的 `C:/Users/Patrick/Documents/Codex/2026-09-09/1-1-5-1-n6-2/refactor/2026-09-09-development-priorities.md`，第 1 輪 N6／N1／N3／N4。
- 實作計畫：[第一輪任務](../plans/2026-09-09-quality-foundation.md)。

## 1. 目標與方案

以固定案例衡量規劃、測試交接及審查品質，補強現行 Claude Code plugin，並將輸入／產出契約留給後續 core 沿用。

採「先建立小型評測，再增補 Agent 契約及必要 Controller 路由」。僅改 Prompt 最省初期成本，但無法判斷改善是否有效，也會留下 spec gap 被反覆派修的問題；直接導入全部 core 則將內容品質與流程改造混在一起，增加定位成本。本輪選擇中間方案。

本輪不建立 PowerShell core、Copilot adapter、安裝 CLI、migration、平行派工或正式需求變更系統。不改現有 commit mode、token、人工核准與 stage 名稱。新增路由仍是 Prompt 約束，不能宣稱已具確定性 core 保證。

## 2. 已確認缺口

| 證據 | 現況 | 本輪回應 |
|---|---|---|
| `agents/agent-work-team-plan-sd.md` 的 tools／輸入 | 只有 Read、Write，明列輸入是 BA artifact | 增加限定範圍的 Glob／Grep 調查，區分事實與假設 |
| 同檔 `test_plan` 範例 | 字串，task 沒有可識別測試交接 | 保留字串，加可選結構化 `verification_plan` |
| `commands/agent-work-team-develop.md` Step 5.3 | Developer 收 task 與 technical_design | 傳完整 test_plan 及適用 verification entries |
| 同檔 Step 6 | 整體 diff review，沒有獨立整體驗證證據契約 | Controller 執行整合驗證，Reviewer 查核證據 |
| `agents/agent-work-team-reviewer.md` | 未明列 BA／原始需求；問題只有嚴重度 | 加來源脈絡、問題種類、spec gap 停止規則 |
| develop Step 5／6 | Blocked 重跑時會清 counter／繼續 | spec gap 必須在原有清除流程前重讀，不能靠重跑自動解除 |
| `commands/agent-work-team.md` | `raw_description` 來自對話，初始 state 不保存 | 新 request 保存獨立原始需求 artifact；舊資料不補造 |

## 3. 固定案例與品質規則（N6）

案例版本 `quality-v1`；fixture 是合成、離線、小型 Git repository，與正式專案／外部 vault 分離。每次從相同初始內容開新 session，答案與評分規則留在評測者目錄，不放進 Agent 可搜尋的 fixture。

| ID | 固定情境 | 預期判斷與觀察 |
|---|---|---|
| Q1 | 現有 `src/normalize-name.mjs`，需求要求新增搜尋且使用相同正規化 | Planner 找到並引用既有服務，避免另造正規化邏輯 |
| Q2 | 需求只說「讓搜尋更好」，fixture 有大小寫及空白處理 | BA 問成功標準、匹配語意與範圍；未確認前不逕行定規格 |
| Q3 | 新搜尋實作使用 `startsWith`，已核准 AC 明定 substring | Reviewer 定位錯誤，歸類 implementation，不憑報告放行 |
| Q4 | task 各自單測通過，UI 呼叫 API 的參數名稱不一致 | 實際執行整合案例並記 failed；不能把單測當端到端通過 |
| Q5 | 原始／BA 要 substring，spec 誤寫 prefix，實作完全遵照 spec | Reviewer 分開 spec_compliant 與 requirement_satisfied；回報 spec_gap，Controller 停止派修 |
| Q6 | 只修正錯字，wiki 已有相關內容，無新決策 | 不硬造五類主題筆記；允許現行必須維護的 request Hub／Index |

每個案例每個版本做 3 次獨立執行。改善前全套 18 次；N1 後 Q1 三次；N3 後 Q4 三次；N4 後 Q3／Q5 各三次；最後全部六例各三次作候選基準。最少 48 次案例執行，不等同 48 個 API call。若修改 N1 同時影響 BA，須另跑 Q2。

每例 4 項各 0–2 分：問題辨識、證據正確性、範圍遵守、可交接性。0=缺失或錯誤、1=部分符合且需人工補正、2=符合並有可定位證據。分別保存重要問題漏失數、無效建議數、人工修正分鐘數；分數不能抵銷捏造通過或越權修改。

預先採用以下候選基準門檻：每例改善後三次分數中位數至少 6/8，且不低於改善前中位數；任一次捏造測試通過、漏失案例指定的重要問題、未核准擴張範圍或修改產品碼的 Reviewer 均不通過。三次是低成本起點，不能據此宣稱統計顯著。差異有疑義時，以相同條件為前後版本各補 3 次並保留全部結果，不選擇性刪除低分結果。接受品質取捨需另外記錄人工理由。

每次保存 host／host version、實際模型識別與可取得的設定、plugin commit、Prompt hash、fixture hash、執行時間、原始對話／artifact、評分者、分數與各項理由。尚不存在的 core／adapter 版本記 null；不可取得的模型設定記 unknown，不能推測。比較模型成本時保留相同 fixture／Prompt，各模型獨立報告；沒有用量資料就不估算實付費用。

## 4. 原始需求與調查證據（N1／N4 共用）

新 request 在初始 state 後、PM dispatch 前保存 `original-request.json`：

```json
{"id":"RQ-001","token":"8f3a1c9d","raw_description":"搜尋應支援名稱中間的文字","captured_at":"2026-09-09"}
```

只保存使用者原文，不以 BA 摘要替換；PM 續接／BA 摘要重寫不能覆蓋原文。`CREATED` 續接若已有合法同 token 原文，沿用；檔案缺失時仍按既有流程向使用者取得描述，確認後保存；token 不一致即停止。已進入後續階段但沒有原文的舊 request，用 BA 與問答作確認後需求來源，標記 `original_request_available: false`。不得把重建摘要冒充逐字原文。

Planner 接收 `project_root` 與 `output_dir`，在需求相關入口、模組及測試做 Glob／Grep／Read；建議初始最多 3 組搜尋、10 個相關檔案，不足時說明缺口與追加調查原因，不把數字當硬性品質上限。不讀整個 repository；不執行使用者程式或改產品檔案。只寫既有 plan artifacts。`tools` 改成 `Read, Write, Glob, Grep`。

在 plan-spec 加 `repository_analysis`，保留既有欄位型別：

```json
{
  "repository_analysis": {
    "evidence": [{"path":"src/normalize-name.mjs","symbol":"normalizeName","finding":"既有名稱正規化函式"}],
    "reuse": [{"path":"src/normalize-name.mjs","reason":"搜尋使用相同正規化規則"}],
    "assumptions": [],
    "unresolved_questions": [],
    "search_scope": ["src", "tests"]
  }
}
```

引用路徑必須實際讀到；新增檔案只放 file_impact，不冒充既有證據。空 repo 可回空 evidence 並註明搜索結果。會改變驗收語意的未決問題回 NEEDS_CONTEXT；Controller 找不到已確認答案時向使用者釐清，不自行補答案。

## 5. 測試責任與結果（N3）

既有 `test_plan` 維持字串供人閱讀；新規格額外提供 `verification_plan` 陣列，每項欄位如下：

```json
{
  "id":"V1",
  "task_ids":["T1","T2"],
  "level":"integration",
  "owner":"controller",
  "required":true,
  "command":"node --test tests/search-flow.test.mjs",
  "cwd":".",
  "manual_steps":[],
  "expected":"從 UI 查詢 middle 時可收到名稱含 middle 的結果"
}
```

`level` 為 task／integration／manual；對應 owner 固定為 developer／controller／human。自動驗證 command 非空、manual_steps 空；人工驗證 command 為 null、manual_steps 非空。task_ids 必須引用已存在的 task。無法確認測試命令時由 Planner 查證或回報疑問，不捏造 package script。

Developer 每次初始、修正、NEEDS_CONTEXT 重派都收到完整 `test_plan`、完整 spec 路徑、適用 verification entries。只執行 owner=developer 的案例，integration 在 task report 註明待整體驗證。Controller 在全部 task done 後、final review 前執行 owner=controller 的命令；Reviewer 只查核來源與結果，不負責執行可能改 Git／產物的測試。

Developer report 加 `verification_results`；Controller 寫 `dev/verification-report.json/.md`。共用結果項目：

```json
{
  "verification_id":"V1",
  "status":"passed",
  "command":"node --test tests/search-flow.test.mjs",
  "cwd":".",
  "exit_code":0,
  "evidence_path":"dev/evidence/V1-run-1.txt",
  "reason":null,
  "attempt":1,
  "tested_revision":"fixture-git-head",
  "worktree_dirty":false
}
```

`status` 僅 passed／failed／not_run／blocked。未執行時 exit_code=null；人工驗證亦為 null，另附使用者實際確認內容。每次結果保留追加紀錄，`tested_revision` 實際填 Git HEAD；dirty worktree 另保存 diff 證據，不能套用舊 HEAD 的通過結果。evidence_path 相對 request 根目錄，指向原始輸出。缺證據不能標 passed。

新需求在開發前確認人工案例。必要人工案例未確認時停留 TESTING／Blocked，寫明待操作步驟；使用者回覆操作結果後才續接。必要自動驗證 failed／blocked／not_run 不得進 PENDING_FINAL_APPROVAL，也不能藉 approve 跳過；環境受阻保留證據供重試。產品失敗由既有 final review 對應至 task 修正，修正後重跑受影響的 task 和 integration 案例。

若是既有 legacy spec 沒有 verification_plan，仍傳完整 test_plan，先把可明確辨識的測試責任寫入 `dev/verification-report` 的 `legacy_mapping`，交使用者確認後執行，不覆寫已核准 plan-spec。無法辨識的必要驗證記 blocked。已在 PENDING_FINAL_APPROVAL 的舊需求，保留舊審查／核准流程並顯示「legacy：未建立新版驗證證據」，不回溯宣稱符合新版品質門檻；新 request 不適用此例外。

## 6. 原始需求導向審查與規格缺口（N4）

所有 task／final review 派工都提供原始需求可用性、BA summary／AC／clarification_log、整份 plan-spec、commit range 與測試證據路徑。Reviewer 不以 spec 取代 BA，也不以原文推翻後續使用者明確確認的限制。

既有 `issues.critical/important/minor` 保留字串陣列以免舊 consumer 失效；新增 `findings` 作機器可識別分類，同一問題用 ID 關聯到舊 issues：

```json
{
  "spec_compliant":true,
  "requirement_satisfied":false,
  "original_request_available":true,
  "findings":[{
    "id":"F1","kind":"spec_gap","severity":"important",
    "summary":"已確認 substring，但 spec 只要求 prefix",
    "requirement_ref":"ba-requirement.json#acceptance_criteria[0]",
    "evidence":["src/search.mjs:searchNames"],
    "suggested_action":"請使用者確認規格差異與後續需求範圍"
  }],
  "issues":{"critical":[],"important":["F1: substring 需求未覆蓋"],"minor":[]},
  "verdict":"Needs clarification"
}
```

kind 固定 implementation／spec_gap／out_of_scope；verdict 為原有 Approved／Needs fixes，新增 Needs clarification。requirement_satisfied 允許 true／false／null（證據不足）。缺必要需求資料、必要驗證證據，不能以 Approved 掩蓋；回 Needs clarification。out_of_scope 僅 advisory，不能阻擋核准。

路由優先序：重要 spec_gap 或必要資訊缺失 → Needs clarification；否則 critical／important implementation → Needs fixes；其餘 Approved。Minor spec gap 可為建議，但不得把尚未滿足的必要 AC 降成 Minor。

Needs clarification 時先寫 `dev/clarification.json`（request_id、token、scope、review_path、reason、open_findings、status=open），再設 state.status=Blocked、waiting_on=Human；單 task 設 task.status=blocked；stage 不動，不增加 fix counter。混合問題時先釐清，不能先修猜測的需求。

develop resume 必須在 Step 2 以及既有 counter 清除／branch 切換前讀 clarification：同 token 且 status=open 就重播問題並停止派工；只重跑命令不是解除核准。若寫 clarification 後 state 寫入中斷，仍依 open clarification 阻擋。若 token 不符停止且保留資料。

第一輪只支援兩種處理：使用者明確確認既有範圍不變，可記原文及 resolution=keep_scope、status=resolved 後重新審查；需要修改 BA／spec／task 的情況保留原需求 Blocked，引導另開需求並記錄新 RQ-ID，不自動重寫已核准 artifact、也不自動搬移已做成果。正式變更管理留 N5。重新審查前不可直接標 task done；final scope 回 TESTING 重做驗證／審查。

## 7. 固定限制與設計核准點

- 「不將尚未執行的測試或評測記為通過。」
- 「Reviewer 不直接修改產品程式碼，也不自行擴張需求。」
- 「legacy workflow 並存，同一 request 不被新舊 writer 同時修改。」
- 「docs/manual-testing-checklist.md 不得作為驗證依據。」
- 現有 `squash`／`per_task` 與人工核准、token 行為維持；本輪不導入新 core。
- 本輪評測工具用現有 Node.js ESM／內建 test，無新增 npm 依賴；PowerShell 7+ 仍是後續 core 的已核准方向。

審閱時需一起確認：品質門檻與執行次數、verification_plan 的增補相容性、Controller 的整合測試責任、Needs clarification 與持久化阻擋、舊 PENDING_FINAL_APPROVAL 的例外。這些是具體提案，不因這份文件建立而自動成為 Approved。規格獲確認後，依實作計畫逐任務開發。

## 8. 本次驗證邊界

2026-09-09，Node v22.16.0 執行 `node --test hooks/sync-dashboard.test.mjs hooks/enforce-block.test.mjs`，17 通過、0 失敗。這只驗證現有兩個 hook 的測試；本輪新增契約、品質案例、Claude 實機流程都尚未實作／執行。偵測到 claude 與 pwsh 執行入口，未驗證登入、額度或 Copilot host 能力。
