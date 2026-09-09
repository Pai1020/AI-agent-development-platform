# Results

真實案例執行的證據存放處。每個 run 是一個獨立、append-only 的目錄。

## 規則

- 每次執行建立獨立的 `results/<phase>/<run_id>/` 目錄（`phase` 為 `before` 或 `after`），內含 `run.json`、transcript／輸出、評分依據。已寫入的 run 目錄不得覆寫或事後編輯分數——發現記錄錯誤時，新增一個 run 或在 summary 中加註更正說明，保留原始檔案。
- Transcript／輸出保存前先去敏：移除 API key、token、密碼、個人資料等憑證與隱私內容；去敏後仍要保留足以重現評分依據的實質內容。
- `evals/quality/baselines/quality-v1.json`（T6 產生，人工接受後才建立）是不可覆寫的基準 manifest；一旦建立，之後的版本只能新增新的 baseline 檔案（例如 `quality-v2.json`），不能覆寫既有檔案。`record.mjs` 匯出的 `guardBaselineOverwrite` 用於在寫入前擋下覆寫既有 baseline 的操作。
- `before/`、`after/` 各自的 `summary.md` 彙整當批三次分數、中位數、hard failure，但不取代個別 run 目錄裡的原始證據。
- 未執行的案例不得記錄為 `completed`；環境或權限受阻時，run 的 `status` 記 `blocked` 並具體寫明所需環境，不得留白或用合成輸出代替。
