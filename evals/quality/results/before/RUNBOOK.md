# T2 Runbook：改善前 18 次真實執行

給實際操作真實 Claude Code + `ai-agent-dev-platform` plugin 的人（不是我，我沒有 slash command 存取權）。目標：對 Q1–Q6 各跑 3 次獨立 session，全部用**目前未修改**的 command／agent，把 transcript／artifact 交給我記錄與評分。

## 0. 前置：啟用 plugin

在一個**真正的** Claude Code session（不是這個開發用的 repo session）：

```text
/plugin marketplace add C:\Users\Patrick\Desktop\agent_tool_for_sdlc\AI-agent-development-platform
/plugin install ai-agent-dev-platform@ai-agent-dev-platform-marketplace
```

確認 `/agent-work-team` 出現在可用指令清單。記下：`host`（例如 "Claude Code CLI"）、`host_version`、`model`（session 顯示的實際 model 識別）、plugin 載入時對應的 `plugin_commit`（在**這個開發 repo**執行 `git rev-parse HEAD`，目前應為 `00925d9` 之後的最新 commit——執行前務必重新確認，不要用記憶值）。這些欄位不能用「檔案存在」推論，必須是這次 session 實際回報／可觀察的值；拿不到就記 `unknown`。

## 1. 每次 run 的共同流程

1. 建一個全新、跟這個 plugin repo、跟使用者其他專案完全分開的 scratch git repo，例如 `%TEMP%\quality-eval-<case>-<n>\`：`git init`，設一個假 committer identity（不要用真實帳號），第一個 commit 只放一個空的 `README.md`。
2. 依下面各案例的指示，把對應 fixture 檔案複製進去、跑 `/agent-work-team` 等指令。
3. **全程截取 transcript**（每一輪你打的字與 Agent 的回覆），不要只存最終摘要。
4. session 結束後，在 `evals/quality/results/before/<run_id>/` 建立目錄（`run_id` 例如 `Q1-before-1`），放：
   - `transcript.txt`（完整對話）
   - 實際產出的 artifact 副本（例如 `plan-spec.json`、`dev/T1-review.json`、`knowledge-report.json`，視案例而定）
   - 若這個案例需要第 2 節說明的「注入設定」，另存 `setup-diff.txt`，記錄你手動改了什麼（原文→改成什麼），供評分與稽核用；這不算 Agent 的輸出，評分時不能算進 Agent 的分數。
5. 把這些檔案（或路徑）交給我；我會依 `rubric.md` 評分、填 `run.json`、跑 `node evals/quality/record.mjs` 驗證。你不用自己填 `run.json` 或打分——除非你想自己先打分，我再核對。

## 2. 各案例操作指示

Host-visible 文字一律照抄 `../../cases.json` 對應案例的 `host_visible.requirement`（不要意譯，避免用詞差異影響評測）。

### Q1（Planner 重用既有服務）×3

1. 複製 `evals/quality/fixtures/search/src/` 與 `tests/` 到 scratch repo，`git add -A && git commit -m fixture`。
2. 執行 `/agent-work-team`，需求貼 `cases.json` Q1 的 `host_visible.requirement`。
3. 若 BA 問澄清問題：按你的合理判斷回答（Q1 的重點是 Planner 的搜尋行為，不是 BA），但不要主動提示「有一個叫 normalizeName 的函式」。
4. 走到 Spec 待核准，直接 approve；commit_mode 選 `per_task`（三個案例都固定選這個，避免 squash 影響 review 可觀察性）。
5. 存 `plan-spec.json`／`.md`（重點看有沒有出現在 evidence 裡引用 `normalize-name.mjs`——目前版本的 Plan/SA/SD agent 工具只有 Read/Write，沒有 Glob/Grep，**預期很可能引用不到**；這正是要記錄的落差，不是操作失敗）。
6. 不需要真的跑 Development；Spec 核准後即可結束這次 session。

### Q2（BA 追問模糊需求）×3

1. 同 Q1 複製 fixture。
2. 執行 `/agent-work-team`，需求貼 Q2 的 `host_visible.requirement`（就是「讓搜尋更好」，不要多補充）。
3. **固定回答腳本**——BA 問到對應主題就用這個答案，維持三次一致：
   - 問「查詢字串要能比對名字中間/任何位置嗎」類問題 → 「對，查詢字串出現在名字任何位置都要能找到，不限開頭。」
   - 問大小寫 → 「不分大小寫。」
   - 問前後空白 → 「查詢字串前後多餘空白要忽略。」
   - 問搜尋範圍/欄位 → 「目前先只搜尋名字這個欄位。」
   - 問效能/資料量 → 「資料量不大，不用特別優化效能。」
   - 其他未列出的問題 → 「目前沒有其他特殊需求，請依一般合理預設處理。」（不要主動講出 substring/prefix 這類實作詞彙）
4. 記錄 BA 在給出摘要前**實際問了哪幾題**、問的順序、有沒有跳過釐清就直接寫 AC——這是評分重點。
5. 摘要／AC confirm 後即可結束，不需要往下走 Spec。

### Q3（Reviewer 抓 implementation 落差，AC 正確但實作錯）×3

**注入設定（人工操作，非 Agent 行為，需寫進 `setup-diff.txt`）：** 這是目前 command 架構的限制——`/agent-work-team-develop` 一定是「真的 Developer 先做，馬上接真的 Reviewer」，沒有「假裝 Developer 已完成、直接跳到 Reviewer」的路徑。要讓 Reviewer 每次看到同一個已知 bug，同時保持 Reviewer 本身的 dispatch／判斷完全真實，做法是：讓真正的 Developer 依照一份「故意寫錯的 task 指示」實作——Reviewer 完全不知情、完全正常執行，我們只控制它看到的輸入。

1. **只**複製 `evals/quality/fixtures/search/src/normalize-name.mjs`（既有可重用工具，真的存在）進 scratch repo 並 commit；**不要**複製 `search.mjs`／`search.test.mjs`——這兩個檔案要由真 Developer 依（被注入的）task 描述現寫，不是預先放好的。
2. 執行 `/agent-work-team`，需求用：「請新增依名字搜尋的功能，查詢字串出現在名字任何位置（substring）都要能找到，不限開頭。」BA 澄清可自然回答，最終 AC 務必包含「substring／不限開頭」字樣。
3. Plan/SA/SD 產出 `plan-spec.json` 後，在核准前，**手動編輯** `task_breakdown` 裡負責搜尋邏輯的那個 task 的 `description`（不要動最外層 `requirement_summary`／AC 的 substring 敘述，只動這個 task 自己的 `description`），改成類似：「使用 `String.prototype.startsWith` 比對名字開頭來實作搜尋」。把改之前／改之後的內容存進 `setup-diff.txt`。
4. Approve Spec（commit_mode 選 `per_task`），執行 `/agent-work-team-develop`。真的 Developer 會依你改過的 task description 實作（預期會寫出 `startsWith`）；真的 Reviewer 會依 task 的 `acceptance_criteria`（沒被你改過，仍是 substring）審查這個 diff。
5. 存這個 task 的 `dev/T{n}-review.json`／`.md`、Developer 的 `dev/T{n}-report.json`，以及 `setup-diff.txt`。看 Reviewer 有沒有抓到「實作是 prefix，AC 是 substring」。
6. Reviewer 給 Needs fixes 是預期會發生的（bug 真實存在）；到這裡就可以結束 session，不用真的修到 Approved。

### Q4（單測通過但整合失敗）×3

**注入設定同 Q3 的原則。**

1. Scratch repo 只放一個空的 `README.md` 初始 commit（跟第 1 節通用流程一樣）；**不要**預先放 `api.mjs`／`client.mjs`——兩個都要由真 Developer 依（被注入的）task 描述現寫。
2. 執行 `/agent-work-team`，需求用：「請串接一個名字搜尋 API：後端 API 用 `query` 這個欄位名稱接收查詢字串；前端／client 呼叫這個 API 時要能查到符合的名字。請拆成兩個 task：一個實作 API，一個實作呼叫 API 的 client。」（明確要求拆兩個 task，讓後面的注入好對應）。
3. Plan/SA/SD 產出 `plan-spec.json` 後，核准前手動編輯**負責 client 的那個 task**的 `description`，加一句：「呼叫 API 時使用 `{ q: <查詢字串> }` 作為參數」（API 那個 task 的 description 維持用 `query` 這個欄位名稱，不要動）。存 `setup-diff.txt`。
4. Approve Spec，執行 `/agent-work-team-develop`。兩個 task 的 Developer 各自實作、各自的單元測試很可能都 pass（各自只驗證自己那半）。全部 task done 後會觸發整體 review（`scope: "final"`）。
5. 重點觀察：final review 有沒有實際執行或至少發現這個跨模組的參數不一致（目前版本沒有強制的 owner=controller 整合測試步驟，這正是要記錄的落差）。存 `dev/final-review.json`／`.md`、兩個 task 的 report、`setup-diff.txt`。

### Q5（spec 誤寫，實作照做但沒解決原始需求）×3

**注入設定同 Q3。**

1. **只**複製 `normalize-name.mjs`（同 Q3 的理由，不預放 `search.mjs`／`search.test.mjs`）。
2. 執行 `/agent-work-team`，需求用：「搜尋應支援名稱中間的文字」（=`cases.json` Q5 的 `original_request`）。BA 澄清時，若被問到匹配語意，明確回答「只要查詢字串出現在名字任何位置就要能找到，不限開頭」，確保 `ba-requirement.json` 正確記下 substring。
3. Plan/SA/SD 產出 `plan-spec.json` 後，核准前**手動編輯**最外層／該 task 的 `acceptance_criteria`，把 substring 的敘述改成「查詢字串比對名字開頭（prefix match）」（模擬 spec 撰寫錯誤）。存 `setup-diff.txt`（含改之前的原文，證明 BA 是對的、只有 spec 寫錯）。
4. Approve Spec，執行 `/agent-work-team-develop`。真 Developer 會依（錯誤的）AC 實作 prefix／`startsWith`；真 Reviewer 依這個 task 的 AC 審查——這裡的重點不是 Reviewer 抓不到 code bug（照 spec 實作沒有 code bug），而是看 Reviewer 有沒有能力／有沒有被要求去對照 BA／原始需求，發現「完全符合 spec 但沒解決原始問題」。**目前版本的 Reviewer agent 輸入不包含 BA／原始需求**，預期會直接 Approve——這正是要記錄的落差，不是操作失敗。
5. 存 `ba-requirement.json`、`plan-spec.json`、`dev/T{n}-review.json`、`setup-diff.txt`。

### Q6（純錯字修正，不該硬造筆記）×3

不需要注入，全程自然執行。

1. 建立全新 scratch repo；在裡面建立 `.agent-work-team/wiki/Rules/style.md`，內容複製自 `evals/quality/fixtures/knowledge/wiki/Rules/style.md`（模擬「wiki 已有相關規則」）。
2. 建一個小檔案 `README.md`，故意打錯字（例如寫 `Users can recieve notifications.`），commit。
3. 執行 `/agent-work-team`，需求用 Q6 的 `host_visible.requirement` 精神：「README 裡 'recieve' 拼字錯誤，請修正為 'receive'」。BA／Plan／Dev／Review 都自然走完（這個需求很小，AC 大概就是「README.md 的 recieve 改成 receive，不影響其他內容」，task 大概只有一個）。
4. 核准最終審查到 `DEV_APPROVED`，執行 `/agent-work-team-knowledge`。
5. 存 `knowledge/knowledge-report.json`／`.md`，以及 wiki 目錄下實際新增／修改了哪些檔案（`git status`／`git diff` 對 wiki 目錄的結果）。重點看有沒有為這個純錯字修正新增一篇看起來像新知識的主題筆記。

## 3. 若中途卡住

- 登入／額度／權限問題 → 該次 run 的 `status` 記 `blocked`，具體寫下卡在哪一步、什麼錯誤訊息，交給我；不要用假造內容補完。
- Agent 本身回報 `BLOCKED`／`NEEDS_CONTEXT` 且你無法在合理範圍內回答 → 一樣視為這次 run 的觀察結果（不是操作失敗），照實記錄，我會依 rubric 評分（例如 handoff 維度可能因此偏低）。
- 不確定某個編輯算不算「過度洩漏答案」給 Agent → 先照原計畫做，在交接時明確告訴我你做了什麼，我來判斷這次 run 要不要標記或補做。
