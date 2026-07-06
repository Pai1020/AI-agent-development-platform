# Agent Work Team — Knowledge Agent 階段 Design

## 背景與目的

`agent-work-team` 的 Planning 階段（止於 `SPEC_APPROVED`，見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`）與 Development 階段（止於 `DEV_APPROVED`，見 `docs/superpowers/specs/2026-07-05-agent-work-team-development-design.md`）都已上線。本次 spec 是第三個 sub-project：把 MVP 文件（`AI_Development_Platform_MVP_v4.md`）裡的 Knowledge Agent 落實成功能，讓一個已核准的 Development 成果能被整理進使用者的 Obsidian 知識庫（wiki），延伸到需求生命週期的終態 `DONE`。

**本次範圍**：Knowledge Agent，從 `DEV_APPROVED` 延伸到 `DONE`。

沒有常駐服務、沒有資料庫，狀態一樣是使用者專案裡的檔案；知識本體則是使用者專案裡的 Obsidian vault（純 Markdown + YAML frontmatter）。

## 狀態機延伸與 Progress 語意

```
... → DEV_APPROVED (100)
    → PENDING_KNOWLEDGE_APPROVAL (100)
    → DONE (100)
```

**`progress` 從 `DEV_APPROVED` 之後凍結在 100，不再繼續往上加。** 開發完成在語意上就是 100%；知識整理是完成後的收尾動作，不是開發進度的一部分。`current_stage`／`status` 負責表達目前收尾到哪一步，`progress` 數字不變——這跟 `BLOCKED` 只改 `status` 不動 `progress` 的既有慣例一致。

這個決定同時直接滿足「保留彈性方便日後在 dev/knowledge 流程前後插入其他 Agent（例如 Deployment Agent、Metrics Agent）」的需求：未來不管插入幾個新階段，全部停在 `progress: 100`，只需要新增一個 `current_stage` 字串值跟一支新 command，不需要重新調整任何已上線階段的數字。

**`current_stage` 值**：
- `DEV_APPROVED`：Development 完成，Knowledge Agent 還沒跑（或跑到一半失敗、`status` 是 `Blocked`）。
- `PENDING_KNOWLEDGE_APPROVAL`：Knowledge Agent 已產出報告，等待人類確認 wiki 內容。
- `DONE`：人類確認後的終態，需求生命週期結束。

## 新入口 Command：`/agent-work-team-knowledge <RQ-ID>`

沒有逐 task 迴圈、沒有自動 Reviewer，只有一次性 dispatch + 人類審核，因此不需要 Development 階段那套 `fix_rounds`/`needs_context_rounds` 計數器機制——每一輪都已經由人類把關。

1. 若省略 `<RQ-ID>`，用 Glob 掃描 `.agent-work-team/requests/*/state.json`，挑 `current_stage` 為 `"DEV_APPROVED"` 或 `"PENDING_KNOWLEDGE_APPROVAL"` 且 `updated` 最新的一個。
2. 用 Read 讀取 `state.json`，依 `current_stage` 判斷：
   - `"DEV_APPROVED"`：**全新開始**（不管 `status` 現在是不是 `"Blocked"`——若是，代表上次 dispatch 失敗過，這次重新執行就是要重試，把 `status` 清回 `"Running"`、`waiting_on` 清回 `null` 後照常 dispatch）。
   - `"PENDING_KNOWLEDGE_APPROVAL"`：**恢復執行**——不重新 dispatch，直接跳到 Human Approval Gate，重新提示使用者去看 `knowledge-report.md`。
   - `"DONE"`：告訴使用者這個需求已經完成，沒有需要恢復的，停止。
   - 其他值（還在 Planning／Development 階段）：告訴使用者這個需求還沒開發完成（目前實際的 `current_stage` 是什麼），停止。
3. 全新開始：用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-knowledge"`，`model: sonnet`），提供 `request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）。
4. Subagent 回報：
   - `DONE` / `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_KNOWLEDGE_APPROVAL"`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`updated` 改成今天日期。
   - `NEEDS_CONTEXT` / `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`（`current_stage` 維持 `"DEV_APPROVED"` 不變），把具體原因告訴使用者，停止。使用者釐清問題後重新執行本指令即可重試（回到第 2 點的「全新開始」分支，清掉 Blocked 痕跡）。
5. **Human Approval Gate**：
   - 明確告訴使用者：「Knowledge 已整理，請開啟 `.agent-work-team/requests/{request_id}/knowledge/knowledge-report.md` 確認新增/更新的筆記，也可以直接打開 wiki 裡對應的筆記檔案確認，回覆 approve 或提出修改意見」。一定要請使用者去看實際檔案。
   - **approve**（或同義詞）：用 Write 更新 `state.json`：`current_stage: "DONE"`，`status: "Completed"`，`waiting_on: null`，`updated` 改成今天日期。告訴使用者這個需求的生命週期已經完成。
   - 提出修改意見：把意見交給 `agent-work-team-knowledge` 重新處理（同一個 request，不重建任何檔案），修完回到第 5 點重新走一次審核。

## Wiki 位置解析

Subagent 執行時，先用 Read 讀取使用者專案根目錄的 `CLAUDE.md`（若存在），檢查裡面有沒有指定 wiki／Obsidian vault 路徑的說明。有的話用那個路徑；沒有的話預設用 `.agent-work-team/wiki/`（跟 `.agent-work-team/requests/` 同一層，一樣是純檔案、活在使用者專案裡，不是這個 plugin repo 自己存放）。

## Wiki 目錄結構

```
.agent-work-team/wiki/
├── Requests/
│   ├── _Index.md              # 自動維護的需求索引，同一套 dashboard.md 的做法
│   └── RQ-001 - Login API.md  # 每個需求一篇 Hub 筆記
├── Decisions/                 # Decision
├── Architecture/              # Architecture
├── Lessons Learned/           # Lessons Learned
├── Rules/                     # New Rule
├── Common Solutions/          # Common Solution
└── Shared/                    # 跨類別抽取出來的共用知識
```

## 筆記命名與 Frontmatter

**主題筆記**（`Decisions/`、`Architecture/`、`Lessons Learned/`、`Rules/`、`Common Solutions/`、`Shared/`）以主題命名，**不含 RQ-ID**（例如 `Decisions/為什麼登入採用 JWT 而非 Session.md`）——因為同一篇筆記未來可能被多個不同需求更新/延伸，筆記的身分是主題本身，不是某一次需求。

**Hub 筆記**（`Requests/`）以 `{RQ-ID} - {需求名稱}.md` 命名（例如 `Requests/RQ-001 - Login API.md`），因為它的身分就是這個需求本身，帶編號也方便資料夾檢視時照編號排序。

**Frontmatter（YAML）**，主題筆記：

```yaml
---
type: decision            # decision | architecture | lesson-learned | rule | common-solution | shared
tags: [agent-work-team, jwt, auth]
source_requests: ["RQ-001"]
created: 2026-07-07
updated: 2026-07-07
---
```

`source_requests` 是陣列，筆記被後續需求更新時用 Write 把新的 RQ-ID **附加**進去（不覆蓋既有值），`updated` 改成當次日期，`created` 只在第一次建立時寫入、之後不變。

**Hub 筆記** frontmatter：

```yaml
---
type: request-hub
tags: [agent-work-team]
request_id: "RQ-001"
created: 2026-07-07
---
```

## 既有內容搜尋與新增/更新判斷

Knowledge Agent 從這次需求的所有既有產出（`pm-triage.json`、`ba-requirement.json`、`plan-spec.json` 的 `technical_design`、每個 task 的 `dev/T{n}-report.json`、`dev/T{n}-review.json`、`dev/final-review.json`）萃取候選知識，逐一判斷屬於 Decision／Architecture／Lessons Learned／New Rule／Common Solution 哪一類（不強求五類都要有內容，依這次需求實際產出的內容判斷）。

對每一則候選知識：

1. 用 Grep/Glob 在**整個** `wiki/` 底下搜尋主題相關的既有筆記（不只是同類別資料夾，因為相關內容可能被歸在別的分類）。
2. 找到明顯是同一主題的既有筆記 → **優先更新它**（append 新的一段內容、`source_requests` 附加這次 RQ-ID、`updated` 改成今天），不建立重複的新筆記。
3. 找到內容有明確重疊、但主題不同的既有筆記 → 把共用部分抽到 `Shared/` 底下的新筆記，原本兩篇都改成簡短說明 + `[[wikilink]]` 引用該共用筆記，不使用 embed（`![[...]]`）搬移全文。**只在明確重疊時才抽取**，不確定時寧可保留各自獨立的內容，避免過度重構既有筆記。
4. 都沒有相關內容 → 在對應分類資料夾建立新筆記，帶上完整 frontmatter。

## 筆記關聯結構（讓脈絡可被追蹤、Obsidian 圖譜可見）

- **每篇被新建/更新的主題筆記，結尾都要有一個 `## 相關` 區塊**：列出跟這篇主題有關、但沒有實質內容重疊的其他既有筆記（`[[wikilink]]`），不只是共用知識抽取時才連結。這是判斷「主題相關」的額外一步，跟第 3 點「內容重疊」是兩件不同的事——重疊觸發抽取共用筆記，相關但不重疊只建立連結。
- **每個需求都建立/更新一篇 Hub 筆記**（`Requests/{RQ-ID} - {需求名稱}.md`）：內容是這次需求的簡介，加一份清單用 `[[wikilink]]` 連到這次新建/更新過的所有知識筆記。之後想知道「這個需求當初整理了哪些知識」，打開這篇就能順著連結讀下去。
- **維護 `Requests/_Index.md`**：每次跑完，用 Write 加一行「需求編號、標題、日期、一句話摘要、連到 Hub 筆記」，作為需求量變多時的總覽入口，不用到資料夾裡翻——跟 `.agent-work-team/dashboard.md` 同一套自動重建摘要索引的做法。
- Obsidian 的 Backlinks 跟 Graph View 是根據筆記之間的正向連結自動算出來的，只要上述連結都確實建立，不需要額外機制就能在 Obsidian 裡看到完整的知識網路。

## Git 行為

Knowledge Agent 完成所有 wiki 檔案變更後，用 Bash 在**目前所在的分支**（不額外建立新分支）執行 `git add` + `git commit`，commit message 要標明這是知識整理（例如 `"[Knowledge] RQ-001 整理登入 API 相關知識"`），不是程式碼變更。

## 新 Subagent：`agent-work-team-knowledge`

**Tools**：Read, Write, Edit, Bash, Glob, Grep

**輸入**：`request_id`、`output_dir`（`.agent-work-team/requests/{request_id}`）。

**工作**：
1. 讀取這次需求的所有既有產出，萃取候選知識並分類。
2. 依「既有內容搜尋與新增/更新判斷」規則，逐一處理每則候選知識（更新既有筆記／建立新筆記／抽取共用筆記）。
3. 依「筆記關聯結構」規則，補上每篇筆記的 `## 相關` 區塊、建立/更新 Hub 筆記、更新 `Requests/_Index.md`。
4. 用 Bash commit 所有 wiki 變更（見「Git 行為」）。
5. 用 Write 建立 `{output_dir}/knowledge/knowledge-report.json`／`.md`：

```json
{
  "request_id": "RQ-001",
  "notes_created": [{"path": "Decisions/為什麼登入採用 JWT 而非 Session.md", "type": "decision"}],
  "notes_updated": [{"path": "Architecture/認證模組架構.md", "type": "architecture", "what_changed": "補充這次需求新增的 middleware"}],
  "shared_notes_extracted": [{"path": "Shared/JWT 驗簽流程.md", "extracted_from": ["Decisions/....md", "Architecture/....md"]}],
  "hub_note": "Requests/RQ-001 - Login API.md",
  "commit": "<commit sha>",
  "concerns": null
}
```

`.md` 版本用人類可讀的方式呈現同樣內容，開頭列出這次動了哪些筆記，方便使用者知道要打開哪幾個檔案審核。

**回報格式**：
- **Status:** `DONE` | `DONE_WITH_CONCERNS` | `BLOCKED` | `NEEDS_CONTEXT`
- 若 `DONE`/`DONE_WITH_CONCERNS`：commit sha、一行摘要（動了幾篇筆記、新建幾篇、更新幾篇）
- 若 `NEEDS_CONTEXT`/`BLOCKED`：具體說明原因（例如這次需求的產出內容太模糊、無法判斷該歸類到哪個知識類別；或 wiki 路徑衝突、無法寫入）
- 報告檔案路徑

**什麼時候該停下來**：若這次需求的既有產出（`plan-spec.json`、`dev/` 底下的報告）內容太模糊或矛盾，判斷不出該萃取什麼知識、或歸類到哪一類，回報 `NEEDS_CONTEXT`，具體說明需要什麼澄清；若 wiki 路徑本身有問題（例如指定的路徑不存在、無法寫入），回報 `BLOCKED`。

## 延展性

- `current_stage` 只是一串有序字串，`progress` 全部停在 100，未來要在 `DEV_APPROVED` 之後、`DONE` 之前插入其他 Agent（Deployment、Metrics…），只是新增一個 `current_stage` 值跟一支新 command，不需要重新調整任何數字或動到既有階段的邏輯。
- 知識分類目前是 MVP 文件定義的五類（Decision／Architecture／Lessons Learned／New Rule／Common Solution），`type` frontmatter 欄位是開放字串，未來要新增類別（例如 Performance、Security）只需要在 subagent 的分類邏輯裡加一類、在 wiki 底下加一個對應資料夾，不影響既有筆記或既有邏輯。

## Out of scope

- Validation Layer、多 Methodology、（未來）Agent Dashboard（MVP 文件第八、十一節）
- 對既有 wiki 筆記做大規模自動重構/整併（只在「明確重疊」時才抽取共用知識）
- 非 Obsidian 格式的知識庫輸出
- 在 `DEV_APPROVED` 之後、`DONE` 之前插入其他 Agent（Deployment、Metrics…）——本次只確保架構上容易擴充，不實作任何新 Agent

## 驗證方式

在測試專案裡，先跑完一個需求到 `DEV_APPROVED`，再驗證：

1. 執行 `/agent-work-team-knowledge`（不帶 ID），確認正確找到該需求，`state.json` 前進到 `PENDING_KNOWLEDGE_APPROVAL`，`progress` 仍是 100。
2. 確認 `.agent-work-team/wiki/` 依規則建立，`Decisions/`／`Architecture/`／`Lessons Learned/`／`Rules/`／`Common Solutions/` 底下有依這次需求實際內容產生的筆記，frontmatter 格式正確。
3. 確認 `Requests/RQ-{id} - {需求名稱}.md` Hub 筆記存在，連到這次所有新建/更新的筆記；`Requests/_Index.md` 有新增這次需求的一行。
4. 打開任一篇主題筆記，確認結尾有 `## 相關` 區塊，且連結的筆記確實主題相關。
5. 手動在 wiki 裡先塞一篇跟這次需求主題明顯重複的既有筆記，重新執行一次，確認 Knowledge Agent 選擇更新既有筆記而不是建立重複筆記。
6. 手動塞兩篇跟這次需求都有部分重疊、但主題不同的既有筆記，確認 Knowledge Agent 抽出 `Shared/` 共用筆記，兩篇原筆記改成簡短說明 + `[[wikilink]]`。
7. 確認所有 wiki 變更被 commit 在目前分支上，commit message 標明是知識整理。
8. 回覆 approve，確認 `state.json` 變成 `DONE`。
9. 對已經是 `PENDING_KNOWLEDGE_APPROVAL` 的需求重新執行 `/agent-work-team-knowledge {RQ-ID}`，確認直接跳到 Human Approval Gate，不重新 dispatch。
10. 用 Obsidian 打開這個 vault，確認 Graph View 能看到這些筆記之間的連結關係，Backlinks 面板也能看到反向連結。
