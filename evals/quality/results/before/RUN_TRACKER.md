# T2 Run Tracker — 改善前 18 次

依 `RUNBOOK.md` 執行。狀態：`pending`（未開始）／`in_progress`（session 已開但未交件）／`handed_off`（transcript／artifact 已交給我，等我評分）／`scored`（run.json 已建立並通過 `record.mjs`）／`blocked`（環境受阻，見備註）。

| run_id | 案例 | 狀態 | 日期 | 備註 |
|---|---|---|---|---|
| Q1-before-1 | Q1 | pending | | |
| Q1-before-2 | Q1 | pending | | |
| Q1-before-3 | Q1 | pending | | |
| Q2-before-1 | Q2 | pending | | |
| Q2-before-2 | Q2 | pending | | |
| Q2-before-3 | Q2 | pending | | |
| Q3-before-1 | Q3 | pending | | |
| Q3-before-2 | Q3 | pending | | |
| Q3-before-3 | Q3 | pending | | |
| Q4-before-1 | Q4 | pending | | |
| Q4-before-2 | Q4 | pending | | |
| Q4-before-3 | Q4 | pending | | |
| Q5-before-1 | Q5 | pending | | |
| Q5-before-2 | Q5 | pending | | |
| Q5-before-3 | Q5 | pending | | |
| Q6-before-1 | Q6 | pending | | |
| Q6-before-2 | Q6 | pending | | |
| Q6-before-3 | Q6 | pending | | |

更新這個表格時只改狀態／日期／備註三欄，不要重排列順序（`run_id` 要跟未來 `results/before/<run_id>/` 目錄名稱一致）。全部 18 列到 `scored` 才能寫 `summary.md` 並視為 T2 完成；任何 `blocked` 列都要在備註寫清楚環境需求，並停止進入 T3（見 `docs/superpowers/plans/2026-09-09-quality-foundation.md` T2 驗收條件）。
