# AI Agent Development Platform 開發優先級與分階段計畫

- 整理日期：2026-09-09
- 現況基準：`docs/plugin-current-state`，commit `7ccbaf7`
- 文件性質：整合既有 docs 與本次討論的開發排序建議
- 核准邊界：本文件的建立不等於核准所有功能實作；既有 Approved 決策維持原範圍，新建議及 Open 項目仍需個別確認。
- 估算方式：成本僅為相對規模，尚未拆成工時。
- 驗證範圍：依程式、command、agent、hook 與設計文件靜態閱讀整理，未執行端到端流程或品質評測。

## 1. 目標與排序原則

先改善每次工作的產出品質，同時建立品質基準；接著用小範圍流程逐步導入 core，再擴充需求管理與外部整合。

排序依據：

1. 對交付正確性與使用者工作保護的影響。
2. 是否為其他能力的必要前置條件。
3. 是否能以較小改動帶來可驗證的改善。
4. 是否會因後續 core 改造而產生重工。
5. 是否已有明確使用情境與核准範圍。

優先級與執行順序不同：P0 表示重要性高，仍須遵循依賴與核准邊界。例如 Git 保護必須在新版 Development 開放使用前完成；Copilot 最小 adapter 必須在第一個 Claude Planning 切片穩定後立即驗證。

## 2. 現況與排除項目

目前 runtime 仍由 Claude Code 主對話依 Markdown Prompt 編排 Planning、Development、Knowledge。Node.js hooks 負責 Dashboard 同步與 Development 重試上限保護。

既有需求續接、token 檢查、Markdown Dashboard、Knowledge 整理、Development commit mode 已有實作，不列為全新待辦；本計畫涉及它們時，指的是遷移、補強或驗證。

`docs/manual-testing-checklist.md` 已被專案規範標示過時，不作為現況、成熟度或驗證證據。

## 3. 整合優先級

| 優先級 | 項目 | 來源／決策狀態 | 排序理由 | 相對成本 |
|---|---|---|---|---|
| P0 | 規劃前調查既有程式碼，記錄證據與假設 | 新建議，待決策 | 降低規劃偏差，避免重造既有服務或誤判檔案範圍 | 小～中 |
| P0 | 將測試計畫交接到 task，並執行整體驗證 | 新建議，待決策 | 明確測試執行責任，補上 task 通過但整體流程未驗證的缺口 | 小～中 |
| P0 | Reviewer 檢查原始需求是否真正被解決 | 新建議，待決策 | 避免符合 spec 卻未解決使用者問題 | 小～中 |
| P0 起步，持續擴充 | Agent 內容品質評測 | 新建議，待決策 | 為 Prompt、模型與架構改動提供比較基準 | 中 |
| P0 | Core 最小契約與 Claude Planning 流程切片 | docs 已核准方向 | 建立狀態、產物、續接與人工核准的可靠基礎 | 大；第 2 輪須先完成獨立 spec／成本拆解 |
| P0，第 2 輪 Claude 切片穩定後 | Copilot 最薄 adapter 與同一 Planning 切片驗證 | docs 已核准方向 | 提早找出 host 假設；僅驗證相同切片，不包含完整 Copilot 產品功能 | 待獨立估算；需計入 adapter 起步、host 能力確認與品質回測成本 |
| P0，進入新版 Development 前完成 | Git preflight、隔離 worktree、core 控制 Git 操作 | docs 已核准方向，細節待設計 | 保護使用者變更，限制 staging、commit 與分支副作用 | 大 |
| P1 | Development／Knowledge core 化 | docs 已核准方向 | 將可靠性延伸到完整生命週期 | 大 |
| P1 | 依需求類型調整工作方法 | 新建議，待決策 | 讓 Bug、Research、Performance 等分類真正影響工作成果 | 中 |
| P1 | 開發途中正式調整需求 | 新建議，待決策 | 辨識保留、修改、停止及新增範圍，避免混入修正回合 | 中～大 |
| P1 | 安裝／更新／移除 CLI 與版本相容檢查 | docs 已核准方向 | core 與 adapter 結構穩定後可靠配布 | 中 |
| P1 | 舊需求明確遷移、診斷與有限修復 | 遷移原則已核准；修復細節待決策 | 讓既有需求可安全承接新版 | 中～大 |
| P2 | 資料根目錄客製化 | docs 已有設計 | 改善資料管理，可與 core 路徑解析一併處理 | 小～中 |
| P2 | GitHub Issue／PR、CI 結果、merge-readiness | docs 待決策／保留邊界下改善 | 縮短交付最後一段路，依賴穩定事件與成果介面 | 中～大 |
| P2 | 成本、token、耗時統計與通知 | docs 待決策 | 找出昂貴步驟、等待點與需要介入的事件 | 中 |
| P2 | Knowledge 唯讀檢查器 | docs 待決策 | 降低知識誤寫；先確認誤寫類型與外部 vault 政策 | 中 |
| P3 | Task dependency graph 與平行執行 | docs 待決策 | 需先有隔離、衝突與整合規則 | 大 |
| P3 | Web Dashboard、Jira 等工作系統整合 | docs 待決策 | 依真實操作需求投入，避免提前增加維護負擔 | 中～大 |
| P3 | 多人角色權限、跨 repository／monorepo 協調 | docs 待決策 | 複雜度高，需明確團隊情境 | 大 |
| 暫不排入 | 自動 merge、移除人工核准、Reviewer 直接修碼 | docs 預設保留現有邊界 | 目前沒有足夠理由改變既有產品原則 | — |

## 4. 新增改善項目（N1–N6）

N 編號識別改善項目；第 5 節的輪次識別交付順序，兩者沒有一一對應關係。N1／N3／N4／N6 於第 1 輪起步，N2／N5 主要於第 5 輪交付；N6 同時貫穿後續各輪。

### N1：有證據的程式庫調查

Plan/SA/SD 目前以 BA 需求為明列輸入，沒有明確要求先搜尋既有實作，工具定義只有 Read、Write。

改善目標：

- 找到相關入口、既有實作、可重用元件與測試。
- 引用實際檔案，區分已確認事實與待驗證假設。
- 不確定的技術問題先調查或回報，不直接補成完整設計。
- 調查限制在需求相關範圍，避免每個需求重讀整個 repository。

### N2：需求類型對應工作方法

保留必要人工關卡，依類型調整產物與完成條件：

| 類型 | 核心工作 |
|---|---|
| Bug Fix | 重現、原因定位、回歸案例 |
| Performance | 改善前基準、可量測目標、改善後比較 |
| Research | 問題、方案比較、證據、結論；允許沒有產品程式碼 |
| Documentation | 讀者、操作情境、範例正確性 |
| Refactor | 必須維持不變的外部行為與驗證 |
| New Feature | 使用情境、端到端行為與驗收條件 |

先改善內容要求；涉及新完成路徑或 stage 行為時，再納入 core 契約設計。

### N3：測試計畫執行交接

Plan/SA/SD 已產生 test_plan，但 Developer 的明列輸入沒有明確包含整體測試計畫。

改善目標：

- 分清 task 測試、整合測試與人工驗證責任。
- 派工時提供相關測試要求與執行方式。
- 最終交付區分已執行、失敗、未執行及受阻的驗證。
- 驗證跨 task 使用流程，不只檢查各 task 報告。

此項是產品行為測試的工作交接，不等同 docs 的 JSON schema 或 transition validator。

### N4：Reviewer 可指出規格缺口

除了 spec 合規與程式碼品質，Reviewer 應檢查：

> 即使完全符合 spec，使用者的原始問題還可能在哪些情況下沒有被解決？

改善目標：

- 提供原始需求、已確認限制與 spec 的完整脈絡。
- 區分實作錯誤、規格缺口及超出本次範圍的建議。
- 規格缺口交回適當的需求確認流程，不能無限要求 Developer 修碼。
- Reviewer 不直接修改產品程式碼，也不自行擴張需求。

### N5：開發中需求變更

為開發途中改需求提供明確處理方式：

- 列出可保留的已完成成果。
- 列出需要修改或停止的工作。
- 判斷新增範圍是否另開需求。
- 確認受影響的驗收條件與審查結果。
- 使用者確認影響後再繼續。

依賴穩定的 task／spec 識別、進度與版本脈絡；細節應另立設計，不直接混入原 task 的 fix round。

### N6：Agent 內容品質評測

初期使用少量固定小專案：

- 已存在可重用服務，檢查 Planner 是否仍重造。
- 埋入已知錯誤，檢查 Reviewer 能否定位。
- 模糊需求，檢查 BA 是否問到關鍵問題。
- 無值得沉澱的新知識，檢查 Knowledge 是否仍硬寫筆記。

記錄重要問題漏失、無效建議及人工修正負擔。模型輸出具有變異，不能以單次成功宣稱全面改善。

此項與 core contract tests／跨 host golden scenarios 互補：前者評估內容判斷，後者驗證流程與契約。

持續回測規則：

- 保存第 1 輪改善前結果，以及改善後、經確認可作為比較依據的品質基準；後續 core 化以改善後基準比較，不能只與較差的改善前結果比較。
- 第 2 輪的 Claude／Copilot Planning 切片重跑適用的 BA／Planner 固定案例；第 3 輪依功能上線重跑 Developer、Reviewer、Knowledge 案例，並在整輪交付前回跑已支援的完整案例集。
- 後續改動 Prompt、模型、上下文傳遞、工具權限或可能影響 Agent 行為的流程時，重跑受影響案例；未受影響的能力不必機械式全部重跑。
- 第 1 輪先定義案例版本、評分規則、重跑次數與可接受差異，再比較結果；記錄模型／設定、Prompt／core／adapter 版本及執行條件，不以單次輸出或文字完全一致判定品質。
- 跨 host 分別報告品質；模型或條件不同時標記比較限制，不把差異直接歸因於 core。
- 發現退步時先區分隨機變異、環境差異與可重現問題。修正後回測；若接受取捨，須明確記錄人工決策與理由，不能靜默覆寫基準。缺少回測或退步尚未處置時，不宣稱品質驗收通過。

## 5. 分階段交付順序

### 第 1 輪：建立品質基準並補強現有流程

範圍：N6 最小評測、N1 程式庫調查、N3 測試交接、N4 需求導向審查。

順序：先保留改善前案例結果，再逐項調整並比較。

完成標準：

- 有可重複使用的案例、評判標準及實際結果。
- 保存改善後品質基準，預先定義重跑次數、可接受差異與退步處理方式，作為第 2 輪起的回測依據。
- 規劃能引用相關程式碼證據。
- 測試計畫有執行責任與可辨識的結果。
- Reviewer 能區分實作錯誤與規格缺口。
- 不將尚未執行的測試或評測記為通過。

將改善保存為可沿用的 Agent 契約與案例，避免深入改寫即將由 core 接手的流程控制。

### 第 2 輪：打通最小跨 host 流程

範圍：Core contract → Claude Planning 切片 → Copilot 同一切片。

包含必要的 outcome、schema、transition、validation、retry、持久化、audit event、action identity、approval challenge 與相容性邊界。先定義切片所需部分，逐步擴充。

本輪同時包含新 core 與從零建立 Copilot adapter 的工作，不能只以 core 一列估算整輪成本。進入 runtime 實作前，須先完成獨立 spec／成本拆解，涵蓋切片邊界、host 能力與工具限制、adapter 起步、測試環境、跨 host 契約驗證、品質回測及主要未知風險。估算需區分開發工作與外部環境前置條件，不預設本輪與其他輪規模相同。

依序交付以下里程碑：

| 里程碑 | 範圍 | 完成／進入下一步條件 |
|---|---|---|
| 2A：契約與可行性確認 | 獨立 spec、最小 core 契約、host 能力確認、工作及成本拆解 | 定義切片內外範圍、驗收案例、未知風險及所需決策；必要探查限於驗證可行性 |
| 2B：Core＋Claude Planning | 實作同時涵蓋 state、artifact、resume、human approval 的最小切片 | core 與 Claude 行為測試通過，適用 N6 案例完成回測，退步已處置 |
| 2C：Copilot 同一切片 | 建立最薄 VS Code Chat adapter，使用 2B 相同情境驗證 | 契約對等與適用 N6 品質回測完成，adapter 無獨立流程規則副本 |

2C 在 2B 穩定後立即進行，不延後到 Claude 全部功能完成；本輪不要求交付完整 Copilot 功能或正式安裝管理 CLI。

完成標準：

- core contract tests 通過。
- Claude 切片可執行、等待人工核准並跨 session 續接。
- Copilot 使用同一情境產生等價 state、event 與 artifact。
- Claude／Copilot 各自重跑第 1 輪適用的 Planning 品質案例，依 N6 規則比較改善後基準、記錄差異並處置退步；contract parity 不取代內容品質驗收。
- adapter 沒有自行維護另一套 transition／retry／validation。
- legacy workflow 並存，同一 request 不被新舊 writer 同時修改。

### 第 3 輪：讓完整開發流程可靠運作

範圍：Git preflight、隔離 worktree、core 控制 Git，逐步擴充 Development 與 Knowledge；既有 commit granularity（squash／per_task）須隨 Git 副作用一併遷移至 core。

完成標準：

- 新版 Development 開始前，Git 保護已具體設計並驗證。
- 新增能力逐項完成 Core → Claude → Copilot 對等驗證。
- 重試、中斷、部分完成與核准情境有可執行證據。
- N3／N4 的測試與審查證據納入新版流程。
- 隨 Developer、Reviewer、Knowledge 能力遷移，重跑各自適用的第 1 輪固定案例；整輪交付前回跑已支援的完整案例集，依 N6 規則與改善後基準比較並處置退步。
- core 讀取並保留既有 commit_mode 選擇，驗證 squash 與 per_task 兩種模式；設定缺失時仍需明確補選，不靜默改變使用者選擇。
- per_task 保留每個 task／修正回合的 commit；squash 僅於最終人工核准後由 core 執行，成功後才進入 DEV_APPROVED，不提前整理歷史。
- 逐 task review 與續接不因 commit 整理失效；squash 後仍可追溯各 task、審查所用歷史與最終交付 commit。
- 以中斷／重跑案例驗證核准及 squash 的部分完成狀態，避免重複 squash／commit 或在 Git 操作未成功時宣告完成；具體恢復政策於本輪 spec 中定義。
- 外部 wiki／vault 操作依明確政策處理，不推測授權範圍。

### 第 4 輪：可配布、可承接舊資料

範圍：管理 CLI、版本相容檢查、受支援狀態的遷移、診斷及有限修復。

完成標準：

- 安裝、更新與移除可重現。
- core／adapter／protocol 不相容時提供明確處理路徑。
- 安裝不自動遷移既有需求。
- 遷移具 dry-run、人工確認、snapshot 與驗證。
- 不支援的狀態停止並提供人工路徑，不猜測、不半轉換。

相容性偵測從第 2 輪開始；此輪才擴充正式配布與遷移工具。

### 第 5 輪：適應實際工作

範圍：N2 需求類型差異化、N5 需求變更管理、資料根目錄設定。

完成標準：

- Research 等需求有合理的成果與完成條件。
- Bug Fix、Performance 等有對應驗證方式。
- 執行途中修改需求能呈現影響並正確續接。
- 自訂 data_root 的 command、hook 與 core 使用一致解析結果。

資料根目錄設計目前使用 .claude 下的設定；導入 host-neutral core 時需重新確認設定責任與相容策略，不能直接假設既有方案完整適用。

### 第 6 輪：縮短交付與協作成本

範圍：PR／CI、通知、統計；再依瓶頸評估 Knowledge 檢查器、Dashboard、平行化及團隊功能。

完成標準：

- 外部整合使用共用 provider，不在兩個 adapter 重複實作。
- 通知聚焦完成、失敗或需要介入的事件。
- 統計支援具體優化判斷。
- 高複雜度功能有實際需求與個別核准，再進入實作。

## 6. 合併開發與依賴

- Core、schema、validator、狀態轉移、retry、事件稽核、hash 與冪等性：按流程切片一起交付必要部分。
- N3 與 N4：共用原始需求、spec、測試結果脈絡，保留不同問題分類。
- N2 與 N5：先定義不同需求的完成條件，再處理途中變更。
- GitHub、CI、通知及統計：依賴穩定事件／API，使用共用整合層。
- 平行執行：依賴 task dependency、隔離工作區、衝突判斷與整合策略。
- 自訂 data_root：與 core 路徑責任共同設計，避免先在多個 Prompt 重複實作後再重寫。

## 7. 開發與核准規則

1. 本文件是排序建議，不將 Open／Proposed 自動變為 Approved。
2. 實作前依對應範圍另立具體 spec／plan，尤其 Git preflight、跨檔案一致性、repair、worktree lifecycle、外部 vault 政策，以及第 2 輪的 Core 契約與 Copilot adapter 起步。
3. 遵守專案規範，在獨立分支修改，review／測試通過後才整合。
4. 保留人工核准、可閱讀產物與舊需求資料。
5. 涉及 stage、status、dispatch、resume、retry、approval、artifact 或 Git 副作用時，同步維護 living architecture document。
6. docs/manual-testing-checklist.md 不得作為驗證依據。
7. 本計畫中的成本與排序應在實作拆解、評測或使用者需求改變後重新評估。
8. 後續各輪依 N6 的變更觸發規則執行品質回測，保留比較證據；不得以契約測試通過代替內容品質驗收。

## 8. 參考文件

- [專案規範](../CLAUDE.md)
- [現況整理](../docs/agent-work-team-current-state-context.md)
- [現況審視](../docs/agent-work-team-current-state-review.md)
- [架構決策與交付策略](../docs/architecture/prompt-orchestration-determinism.md)
- [限制與未提供能力清單](../docs/discussions/2026-07-20-current-limitations-issues.md)
- [既有建議報告](../docs/reports/2026-07-20-current-limitations-recommendation-report.md)
- [資料根目錄設定設計](../docs/superpowers/specs/2026-07-30-agent-work-team-data-root-config-design.md)

