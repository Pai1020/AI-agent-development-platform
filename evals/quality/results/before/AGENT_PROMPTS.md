# T2：可直接貼給另一個 session 的 Agent 執行提示詞

給**已安裝 `ai-agent-dev-platform` plugin 的另一個 Claude Code session**用。每個案例一個提示詞，貼給該 session 的 Agent 後，它會自己扮演「操作者」（建立 scratch repo、輸入需求、依腳本回答 BA、視案例注入 task 描述、核准關卡、跑到需要的階段），全程自己記錄成證據包。**你不用手動一步步操作**，但每個案例要開 3 次全新 session（不要延續同一個對話跑第二次），各貼一次提示詞，只改開頭的 `RUN_LABEL`。

貼完之後把 Agent 產出的 `quality-eval-output/<RUN_LABEL>/` 整個資料夾內容交回給我（貼檔案內容，或告訴我可以怎麼取得這個資料夾），我會依 `rubric.md` 評分、寫 `run.json`、跑 `record.mjs` 驗證、更新 `RUN_TRACKER.md`。

**重要限制**：這些提示詞只包含操作腳本（要打什麼字、什麼時候核准、Q3/Q4/Q5 要注入什麼），**不含**評分答案（`cases.json` 的 `reviewer_only_answer`）。執行的 Agent 不知道自己會被怎麼評分，只是照腳本把真實的 PM/BA/Planner/Developer/Reviewer/Knowledge 流程跑一遍並如實記錄——這是刻意設計，不要額外貼 `reviewer_only_answer` 的內容給它。

---

## Q1：Planner 是否重用既有服務

````text
RUN_LABEL: Q1-before-1   ← 每次重跑改成 Q1-before-2 / Q1-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。請嚴格照下列步驟操作，不要自己發揮或跳過步驟，也不要偽造任何輸出——卡住就照實停下來回報，不要用猜測的內容繼續。

## 步驟 1：建立 scratch 環境
在系統暫存目錄建立一個全新資料夾（例如 Windows 用 `%TEMP%\quality-eval-{RUN_LABEL}\`），在裡面：
1. `git init`，設一個假的 committer identity（例如 `git config user.email "eval@example.com"` / `git config user.name "quality-eval"`），不要用真實帳號。
2. 建立 `src/normalize-name.mjs`，內容一字不改：
   ```js
   export const normalizeName = value => value.trim().toLowerCase();
````
3. `git add -A && git commit -m "fixture: existing normalize-name util"`。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 是可執行的指令。若不可用，停止並回報「plugin 未啟用」，不要繼續。

## 步驟 3：執行 /agent-work-team
在剛剛建立的 scratch 資料夾裡執行 `/agent-work-team`，需求文字**逐字**貼：

「請幫我在現有的名字清單裡加上依名字搜尋的功能，專案裡已經有 src/normalize-name.mjs 可用。」

若流程用 AskUserQuestion 或純文字問你（BA）任何澄清問題：依常理自然回答即可（例如搜尋範圍就是名字欄位、不需要特殊效能考量），**但不要主動提到或暗示 normalizeName 這個函式該不該被重用**——那是要觀察 Planner 自己會不會找到的事，不要幫它作答。

走到「Spec 已產出，待核准」時：
- commit_mode 選 `per_task`。
- 直接回覆 approve，不要要求修改。

Spec 核准後這個案例就結束，不需要執行 `/agent-work-team-develop`。

## 步驟 4：收集證據
在 scratch 資料夾建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：你在這次對話裡實際做的每一步（你打了什麼需求文字、BA 問了什麼你怎麼答、最後核准內容），照時間順序寫，不要事後美化或省略。
- `plan-spec.json` 與 `plan-spec.md` 的完整副本。
- `ba-requirement.json` 的完整副本。
- `meta.json`：
  ```json
  {
    "run_label": "{RUN_LABEL}",
    "case_id": "Q1",
    "host": "<這個 session 的 host 名稱，例如 Claude Code CLI>",
    "host_version": "<能取得的版本，取不到寫 unknown>",
    "model": "<這個 session 實際使用的 model 識別，取不到寫 unknown>",
    "plugin_commit": "<若能找到本機 ai-agent-dev-platform plugin 安裝目錄，在該目錄跑 git rev-parse HEAD 取得；取不到寫 unknown，不要用猜的>",
    "started_at": "<ISO 時間>",
    "completed_at": "<ISO 時間>",
    "status": "completed 或 blocked，若 blocked 要寫清楚卡在哪一步、什麼錯誤"
  }
  ```

完成後回報：這個資料夾的完整路徑，以及 `meta.json` 的內容摘要。
```

---

## Q2：BA 是否追問模糊需求

````text
RUN_LABEL: Q2-before-1   ← 每次重跑改成 Q2-before-2 / Q2-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。請嚴格照下列步驟操作，不要自己發揮或跳過步驟，也不要偽造任何輸出——卡住就照實停下來回報。

## 步驟 1：建立 scratch 環境
同 Q1 步驟 1（建立 scratch 資料夾、git init、寫入同樣的 `src/normalize-name.mjs`、commit）。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 可執行，否則停止回報。

## 步驟 3：執行 /agent-work-team
需求文字**逐字**貼：

「讓搜尋更好」

BA 若追問澄清問題，依下列固定腳本回答（同一個問題主題只用這個答案，不要每次現編不同措辭）：
- 問到「查詢字串要能比對名字中間/任何位置嗎」類問題 → 「對，查詢字串出現在名字任何位置都要能找到，不限開頭。」
- 問大小寫 → 「不分大小寫。」
- 問前後空白 → 「查詢字串前後多餘空白要忽略。」
- 問搜尋範圍/欄位 → 「目前先只搜尋名字這個欄位。」
- 問效能/資料量 → 「資料量不大，不用特別優化效能。」
- 其他未列出的問題 → 「目前沒有其他特殊需求，請依一般合理預設處理。」
不要主動講出 substring/prefix 這類實作詞彙，只在被直接問到匹配語意時才用上面第一條回答。

**在寫 transcript 時，逐題記錄 BA 實際問了哪些問題、問的順序，以及是否在提出任何釐清問題之前就直接給出需求摘要／AC**——這是這個案例最重要的觀察重點。

需求摘要與 AC 確認後這個案例就結束，不需要往下走 Spec 核准。

## 步驟 4：收集證據
建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：完整問答記錄（逐題），包含每題的完整原文與你的完整回答。
- `ba-requirement.json`、`ba-requirement.md` 的完整副本。
- `meta.json`：同 Q1 格式，`case_id` 改 `"Q2"`。

完成後回報資料夾路徑與 `meta.json` 摘要。
````

---

## Q3：Reviewer 能否抓到「AC 正確、實作用錯比對方式」

````text
RUN_LABEL: Q3-before-1   ← 每次重跑改成 Q3-before-2 / Q3-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。這個案例裡你要扮演「使用者」把流程推進到 Development 階段，途中有一步需要你手動注入一段故意寫錯的 task 說明——這是刻意的測試設計，不是你自己的判斷錯誤，請照做並如實記錄。全程不要偽造任何輸出，卡住就照實停下來回報。

## 步驟 1：建立 scratch 環境
同 Q1 步驟 1（只放 `src/normalize-name.mjs`，commit）。**不要**自己額外建立 search.mjs 或任何測試檔——那些要由後面的真實 Developer agent 建立。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 可執行，否則停止回報。

## 步驟 3：執行 /agent-work-team
需求文字**逐字**貼：

「請新增依名字搜尋的功能，查詢字串出現在名字任何位置（substring）都要能找到，不限開頭。」

BA 澄清可自然回答（維持 substring 語意，不要讓 AC 變成別的意思）。確認需求摘要與 AC 時，務必確認最終 AC 有清楚寫出「substring／不限開頭／名字任何位置」這類文字。

## 步驟 4：注入設定（人工操作，不是 Agent 的判斷）
Plan/SA/SD 產出 `plan-spec.json` 後，**在核准前**：
1. 完整讀出 `task_breakdown` 裡負責搜尋邏輯那個 task 的原始 `description`，存下來（等一下要放進 `setup-diff.txt`）。
2. 用 Edit 把這個 task 的 `description` 改成類似：「使用 `String.prototype.startsWith` 比對名字開頭來實作搜尋功能」（具體措辭可以自然一點，但必須明確指示用「比對開頭」的方式，不要改成別的意思）。
3. **只改這一個 task 的 `description`**，不要動 `requirement_summary`、不要動任何 `acceptance_criteria`（這些必須維持 substring 的正確敘述）。
4. 把「改之前的原文」與「改之後的內容」寫進 `setup-diff.txt`（步驟 7 會用到）。

## 步驟 5：核准並執行 Development
- commit_mode 選 `per_task`。
- 回覆 approve 核准 Spec。
- 執行 `/agent-work-team-develop`。這一步會 dispatch 真正的 Developer agent（會依你改過的 task 說明實作）跟真正的 Reviewer agent（會依這個 task 沒被你改過的 acceptance_criteria 審查）——這兩個 agent 的行為完全交給它們自己判斷，你不要介入或提示。
- 若 Reviewer 回報 Needs fixes：這是預期會發生的（bug 是真的存在的），到這裡就可以結束，**不要**繼續進行修正回合。若 Reviewer 回報 Approved，也如實記錄，不要覺得「應該要抓到」就自己改結果。

## 步驟 6：收集證據
建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：完整記錄，含步驟 4 的注入操作。
- `ba-requirement.json`、`plan-spec.json`（核准前，也就是含你注入內容的版本）、`plan-spec.md`。
- 這個 task 的 `dev/T{n}-report.json`、`dev/T{n}-review.json`（實際檔名依 plugin 產出為準）。
- `setup-diff.txt`：步驟 4 的改前改後內容。
- `meta.json`：同 Q1 格式，`case_id` 改 `"Q3"`。

完成後回報資料夾路徑與 `meta.json` 摘要，並明確說 Reviewer 最終的 verdict 是什麼。
````

---

## Q4：單元測試都過，整合是否真的驗證過

````text
RUN_LABEL: Q4-before-1   ← 每次重跑改成 Q4-before-2 / Q4-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。這個案例需要你在流程中注入一段故意寫錯的 task 說明，是刻意的測試設計，請照做並如實記錄。全程不要偽造任何輸出，卡住就照實停下來回報。

## 步驟 1：建立 scratch 環境
建立 scratch 資料夾，`git init`（假 identity），只放一個空的 `README.md` 做初始 commit。**不要**自己建立任何 src 檔案——api 與 client 都要由後面真實的 Developer agent 建立。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 可執行，否則停止回報。

## 步驟 3：執行 /agent-work-team
需求文字**逐字**貼：

「請串接一個名字搜尋 API：後端 API 用 `query` 這個欄位名稱接收查詢字串；前端／client 呼叫這個 API 時要能查到符合的名字。請拆成兩個 task：一個實作 API，一個實作呼叫 API 的 client。」

BA 澄清可自然回答，但要維持「拆成兩個 task」這個結構性要求。

## 步驟 4：注入設定
Plan/SA/SD 產出 `plan-spec.json` 後，**在核准前**：
1. 找到負責「client／呼叫 API」的那個 task，存下它原本的 `description`。
2. 用 Edit 把這個 task 的 `description` 加一句類似：「呼叫 API 時使用 `{ q: <查詢字串> }` 作為參數」（明確指定用 `q` 這個欄位名稱）。
3. 負責「API」的那個 task 的 `description` **不要動**，要維持用 `query` 這個欄位名稱接收查詢字串。
4. 存 `setup-diff.txt`（改前改後）。

## 步驟 5：核准並執行 Development
- commit_mode 選 `per_task`。
- approve 核准 Spec。
- 執行 `/agent-work-team-develop`，讓兩個 task 依序被真正的 Developer 實作、真正的 Reviewer 逐 task 審查。**你不要介入或提示任何 agent。**
- 兩個 task 都完成後會自動觸發整體最終審查（final review，`scope: "final"`）。等它產出結果即可，若最終審查回報 Needs fixes，如實記錄內容，**不要**自己代替 Developer 去修。

## 步驟 6：收集證據
建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：完整記錄，含步驟 4 的注入操作。
- `plan-spec.json`（含注入內容的版本）、`plan-spec.md`。
- 兩個 task 各自的 `dev/T{n}-report.json`、`dev/T{n}-review.json`。
- `dev/final-review.json`、`dev/final-review.md`。
- `setup-diff.txt`。
- `meta.json`：同 Q1 格式，`case_id` 改 `"Q4"`。

完成後回報資料夾路徑、`meta.json` 摘要，並明確說最終審查有沒有實際執行整合測試（例如呼叫 client 對 api 的實際流程）、有沒有發現參數名稱不一致。
````

---

## Q5：Spec 誤寫時，Reviewer 是否只看 spec 就放行

````text
RUN_LABEL: Q5-before-1   ← 每次重跑改成 Q5-before-2 / Q5-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。這個案例需要你在流程中注入一段故意寫錯的 spec 內容，是刻意的測試設計，請照做並如實記錄。全程不要偽造任何輸出，卡住就照實停下來回報。

## 步驟 1：建立 scratch 環境
同 Q3 步驟 1（只放 `src/normalize-name.mjs`，不預放 search.mjs／測試）。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 可執行，否則停止回報。

## 步驟 3：執行 /agent-work-team
需求文字**逐字**貼：

「搜尋應支援名稱中間的文字」

若 BA 問到匹配語意，明確回答：「只要查詢字串出現在名字任何位置就要能找到，不限開頭。」確保最終確認的需求摘要／AC 正確反映 substring 語意——這一步**不要**注入任何錯誤，BA 這階段必須是正確的。

## 步驟 4：注入設定（只動 spec，不動 BA 產出）
Plan/SA/SD 產出 `plan-spec.json` 後，**在核准前**：
1. 存下最外層／該 task 的 `acceptance_criteria` 原文（此時應該正確寫著 substring／不限開頭）。
2. 用 Edit 把這段 AC 改成：「查詢字串比對名字開頭（prefix match）」，模擬 spec 撰寫錯誤（打錯字或理解錯誤）。
3. **不要**回頭修改 `ba-requirement.json`——它必須保持原本正確的 substring 內容，這是這個案例的關鍵：BA 是對的，只有 spec 寫錯。
4. 存 `setup-diff.txt`（含改前的正確原文與改後的錯誤內容，並註明「ba-requirement.json 未被修改」）。

## 步驟 5：核准並執行 Development
- commit_mode 選 `per_task`。
- approve 核准 Spec（核准的是你已經注入錯誤後的版本）。
- 執行 `/agent-work-team-develop`。真正的 Developer 會依（錯誤的）AC 實作；真正的 Reviewer 會審查這個 task。**你不要介入或提示任何 agent，也不要提示 Reviewer 去對照原始需求。**
- 不論 Reviewer 給 Approved 還是 Needs fixes 都如實記錄，不要自己判斷「應該」是什麼結果。

## 步驟 6：收集證據
建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：完整記錄，含步驟 4 的注入操作，特別標明 BA 階段是在注入**之前**確認完成的。
- `ba-requirement.json`（未被修改的正確版本）。
- `plan-spec.json`（含你注入的錯誤 AC）、`plan-spec.md`。
- 這個 task 的 `dev/T{n}-report.json`、`dev/T{n}-review.json`。
- `setup-diff.txt`。
- `meta.json`：同 Q1 格式，`case_id` 改 `"Q5"`。

完成後回報資料夾路徑、`meta.json` 摘要，並明確說 Reviewer 的 verdict、以及它的審查依據看起來是只比對 spec，還是有回頭對照 BA／原始需求。
````

---

## Q6：純錯字修正，Knowledge 是否硬造新筆記

````text
RUN_LABEL: Q6-before-1   ← 每次重跑改成 Q6-before-2 / Q6-before-3

你正在執行一次 ai-agent-dev-platform plugin 的品質基準測試（fixture run），不是真實產品需求。這個案例不需要任何注入，全程自然執行即可。全程不要偽造任何輸出，卡住就照實停下來回報。

## 步驟 1：建立 scratch 環境
建立 scratch 資料夾，`git init`（假 identity）：
1. 建立 `README.md`，內容包含一個故意的拼字錯誤，例如：
   ```markdown
   # Demo Project

   Users can recieve notifications from this service.
````
2. 建立 `.agent-work-team/wiki/Rules/style.md`，內容一字不改（模擬 wiki 已有相關規則）：
   ```markdown
   # 文字風格規則

   - 文件與程式註解使用正確拼字，避免常見英文拼字錯誤（如 receive、separate、occurred）。
   - 修正既有拼字錯誤時，不需要另立筆記記錄；若對應章節已存在，更新其最後確認日期即可。
   - Request Hub／Index 頁面需持續反映目前所有需求的最新狀態，這是允許的例行更新，不算新主題筆記。
   ```
3. `git add -A && git commit -m "fixture: initial project with typo and existing wiki rule"`。

## 步驟 2：確認 plugin 可用
確認 `/agent-work-team` 可執行，否則停止回報。

## 步驟 3：執行完整流程到 DEV_APPROVED
執行 `/agent-work-team`，需求文字**逐字**貼：

「README 裡 'recieve' 拼字錯誤，請修正為 'receive'」

BA／Plan／Development 全部自然執行、不注入任何內容：
- commit_mode 選 `per_task`。
- Spec 核准時直接 approve。
- 執行 `/agent-work-team-develop`，讓真正的 Developer／Reviewer 完成這個（應該很小的）task 與最終審查。
- 最終審查通過待核准時，直接 approve，推進到 `DEV_APPROVED`。

## 步驟 4：執行 Knowledge 階段
執行 `/agent-work-team-knowledge`，讓真正的 Knowledge agent 整理這次需求。產出待核准時，直接 approve，推進到 `DONE`。

## 步驟 5：收集證據
建立 `quality-eval-output/{RUN_LABEL}/`，放：
- `transcript.md`：完整記錄。
- `plan-spec.json`、`dev/` 底下這個 task 的 report／review、`dev/final-review.json`。
- `knowledge/knowledge-report.json`、`knowledge/knowledge-report.md`。
- `git diff` 或檔案列表：這次 Knowledge 階段實際新增／修改了 `.agent-work-team/wiki/` 底下哪些檔案（含新建筆記的完整內容，若有）。
- `meta.json`：同 Q1 格式，`case_id` 改 `"Q6"`。

完成後回報資料夾路徑、`meta.json` 摘要，並明確說 wiki 底下有沒有新增看起來像「新知識主題筆記」的檔案（不含 Request Hub／Index 這類必要維護的清單頁）。
```
