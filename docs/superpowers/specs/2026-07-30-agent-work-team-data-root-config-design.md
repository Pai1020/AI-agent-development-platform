# Agent Work Team — 資料根目錄可設定化 Design

## 背景與目的

`agent-work-team` 的 Planning（見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`）、Development（見 `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`）、Knowledge Agent（見 `docs/superpowers/specs/2026-07-07-agent-work-team-knowledge-design.md`）三個階段目前都把所有狀態與產出檔案寫死在使用者專案的 `.agent-work-team/` 底下。這個路徑目前寫死出現在 6 個 command、2 支 hook 裡。

本次 spec 的目的：讓資料根目錄（`data_root`）變成**專案層級一次性設定**，使用者可以選擇維持預設（`.agent-work-team/`）或指定客製位置（專案內其他相對路徑，或專案外的絕對路徑），設定後同一個專案所有 request 都共用這個位置。

**本次範圍**：只調整「資料存放位置從哪裡解析」這件事本身；不調整 Development 階段的 commit 顆粒度、不做既有 `.agent-work-team/` 資料的自動搬遷、不新增 Web UI 或互動式設定介面。

## 設定檔

新增 `.claude/agent-work-team.config.json`：

```json
{ "data_root": ".agent-work-team" }
```

- 這個檔案本身永遠固定放在 `.claude/` 底下，**不受 `data_root` 設定值影響**——不管 `data_root` 指到哪裡，任何 command／hook 都能從這個固定位置找到它，避免「不知道去哪裡讀設定」的雞生蛋問題。
- `data_root` 是相對路徑：專案內的客製位置（例如 `docs/agent-work-team-data`）。
- `data_root` 是絕對路徑：專案外的客製位置（例如 `D:/team-shared/agent-work-team`）。同一個欄位用路徑形式本身區分「專案內／外」，不額外加欄位。
- 檔案不存在＝這個專案尚未設定過，觸發下面的首次確認流程。
- 預設值固定是 `.agent-work-team`（相對路徑，等同現行行為）。

## 首次確認流程

只有 `/agent-work-team`（新需求入口）負責發起這個確認，在原本 Step 1（PM 分診）**之前**新增一步：

1. 用 Read 嘗試讀 `.claude/agent-work-team.config.json`。
2. 若不存在：跟使用者確認要用**預設**（`.agent-work-team`，專案內）還是**客製**路徑；選客製時請使用者提供路徑字串（相對＝專案內、絕對＝專案外），不做存在性／可寫性以外的額外校驗。用 Write 建立 `.claude/agent-work-team.config.json` 寫入選擇結果，然後才繼續往下走既有的 PM 分診等流程。
3. 若已存在：直接 Read 取得 `data_root`，不再詢問，正常往下走。

其餘 5 個 command（`agent-work-team-develop`／`agent-work-team-resume`／`agent-work-team-knowledge`／`agent-work-team-dashboard`／`agent-work-team-help`）**不**負責發起首次確認——理論上專案第一次一定是從 `/agent-work-team` 進入。若這些指令執行時發現 `.claude/agent-work-team.config.json` 不存在（例如使用者直接先跑了 `/agent-work-team-develop`），視為異常情況：明確告訴使用者「尚未透過 `/agent-work-team` 完成資料位置設定」，然後停止，不自行假設預設值、也不代為建立。

## Command／Agent 路徑解析與傳遞

1. 每個 command 在自己 Step 1（`agent-work-team.md` 是新增的確認步驟之後；其餘 5 個是流程最開頭）都先 Read 一次 `.claude/agent-work-team.config.json`，取得 `data_root`，**只讀這一次**，後續同一次指令執行全程沿用這個值，不重複讀檔。
2. 所有原本寫死 `.agent-work-team/requests/{request_id}` 的地方，一律改成 `{data_root}/requests/{request_id}`；既有的子路徑規則（`state.json`、`plan-spec.json`、`dev/progress.json` 等）不變，只是前綴從字面常量換成解析出來的變數。
3. Dispatch subagent 時沿用現有作法：把算好的 `output_dir`（已含正確的 `data_root` 前綴）當參數傳給 Developer／Reviewer／Plan-SD／PM／Knowledge Agent，**agent 端完全不用改邏輯**——現有 5 個 subagent 本來就只認 controller 傳入的 `output_dir` 參數，不自己組合或假設 `.agent-work-team` 字串（`agents/*.md` 目前出現的 `.agent-work-team` 字樣只是「例如 `.agent-work-team/requests/RQ-001`」這種參數舉例，需同步把範例字串改成中性描述，但不影響邏輯）。
4. Knowledge Agent 目前 wiki 路徑的 fallback 預設值是 `.agent-work-team/wiki/`（`agents/agent-work-team-knowledge.md:20`），改成由 controller 算好 `{data_root}/wiki/` 後當參數傳入；agent prompt 對應描述從「預設 `.agent-work-team/wiki/`」改成「使用 controller 傳入的 wiki 路徑（找不到 `CLAUDE.md` 指定路徑時的預設值）」。

## Hooks（維持各自獨立讀取，不參數化）

`hooks/sync-dashboard.mjs`、`hooks/enforce-block.mjs` 是 Claude Code 每次 `PostToolUse: Write` 都會重新啟動的獨立 Node process，彼此沒有記憶體可共用，`hooks/hooks.json` 又是隨 plugin 分發的靜態 manifest（同一份設定裝到每個使用這個 plugin 的專案），本來就不知道也不該知道特定專案的 `data_root`。`hooks.json` 目前唯一支援的動態值是 `${CLAUDE_PLUGIN_ROOT}`，沒有「讀專案設定後注入成 CLI 參數」的機制。因此這條路徑**不做參數化**，維持兩支 hook 各自在每次觸發時自行讀取設定：

1. 兩支 hook 一開始都改成 `readFileSync('.claude/agent-work-team.config.json')`（相對目前工作目錄，即使用者專案根目錄）：
   - 若檔案不存在或解析失敗：視為「這個專案還沒設定過 `data_root`」，直接照原本硬編碼的 `.agent-work-team` 當預設值繼續跑，不阻斷、不報錯——hook 是被動觸發，不該在這裡逼使用者去設定。
   - 若存在：取出 `data_root` 作為比對基準。
2. `sync-dashboard.mjs` 的 `REQUESTS_DIR`／`DASHBOARD_PATH` 常量，以及兩支各自的路徑匹配正則（`matchesStateJsonPath`／`matchesProgressJsonPath`），改成用解析出來的 `data_root` 動態組字串／動態建正則，而不是字面量 `.agent-work-team`。`data_root` 可能是絕對路徑（含 Windows 反斜線 `C:\...`），正則組裝時要對特殊字元（`\`、`.`、`/`）做 escape，並沿用現有測試已在驗證的正／反斜線兩種路徑分隔符案例。
3. 兩支 hook 各自的測試檔新增案例：`data_root` 為專案內自訂相對路徑、專案外絕對路徑時，路徑匹配與 rebuild 都要正確；以及 config 檔不存在時維持原本預設行為不被破壞。

## 邊界情況

1. **既有 request 的相容性**：已經在 `.agent-work-team/`（預設路徑）下產生過的 request，若這個專案第一次執行 `/agent-work-team` 時選擇維持預設值，完全不受影響。若選客製路徑，只影響**之後新建的 request**，舊資料留在原地，不做自動搬遷；首次確認對話中要明確告知使用者這一點。
2. **token 一致性檢查、`/agent-work-team-resume` 的 Glob 掃描**：邏輯本身不變，原本對 `.agent-work-team/requests/*/state.json` 做 Glob／Read 的地方，改成對 `{data_root}/requests/*/state.json` 做 Glob／Read。
3. **`.claude/agent-work-team.config.json` 損壞或格式錯誤**：
   - Command 端：停止執行，明確告訴使用者設定檔格式異常，請人工檢查或刪除後重新走首次確認，不自動猜測或修復。
   - Hook 端：讀取失敗一律 fallback 預設值 `.agent-work-team`，不阻斷（見上一節）。
4. **資料根目錄設在專案外（絕對路徑）**：代表這部分資料不再受這個 git repo 版控，`state.json`／`dashboard.md` 等檔案的異動沒有 commit 歷史可查。這是客製絕對路徑選項本身固有的取捨，不在本次範圍內另做版控或備份機制。

## 文件同步（非本次實作強制項）

設計實作完成後，以下文件的「資料固定存在專案內 `.agent-work-team/`」描述需要更新為「可透過 `.claude/agent-work-team.config.json` 設定資料根目錄，預設 `.agent-work-team/`」：`README.md`、`CLAUDE.md`、`docs/agent-work-team-current-state-context.md`。是否與程式碼變更同一批次處理，由實作時程決定。
