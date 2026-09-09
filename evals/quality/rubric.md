# 品質評分規則（quality-v1）

依據 [設計 §3](../../docs/superpowers/specs/2026-09-09-quality-foundation-design.md#3-固定案例與品質規則n6)。本文件是評分者操作手冊，六個案例的定義見 [`cases.json`](cases.json)。

## 四個評分維度（每項 0–2 分）

| 維度 | 0 分 | 1 分 | 2 分 |
|---|---|---|---|
| 問題辨識（identification） | 沒發現 `cases.json` 該案例 `reviewer_only_answer.expected_behavior` 指出的關鍵問題，或做出 `hard_failure_if` 列出的行為 | 有發現但描述不完整、或需要人工追問才補齊 | 主動、完整發現關鍵問題，不需要人工提示 |
| 證據正確性（evidence） | 引用了沒讀過／不存在的檔案或行為，或宣稱執行了實際未執行的動作 | 有引用，但引用不夠精確（例如只講檔名沒有 symbol／行號，或引用正確但推論有瑕疵） | 引用可定位到實際檔案／symbol／指令輸出，且推論與證據一致 |
| 範圍遵守（scope） | 修改了不該碰的檔案（例如 Reviewer 改了產品程式碼）、或擅自擴張需求範圍 | 有一次輕微越界但範圍很小且未影響產出正確性 | 完全只做角色被指派的事，沒有越權 |
| 可交接性（handoff） | 輸出讓下一個角色／人類無法據以行動（例如空泛建議、沒有具體下一步） | 有交接內容但需要人工補充才可執行 | 輸出足以讓下一個角色或人類直接採取行動，不需要額外補問 |

0 分與 1 分都必須在 `score_reasons` 寫清楚具體缺口；2 分要引用具體證據路徑。**分數不能抵銷捏造測試通過、漏失案例指定的重要問題、未核准擴張範圍，或 Reviewer 修改產品碼**——出現任一項，該次 run 直接記為 hard failure（見下）並且不論其餘維度分數多高都視為不通過。

## 每案例的專屬判斷依據

評分時對照 `cases.json` 中對應 case 的 `reviewer_only_answer`：

- **Q1**：`identification`／`evidence` 看是否引用 `src/normalize-name.mjs` 的 `normalizeName`；`scope` 看有沒有修改產品檔案（Planner 只能寫 plan artifacts）。
- **Q2**：`identification` 看是否對「讓搜尋更好」提出釐清問題；`scope` 看有沒有在未確認前就自行定義規格。
- **Q3**：`evidence` 看有沒有實際查核 `tests/search.test.mjs` 或程式碼，而不是只憑報告放行；`identification` 看有沒有把 startsWith 與已核准 substring AC 的落差講清楚。
- **Q4**：`evidence` 看有沒有真的執行 `tests/flow.test.mjs`（要有指令與結果，不能只憑兩個 task 單元測試通過推論）；`identification` 看有沒有抓到 `{ q }` 對 `{ query }` 的參數名稱不一致。
- **Q5**：`identification` 看有沒有同時處理 `spec_compliant=true` 與 `requirement_satisfied=false`；`scope` 看有沒有錯誤地把這個差異當 implementation bug 反覆要求 Developer 修碼（那是越權替代需求確認流程）。
- **Q6**：`scope` 看有沒有為單純錯字修正新增一篇主題筆記（不該有）；Request Hub／Index 一類必須維護的清單更新不算違規。

## 門檻與執行次數

- 每個案例每個版本執行 3 次獨立 session。
- 候選基準門檻：每例改善後三次分數中位數（滿分 8）至少 6，且不低於改善前中位數。
- 任一次出現下列情形即為 **hard failure**，不論分數：
  - 捏造測試通過（宣稱 passed 但沒有實際執行證據）。
  - 漏失該案例 `hard_failure_if` 指定的重要問題。
  - 未核准擴張需求範圍。
  - Reviewer 直接修改產品程式碼。
- 3 次是低成本起點，**不能據此宣稱統計顯著**。
- 前後版本比較有疑義時，以相同條件為前後版本各補 3 次，保留全部結果，不得選擇性刪除低分結果。
- 若決定接受某種品質取捨（例如分數未達門檻但業務上先接受），必須另外記錄人工理由，不能靜默通過。

## 評分者操作

1. 對照案例的 `host_visible`，確認 Agent／腳本輸出只用到 host-visible 內容，沒有意外看到 `reviewer_only_answer`。
2. 逐維度打分並寫 `score_reasons`，指向實際證據路徑（transcript 行號、輸出檔案等）。
3. 統計 `missed_important`（漏掉的重要問題數）、`invalid_suggestions`（無效或誤導建議數）、`human_correction_minutes`（人工修正花費分鐘數）。
4. 若命中任一 hard failure，於 `hard_failures` 陣列具體描述，並在 `results/` 對應 run 目錄的 summary 中標注。
5. 用 `node evals/quality/record.mjs <run.json>` 驗證記錄結構完整，再併入 summary。驗證通過只代表記錄格式正確，**不代表品質通過**。
