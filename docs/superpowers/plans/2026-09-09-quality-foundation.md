# Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Claude Code 若沒有此技能，依下列任務順序與驗收門檻逐項執行，不需要自行安裝技能或派多個 agent。

**Goal:** 完成第 1 輪 N6／N1／N3／N4，保留改善前後品質證據，讓後續模型能在清楚契約下接手。

**Architecture:** 保留現行 Markdown command／agent 與 Node hooks；用新增 artifact 欄位、測試證據、最小 clarification 停止規則補足交接。不在這一輪建立另一套 state machine。

**Tech Stack:** Claude Code plugin Markdown、JSON、Node.js ESM／`node:test`、Git。後續 core 採 PowerShell 7+，不在此輪引入。

**Spec:** [品質基準與 Agent 契約設計](../specs/2026-09-09-quality-foundation-design.md)。狀態 Approved（2026-09-09，使用者核准）；任務內容是待逐項執行的實作指示，checkbox 完成不代表品質已驗收（見各任務驗收條件）。

## Global Constraints

- 「不將尚未執行的測試或評測記為通過。」
- 「Reviewer 不直接修改產品程式碼，也不自行擴張需求。」
- 「legacy workflow 並存，同一 request 不被新舊 writer 同時修改。」
- 「docs/manual-testing-checklist.md 不得作為驗證依據。」
- 現有 `squash`／`per_task` 與人工核准、token 行為維持；本輪不導入新 core。
- 本輪評測工具用現有 Node.js ESM／內建 test，無新增 npm 依賴；PowerShell 7+ 仍是後續 core 的已核准方向。

## 執行前與任務依賴

先讀 `CLAUDE.md`、spec、`docs/architecture/prompt-orchestration-determinism.md`，核對 Git HEAD／未提交變更；在獨立 `codex/` 分支工作，不把使用者 `.obsidian/` 或原始 refactor 文件順手 stage。這份計畫基於 `7ccbaf7`；若 owning 檔案已改，先對比介面再開始，不能機械貼上舊行號。

順序：T1 評測工具與案例 → T2 改善前實測 → T3 Planner → T4 測試交接 → T5 需求導向審查／續接 → T6 最終回測與交接。

每個 T 是可 review 的交付單位；下列 checkbox 是執行步驟。完成一項才開下一項，提交時只列該項檔案。修改 artifact／路由的 T3–T5，必須在同一提交同步 living architecture metadata、Decision Log（只有實際確認才登錄核准）、implementation mapping、未決問題與驗證證據，以及兩份 current-state 文件／CLAUDE.md 中受影響描述。

## T1：固定案例與結果記錄器

**Files — Create:**

- `evals/quality/README.md`：重置 fixture、執行真實 host、保存輸出、盲評步驟。
- `evals/quality/cases.json`：Q1–Q6、case_version、需求、fixture 名稱、預期觀察。
- `evals/quality/rubric.md`：設計 §3 的四項評分及六例專屬判斷。
- `evals/quality/fixtures/search/src/normalize-name.mjs`
- `evals/quality/fixtures/search/src/search.mjs`
- `evals/quality/fixtures/search/tests/search.test.mjs`
- `evals/quality/fixtures/integration/src/api.mjs`
- `evals/quality/fixtures/integration/src/client.mjs`
- `evals/quality/fixtures/integration/tests/flow.test.mjs`
- `evals/quality/fixtures/knowledge/request.json`：錯字修改的合成已核准產物來源。
- `evals/quality/fixtures/knowledge/wiki/Rules/style.md`：已有文字規則。
- `evals/quality/record.mjs`、`record.test.mjs`：檢查 run record 必填內容與證據存在，不自動替 Agent 打分。
- `evals/quality/results/README.md`：只存去敏證據、每次獨立 run 路徑、不得覆寫 baseline。

**Interfaces:** `validateRun(record, { evidenceExists }) -> string[]`，回傳所有錯誤，空陣列代表記錄結構有效，並不代表品質通過。CLI `node evals/quality/record.mjs <run.json>` 印出錯誤且退出 1，成功退出 0。只驗證，不啟動 LLM、不讀 credential。

- [ ] 建立 Q1/Q2/Q3/Q5 共用 search fixture，固定可觀察的 prefix bug：

```js
// normalize-name.mjs
export const normalizeName = value => value.trim().toLowerCase();
// search.mjs
import { normalizeName } from './normalize-name.mjs';
export const searchNames = (names, query) =>
  names.filter(name => normalizeName(name).startsWith(normalizeName(query)));
// search.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchNames } from '../src/search.mjs';
test('substring acceptance', () => {
  assert.deepEqual(searchNames(['Alpha Beta'], 'beta'), ['Alpha Beta']);
});
```

- [ ] Q4 的 api 接 `{query}`，client 故意傳 `{q}`；flow.test 斷言 `client.search('beta')` 包含 Alpha Beta。先分別寫會通過的 api／client 單元案例，再以 flow.test 證明跨模組失敗。Q6 提供無新知識的 typo diff，檢查不新增主題筆記；Hub／Index 不算誤寫。
- [ ] 建立每例的 host-visible 需求與 reviewer-only 答案。Q3 的 spec 明定 substring；Q5 的 BA 明定 substring、spec 明定 prefix；避免兩例混成同一個分類。執行 fixture 時只複製指定子目錄到臨時 repo，答案留在外面。
- [ ] 先寫記錄器失敗測試，再實作 validator：檢查 metadata、4 個 0–2 分數、三項缺陷計數、原始 evidence 存在、run_id 唯一、baseline 不覆寫。完整 record 範例如下，實測時必須取代示例值：

```json
{
  "run_id":"Q1-before-1","case_id":"Q1","case_version":"quality-v1",
  "phase":"before","host":"Claude Code","host_version":"recorded-at-run",
  "model":"recorded-at-run","model_settings":{},
  "plugin_commit":"recorded-at-run","prompt_hash":"recorded-at-run",
  "fixture_hash":"recorded-at-run","core_version":null,"adapter_version":null,
  "started_at":"2026-09-09T00:00:00Z","duration_seconds":1,
  "evidence":["transcript.txt"],"evaluator":"human",
  "scores":{"identification":0,"evidence":0,"scope":0,"handoff":0},
  "score_reasons":{"identification":"評分依據","evidence":"評分依據","scope":"評分依據","handoff":"評分依據"},
  "missed_important":0,"invalid_suggestions":0,"human_correction_minutes":0,
  "hard_failures":[],"status":"completed"
}
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun } from './record.mjs';
test('missing evidence cannot become a valid run', () => {
  const errors = validateRun({ run_id: 'Q1-before-1', evidence: ['missing.txt'] },
    { evidenceExists: () => false });
  assert.ok(errors.some(e => e.includes('evidence')));
});
```

- [ ] 執行 `node --test evals/quality/record.test.mjs`；加上有效記錄、缺模型／版本、越界分數、缺評分理由的測試。CLI 另驗證 run.json 相對 evidence 路徑解析、拒絕逃出 run 目錄與重複 run ID。只用字串示例不可當有效實测 evidence。
- [ ] 實際跑兩個故意失敗的 fixture 測試，保存「預期失敗」證據於 `evals/quality/results/harness-check.md`。它們不屬於 repo 綠燈測試，不使用無範圍 `node --test`；日常只跑明列的 recorder／hook 測試。
- [ ] Review 後提交 `test: add quality fixtures and run evidence validation`。

**驗收：** 案例差異可重現，recorder 可拒絕不完整證據；測試本身成功不代表 Agent 已通過。

## T2：保存改善前結果

**Files — Create:** `evals/quality/results/before/` 的 18 個獨立 run 目錄與 `summary.md`；每個目錄含 run.json、transcript、產物與評分說明。

**Consumes:** T1 fixtures／rubric／validator。**Produces:** 不可覆寫的 before 基準，以及可用 host／模型設定清單。

- [ ] 在尚未修改 command／agent 的版本執行六例，各新開 session 三次；使用實際 plugin host，記錄載入的是哪份 plugin，不能只以本 repo 檔案存在推論 host 已載入。
- [ ] Q2 由固定人工作答腳本回答同一組澄清，不把評分答案直接提供給 BA。Q6 的 vault 指向臨時 fixture，不使用個人 Obsidian。
- [ ] 人工或獨立評分者依 rubric 填分數、理由與人工修正時間；執行 `node evals/quality/record.mjs <該次run.json>` 檢查記錄。
- [ ] 在 summary 列每例三次分數、中位數、重要問題漏失與無效建議；保留失敗。若登入／用量／host 權限受阻，記 blocked 與環境需求，停止 T3，不用合成輸出替代改善前結果。
- [ ] Review 後提交 `test: capture pre-change agent quality baseline`。

**驗收：** 18 次真實輸出可追溯；品質差是有效 baseline，缺實測才是阻擋。

## T3：有證據的規劃（N1）

**Modify:** `agents/agent-work-team-plan-sd.md` tools／輸入／工作／JSON／Markdown 區塊；`commands/agent-work-team.md` Step 4 派工及 NEEDS_CONTEXT；`commands/agent-work-team-resume.md` SPEC_DRAFTING 路由；本計畫前述 living／current-state 同步文件。

**Consumes:** 核准 BA、project_root、既有 repo。**Produces:** 設計 §4 的 repository_analysis，保留既有 task_breakdown、test_plan 型別與 NEEDS_CONTEXT outcome。

- [ ] 用 Q1-before 中的具體缺失作回歸案例；如果 baseline 已正確重用，也保留它作非退步案例，不偽造失敗。
- [ ] 在 Planner 加入下列實際指示，並將設計 §4 的 JSON 結構完整加到輸出範例：

```text
先以 Glob/Grep 找需求相關入口、可重用實作與測試，再 Read 查證。
repository_analysis.evidence 只列讀過的檔案與可定位 symbol；新增檔案列 file_impact。
把待驗證假設與已確認事實分開。改變 AC 語意的 unresolved_questions 回 NEEDS_CONTEXT。
只寫 output_dir 中的 plan-spec.json/.md，不修改產品檔案。
```

- [ ] 新建與 resume 都傳 project_root；NEEDS_CONTEXT 只提供已知且可追溯的答案，未知問題交人類，不自行補成規格。JSON／Markdown 顯示相同調查內容。
- [ ] 跑 Q1 三次、空 repo 一次、相關檔案無法讀取一次；檢查證據來源、不杜撰路徑、阻擋行為。若 BA dispatch 改動影響 Q2，也跑三次。
- [ ] 重跑 recorder／17 項 hook 測試；同步責任與證據記錄後提交 `feat: ground planning in repository evidence`。

**驗收：** 搜尋範圍與引用可追查；原有 resume／Spec 核准仍可使用；不能靠 Prompt 關鍵字存在宣稱行為已通過。

## T4：測試交接與整體驗證（N3）

**Modify:** `agents/agent-work-team-plan-sd.md` test_plan／新增 verification_plan；`agents/agent-work-team-developer.md` 輸入、測試、report JSON／Markdown、修正回合；`commands/agent-work-team-develop.md` Step 3／5／6／7；`agents/agent-work-team-reviewer.md` 證據輸入；living／current-state 同步文件。

**Create:** `evals/quality/scenarios/verification-handoff.md`，記錄以下 host 操作及預期 artifact。產品執行時建立的是使用者 request 的 `dev/verification-report.json/.md` 與 `dev/evidence/`，不是 plugin repo 內的 request 資料。

**Consumes:** test_plan 字串、verification_plan entries。**Produces:** 設計 §5 的 verification_results、整合證據與完成門檻。

- [ ] 先用 Q4 證明單測通過不足以通過最終驗收。記錄 task report、整體命令與 exit code 差異。
- [ ] 依設計 §5 加入 JSON 範例；Controller 檢查 verification ID 唯一、task_ids 有效、owner/level 對應、必填 command/manual_steps，缺欄位時停止而非猜補。
- [ ] 新建、task 修正、NEEDS_CONTEXT 重派、final fix 全部傳同樣的測試輸入；將以下規則寫入 Developer／Controller：

```text
Developer 執行 owner=developer 的相關測試並保留每次結果；未執行不可報 passed。
全部 task done 後，Controller 先處理必要人工驗證並跑 owner=controller 的整合測試。
保存 command、cwd、exit_code、原始輸出、attempt、tested_revision 與工作樹差異。
必要驗證未成功不得進 PENDING_FINAL_APPROVAL；Reviewer 讀整合證據再給 verdict。
修改產品碼後，舊整合結果不能直接沿用，須重跑受影響案例。
```

- [ ] 實作 legacy spec 的映射確認及既有 PENDING_FINAL_APPROVAL 例外；不可把缺 verification_plan 視為空測試全通過，亦不可靜默改已核准 spec。
- [ ] 跑 Q4 三次。另做五個 host scenarios：required failed、required not_run、環境 blocked、人工待確認、修正後重跑；各記 stage/status 與 report 證據。確認未通過時無 DEV_APPROVED／squash。
- [ ] 用 legacy fixture 驗證不覆寫 plan-spec；新版 happy path 分別使用 per_task、squash，確認人工核准前不整理 commit。
- [ ] 跑 recorder／hook 測試，更新文件後提交 `feat: carry verification plans through development`。

**驗收：** Q4 的跨 task 錯誤被真實驗證捕捉，失敗能進既有修正流程，環境／人工阻擋可續接，Reviewer 不執行產品修改。

## T5：需求導向審查與 clarification 續接（N4）

**Modify:** `commands/agent-work-team.md` Step 1 原文保存；`commands/agent-work-team-resume.md` CREATED 原文續接與 Dev 阻擋摘要；`commands/agent-work-team-develop.md` Step 1 resume guard、task／final reviewer dispatch、verdict 分支；`agents/agent-work-team-reviewer.md` 輸入／findings／verdict；`commands/agent-work-team-help.md` 需要釐清的說明；living／current-state 同步文件。

**Create:** `evals/quality/scenarios/requirement-review.md`，包含下列操作／預期 state。產品執行時新增 original-request.json、dev/clarification.json，契約依 spec §4／§6。

**Consumes:** 原始需求可用性、BA、spec、測試證據。**Produces:** findings、requirement_satisfied、Needs clarification 及跨 session 保留的阻擋。

- [ ] 先各跑一次 Q3／Q5，確認兩例的 bug 相同但修復責任不同。記下既有 Controller 是否會把 Q5 派回 Developer 反覆修碼。
- [ ] 新 request 在 PM 前寫 original-request；在 CREATED 中斷後以同 token 原文續接。舊 request 缺原文只標 false，不以摘要補造。
- [ ] 將設計 §6 的完整 findings JSON 與優先路由加進 Reviewer／develop；task、final、修正後再審三條路徑都提供 BA／spec／evidence。
- [ ] 寫入以下停止與 resume 順序，對照原有重設 counter 區塊，避免 guard 放在清除之後：

```text
Needs clarification → 先保存 dev/clarification.json(status=open, token, scope, review_path)。
再設 state.status=Blocked、waiting_on=Human；單 task 標 blocked；不增加 fix counter。
resume 在任何 branch 切換／counter reset 前讀 clarification；open 時只重播問題。
使用者確認 keep_scope 才寫 resolved 與原文，然後重審；不直接標完成。
若需改 BA/spec/task，保持原 request Blocked，另開需求；不在此輪自動修改規格。
```

- [ ] Q3／Q5 各跑三次。再驗證：混合 implementation＋spec_gap、out_of_scope 建議、缺 BA、原文 token mismatch、clarification 寫完但 state 未寫即中斷、重跑不解除、keep_scope 重審、另開需求仍保留原需求。
- [ ] 每個 scenario 檢查 request 檔案、fix counters、Git diff，Reviewer 除自身報告無產品變更；final scope 的 clarification 不會跳進 Step 7。
- [ ] 跑 recorder／hook 測試、同步文件後提交 `feat: route requirement gaps to human clarification`。

**驗收：** implementation 仍正常派修；spec gap 不消耗 fix rounds、不因新 session 遺失；保留既有 issues consumer 格式。

## T6：改善後基準與接手包

**Create:** `evals/quality/results/after/` 的 18 次實測與 `summary.md`；`evals/quality/baselines/quality-v1.json`（人工接受後才建立）；`docs/reports/2026-09-09-quality-foundation-handoff.md`。

**Consumes:** T2–T5 結果。**Produces:** 改善前後比較、已確認改善後基準與下一輪入口。

- [ ] 凍結 T5 的實作版本，用同一 host／模型／fixture 六例各跑三次；若模型版本已不同，在報告標明無法單獨歸因 Prompt，不能偷偷當同條件比較。
- [ ] 按 spec §3 門檻逐例比較；缺失或退步先修正並回跑受影響案例，不覆寫舊 run。沒有基準確認時保持 candidate，不寫已驗收。
- [ ] 有疑義才各補三次。外部條件阻擋則交付 partial 與明確未完成項，不偽造基準，不進 2B runtime。
- [ ] 以這兩條分開的命令驗證自動檢查：

```powershell
node --test evals/quality/record.test.mjs hooks/sync-dashboard.test.mjs hooks/enforce-block.test.mjs
git diff --check
```

- [ ] 交接報告寫實作 commit、變更檔案、契約摘要、回歸證據、品質比較、未解問題、重現命令、下一步 2A；附每項人工核准來源。
- [ ] 人工接受改善後品質基準後，manifest 只引用既有 immutable run 路徑／hash／門檻版本，不复制一份可漂移的分數。
- [ ] Review 後提交 `docs: record quality baseline and development handoff`；依專案整合規範 review／測試後才合併，不自動 merge。

**驗收：** 任務完成和品質接受分開記錄；後續模型不用重讀全部聊天即可重跑同一案例與進入 2A。

## 實作完成回報格式

```text
Task: T3
Status: completed | partial | blocked
Commit: 實際 SHA 或未提交
Changed: 實際檔案
Validation: 命令、結果與證據路徑
Quality: case/run ID、比較及限制
Remaining: 尚未完成項或無
Next: 下一個任務與必要前置條件
```

不要把 checkbox 勾滿當驗收。若某任務必須變更本 spec 的欄位型別、stage、授權或相容性例外，先整理具體差異交維護者確認，不能自行重新設計整套流程。
