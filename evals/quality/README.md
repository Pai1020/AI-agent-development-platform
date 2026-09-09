# Quality Evals（quality-v1）

第一輪品質基礎的固定案例與結果記錄器。設計依據見
[`docs/superpowers/specs/2026-09-09-quality-foundation-design.md`](../../docs/superpowers/specs/2026-09-09-quality-foundation-design.md)，
實作計畫見
[`docs/superpowers/plans/2026-09-09-quality-foundation.md`](../../docs/superpowers/plans/2026-09-09-quality-foundation.md)。

## 目錄結構

```text
evals/quality/
├── cases.json          # Q1-Q6 定義：host_visible（給 Agent）與 reviewer_only_answer（只給評分者）
├── rubric.md            # 四維度評分規則與門檻
├── record.mjs            # 唯讀驗證器：驗證單次 run.json 的結構完整性；不啟動 LLM、不讀 credential
├── record.test.mjs
├── fixtures/
│   ├── search/           # Q1/Q2/Q3/Q5 共用；search.mjs 用 startsWith，已知與 substring AC 不符
│   ├── integration/       # Q4；client.mjs 用 { q } 呼叫 api 的 { query }，故意的整合 bug
│   └── knowledge/         # Q6；純錯字修正的已核准需求 + 既有 wiki 規則
└── results/
    ├── README.md
    ├── before/            # T2 產生：改善前 18 次
    ├── after/             # T6 產生：改善後 18 次
    └── harness-check.md   # 兩個「預期失敗」fixture 測試的真實執行證據
```

## 重要限制

- `fixtures/search/tests/search.test.mjs` 與 `fixtures/integration/tests/flow.test.mjs` **故意會失敗**——它們示範 Q3/Q5 與 Q4 要抓的 bug。不要把它們當成 repo 的綠燈測試，也不要用無範圍的 `node --test` 整批跑（會把這兩個失敗混進正常測試結果）。日常只跑明列的 recorder／hook 測試：

  ```powershell
  node --test evals/quality/record.test.mjs hooks/sync-dashboard.test.mjs hooks/enforce-block.test.mjs
  ```

- `cases.json` 的 `reviewer_only_answer` 只給評分者看，不得出現在拿去實跑 case 的臨時 repo 或 Agent 可讀的上下文裡。

## 重置 fixture 並執行一次真實 case

1. 找到 `cases.json` 中對應的 case，讀取 `fixture` 與 `fixture_copy_paths`。
2. 建立一個乾淨的臨時目錄／臨時 git repo（不要在這個 plugin repo 或使用者專案裡直接跑），只複製 `fixture_copy_paths` 列出的子路徑，例如：

   ```powershell
   $tmp = New-Item -ItemType Directory -Force "$env:TEMP\quality-eval-Q1"
   Copy-Item evals\quality\fixtures\search\src  "$tmp\src" -Recurse -Force
   Copy-Item evals\quality\fixtures\search\tests "$tmp\tests" -Recurse -Force
   ```

3. 用該 case 的 `host_visible.requirement`（與 `additional_context`，如果有）作為交給實際 host（Claude Code 等）的需求描述，在乾淨 session 中執行對應角色的工作。
4. 保存這次 session 的原始 transcript／輸出到 `results/<phase>/<run_id>/`，不做摘要式改寫。
5. 執行完後，記錄實際載入的 plugin commit（`git rev-parse HEAD`）、host 版本、model 識別；無法取得的欄位記 `unknown`，不得用推測值填入 `record.mjs` 要求的欄位。

## 盲評（避免評分污染）

- 執行 case 的人／腳本只能看到 `host_visible`；`reviewer_only_answer` 只在評分階段才拿出來對照。
- 評分依 [`rubric.md`](rubric.md) 逐維度打分，寫明 `score_reasons`，統計 `missed_important`／`invalid_suggestions`／`human_correction_minutes`。
- 若懷疑評分者已經看過答案再執行 case，該次 run 需要標記並在 summary 中說明，不得混入正式比較。

## 保存輸出並驗證記錄

1. 依 [record.mjs 範例結構](../../docs/superpowers/plans/2026-09-09-quality-foundation.md) 填好 `run.json`，`evidence` 指向同一 run 目錄下的實際檔案（相對路徑）。
2. 執行驗證：

   ```powershell
   node evals/quality/record.mjs evals\quality\results\before\Q1-before-1\run.json
   ```

   結構有誤會列出所有錯誤並以 exit code 1 結束；結構正確才 exit 0——但這只代表記錄格式合法，**不代表品質通過**，通過與否仍以 `rubric.md` 的分數與 hard failure 判斷為準。
3. 把 run 目錄與更新後的 `results/<phase>/summary.md` 一併提交；不得覆寫既有 run 目錄或已確認的 baseline（見 [`results/README.md`](results/README.md)）。
