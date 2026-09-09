# 開發執行總計畫與模型交接

- 日期：2026-09-09
- 狀態：規劃完成；功能尚未開始實作。
- 工作分支：`codex/development-execution-plan`；程式基準：`7ccbaf7`。
- 主要來源：使用者指定的 `C:/Users/Patrick/Documents/Codex/2026-09-09/1-1-5-1-n6-2/refactor/2026-09-09-development-priorities.md`。
- 指定來源 SHA256：`CA43A9677F0F1D6C6AC2F2AD65A90C785537C63C47084B343E15A6A4602A4B48`。
- 與本地同名文件比較：本地 §7.2 額外明列第 2 輪 Core／Copilot 起步須獨立 spec。兩版 §5 都已有該要求，執行排序沒有衝突；不覆寫任何原文件。

## 1. 建議如何分工

這個專案適合先用目前模型釐清跨階段契約、錯誤／續接語意與驗收案例，再交給後續模型一次實作一個小任務。不能只換模型然後提供一句「繼續開發」：接手入口必須含 spec、當前任務、已完成 commit 和驗證證據。

本次交付整體排程、第一輪設計草案、第一輪六個實作任務。第一輪的具體設計尚待審閱；後續輪次只定義輸入、交付邊界與出口條件，避免在 core／host 能力尚未驗證前寫出看似精確卻不可執行的程式碼。

| 工作 | 適合的執行方式 | 升級給較強模型／維護者的條件 |
|---|---|---|
| fixtures、記錄器、固定 schema 範例、文件同步 | 較低成本模型或 Claude Code，單任務執行 | 現有資料格式與設計衝突 |
| 已定義的 Agent 輸入／輸出改動 | 較低成本模型，附完整 producer／consumer 清單 | 必須改 outcome、stage 或相容政策 |
| 規格缺口阻擋、跨 session 續接 | 依明確案例實作，獨立 review | 部分寫入後恢復語意不明 |
| core 契約、Git 副作用、migration、approval | 較強模型先定設計與反例，再拆小任務 | host 缺必要能力、資料一致性或恢復方案改動 |
| 品質評分與基準接受 | 可用模型協助整理，維護者確認 | 模型間判分矛盾、疑似退步或要接受取捨 |

這是工作拆分建議，未更改 Codex 或 plugin 內的模型設定，也不假設 Claude Code 必然更便宜。實際切換後用相同案例確認品質，費用有可取得用量才比較。

## 2. 整體交付路線

| 批次 | 前置條件 | 交付與責任邊界 | 出口證據 |
|---|---|---|---|
| 1：品質基礎 | 第一輪 spec 確認、真實 Claude 測試環境 | N6 → N1 → N3 → N4；見六個任務 | 改善前後結果、17 項 hook 回歸、新增場景、人工接受的品質基準 |
| 2A：最小契約與 host 可行性 | 第一輪基準可用；可先做不改 runtime 的資料整理 | PowerShell 7+ core 切片 spec、host 能力表、獨立估算 | 範圍、outcome/schema/transition/retry/approval/persistence、測試與未知風險均具體定義 |
| 2B：Core＋Claude Planning | 2A spec 確認、必要環境成立 | 新 request→BA 待確認→Spec 待核准→SPEC_APPROVED；包含中斷續接 | core 行為測試、Claude 真實跨 session、Q1/Q2 與改善後基準比較 |
| 2C：Copilot 同一切片 | 2B 穩定 | VS Code Chat user-facing custom agent＋hidden role subagents；薄 adapter | 同情境 state/event/artifact 對等；各 host Q1/Q2 回測；無重複流程規則 |
| 3A：Git 保護 | 2C 完成、Git／worktree spec 確認 | preflight、隔離工作區、core 獨占 staging/commit、commit_mode | dirty repo、錯分支、跨路徑、操作中斷與重試不破壞使用者工作 |
| 3B：Development core 化 | 3A 保護可驗證 | task/review/final validation、N3/N4、per_task/squash | 逐能力 Core→Claude→Copilot；task/final/resume；核准後 squash 中斷可恢復 |
| 3C：Knowledge core 化 | 3B、外部 vault 政策確認 | 成果整理、人工核准、外部資料操作邊界 | Q6 回測與雙 host parity；整輪重跑已支援全套案例 |
| 4：配布與舊資料 | protocol/adapter 穩定 | install/update/remove、版本相容、inventory、dry-run、有限 converter／repair | 不自動遷移、snapshot、受支援 stage 的原子驗證與失敗回復 |
| 5：實際工作模式 | 穩定 task/spec 識別與續接 | N2 類型完成條件 → N5 需求變更；data_root 設定責任 | Bug/Performance/Research 驗收差異、變更影響確認、所有 writer 路徑一致 |
| 6：交付整合 | 穩定事件與 provider 介面 | PR/CI、通知、用量統計；再依需求選其他功能 | 共用 provider、通知只含可行動事件、品質／流程回測 |

2C 緊接 2B，不等 Claude 全部完成。Git 保護在新版 Development 開放前完成。已實作的 resume、token、Dashboard、Knowledge、commit_mode 是遷移／回歸對象，不重新當新功能估算。

## 3. 第一輪開工包

1. 讀 [第一輪設計草案](../docs/superpowers/specs/2026-09-09-quality-foundation-design.md)：確認資料契約、品質門檻與停止政策。
2. 依 [第一輪實作計畫](../docs/superpowers/plans/2026-09-09-quality-foundation.md) T1–T6 執行。
3. 每個任務以實際 evidence 路徑與 commit 回報，再接下一個任務。

| 任務 | 成果 | 接手難度／review 重點 |
|---|---|---|
| T1 | 六個固定案例＋結果記錄器 | 中；fixture 不洩漏答案，證據驗證不是自動品質評分 |
| T2 | 18 次改善前結果 | 環境／評測工作；必須真實 host，不合成輸出 |
| T3 | Planner 搜尋與證據 | 中；新建與 resume 皆傳脈絡、不杜撰假設 |
| T4 | 測試責任與整體證據 | 中高；初始／修正／final 路徑一致，legacy 相容 |
| T5 | 需求審查＋spec gap 持久化 | 高；不能把規格變更派成 fix，重跑不誤解除 |
| T6 | 回測、品質接受、交接 | 中；保留退步和限制，不能只跑自動測試便通過 |

工作量用交付單位估算，不承諾日曆日期或 token 金額：T1/T3 各一個中型變更，T4/T5 各一個需多場景 review 的變更，T2/T6 以實測／人工評分為主。第一輪最低 48 次案例執行，另含相容、續接、commit mode 場景；應在 T1 後以兩次實際 pilot 的時間估計總成本。若超過可用預算，明確調整案例／重跑門檻並重新確認，不能偷偷省略 baseline。

## 4. 第 2 輪開發前必須完成的設計清單

2A 是獨立交付，不讓較低成本模型從一句「新增 core」開始猜。先產出切片 spec 與逐任務 plan，再開始程式實作。

| 工作包 | 具體輸出 | 驗證／估算要求 |
|---|---|---|
| 切片邊界 | PM、BA、Planner、human gates 的 action／outcome；哪些 legacy request 僅導向舊入口 | 正常、needs_context、blocked、重跑、部分寫入場景 |
| Core contract | versioned JSON、集中 transition table、三層 validator、audit-only events | state 保持權威；拒絕錯 token／schema／action、重複提交 |
| 持久化與冪等性 | lock、staging、跨檔案發布次序、action identity、可診斷的半完成策略 | 每個寫入邊界注入中斷，不只正常路徑 |
| 人工核准 | request/stage/action/artifact hash/expiry/single-use nonce 的 challenge | 過期、重用、artifact 修改、錯 request 不通過 |
| Claude adapter | 只搬運上下文／結果，狀態與 retry 由 core 控制 | 實際 session 中斷可續接；無 Prompt transition 副本 |
| Copilot 可行性 | 實際 host 版本、user-facing/hidden agent、工具權限、core 呼叫方式 | 以當時官方能力與本機實測為證；不能預設已支援 |
| Copilot 薄 adapter | 與 Claude 同一情境 fixture／golden expectations | 2C 隨 2B 後交付，單獨列開發與環境成本 |
| 相容與品質 | protocol writer ownership、legacy route；Q1/Q2 baseline 引用 | contract parity 和內容品質分開報告 |

估算表必須把「核心開發、Claude adapter、Copilot adapter、測試／評測、外部環境等待」分開。PowerShell 7+、audit-only、local challenge、明確 migration 與 VS Code Chat 方向為既有 Approved；lock／repair／worktree lifecycle 的細節仍待設計。本次未選新框架、套件版本或假設最新 host API。

## 5. 可直接貼給接手模型的指令

設計確認後使用：

```text
請在此 repository 接續第一輪品質基礎開發。
先讀 CLAUDE.md、docs/architecture/prompt-orchestration-determinism.md、
docs/superpowers/specs/2026-09-09-quality-foundation-design.md、
docs/superpowers/plans/2026-09-09-quality-foundation.md。
確認對話／文件中的設計核准紀錄。從第一個尚未完成的 T 任務開始，
本次只完成這個任務；不要擴大成 core 或 Copilot 實作。
先檢查分支與未提交變更，保留使用者工作；不要直接改 main。
每項修改讀 producer 和 consumer，照 task 的場景驗證；
真實品質評測未跑不可記 passed，缺環境要具體記錄 blocked。
完成後回報 task、commit、變更檔案、驗證證據、品質差異、未完成項、下一任務。
涉及契約與路由時同步 living architecture 與現況文件。
不要自行改模型設定、使用額度重置、部署或 merge。
```

若換成另一個 checkout／Claude Code 工作目錄，先把這三份新文件帶到該 checkout 並確認對應程式版本；不能只帶這段 prompt 或依賴聊天記憶。

## 6. 當前檢查與未完成工作

已核對 command／agent 真實內容、CLAUDE.md、living architecture 與指定來源。已在獨立分支建立本計畫。Node v22.16.0 下現有兩個 hook 測試共 17 項通過；這不代表 Claude 端到端已驗證。

尚未執行：新評測工具／fixtures、18 次改善前 baseline、Prompt 改動、品質比較、真實 Claude 登入／可用模型確認、Copilot host 探查。claude 與 pwsh 入口存在只代表可找到命令，不代表實際整合就緒。

目前下一步是審閱第一輪具體設計，確認後從 T1 開始。這份計畫不將既有 Proposed／Open 項目自動改為 Approved，也沒有把後續六輪當作已開發完成。
