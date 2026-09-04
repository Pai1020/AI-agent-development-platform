# 共用開發規範

本檔是本 repo **所有 AI agent 與人類貢獻者**的共用規範單一真實來源。Codex 會自動載入本檔；`CLAUDE.md` 以 `@AGENTS.md` 匯入本檔後，只補充 Claude Code 專屬內容。

**本檔的容量規則**：只放跨工具、低變動的規範。清單型、隨功能逐月增長的內容（專案現況、spec 清單）一律外移到 `docs/`，本檔只保留必讀指標。不要把現況資訊寫回本檔。

## 開始前的必讀

動手前必須先讀 `docs/project-status.md`——各階段實作到哪、有哪些指令、哪些 spec 已核准、哪些仍是 Draft。**未讀不得聲稱本 repo 的某項功能已實作，也不得依據任何 spec 開始實作。**

## 不變的行為約束

以下三條不隨功能演進而改變，違反會造成實際的行為錯誤：

1. **Draft 不等於已核准。** 標為 Draft／`Proposed` 的 spec 不代表現況，不得當作已存在的行為引用；沒有使用者明確核准，不得自行改成 `Approved`，也不得據此擴大實作範圍。
2. **需求資料不落在本 repo。** 所有需求狀態與階段產出都寫在**使用者專案**的 `.agent-work-team/` 底下。本 repo 不存放任何需求資料，也不得在此產生測試用的需求狀態——請在一個可拋棄的消費端 repo 中演練受影響的指令。
3. **改 hook 前後都要跑測試。** `hooks/` 是本 repo 唯一有自動化測試的部分；`node --test hooks/*.test.mjs` 在修改前與修改後都要執行並通過。

## 目錄慣例

- `commands/<name>.md` — 使用者可用 `/<name>` 觸發的 slash command
- `agents/<name>.md` — 可被 Agent 工具呼叫的 subagent 定義
- `skills/<name>/SKILL.md` — 供 agent 自動判斷是否套用的技能
- `hooks/hooks.json` — hook 註冊表；`hooks/<name>.mjs` 是實作（ESM），測試以 `hooks/<name>.test.mjs` 併放在旁邊
- `.claude-plugin/` — plugin manifest 與本機測試安裝用的 marketplace 定義
- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`、`docs/superpowers/plans/` — 設計文件與實作計畫
- `docs/architecture/` — 跨階段的 living document
- `docs/project-status.md` — 專案現況（必讀，見上）

## 建置、測試與開發指令

沒有編譯或套件安裝步驟。使用 Node.js 21 或相容的現代版本。

- `node --test hooks/*.test.mjs` — 執行所有 hook 單元測試
- `node --test hooks/sync-dashboard.test.mjs` — 只跑單一測試檔

## 程式風格與命名

JavaScript 一律使用 ESM（`.mjs`）：兩空格縮排、分號、單引號、函式用 `camelCase`。可測試的 hook 邏輯優先使用 named export，CLI 行為集中在一個精簡的 `main()` 路徑。command、agent、skill 名稱使用 kebab-case，並保留 `agent-work-team-*` 前綴。Markdown 指令文件要直接、標明所處階段，並明確寫出持久化產出與核准關卡。

## 測試撰寫規範

測試使用 `node:test` 與 `node:assert/strict`，以可觀察的行為命名，並以 `<module>.test.mjs` 與實作併放。路徑比對、格式錯誤的 JSON、狀態轉換、重試上限與檔案系統副作用都要有回歸覆蓋。不強制數字覆蓋率門檻，但所有 hook 測試必須在 review 前全數通過。

## 分支、Commit 與 PR

對本專案的任何調整都要另開分支，不要直接在 `main` 上修改；經開發人員 review／測試通過才 merge 回 `main`。commit 訊息使用精簡的祈使句，可採 Conventional Commit 風格（例如 `docs: clarify resume behavior`），每個 commit 聚焦單一主題。PR 要說明對流程的影響、列出執行過的測試、連結對應的 issue 或 spec；使用者可見行為有變更時附上指令輸出範例。

## 功能範圍與佔位檔

- 新增功能前先確認它屬於哪個階段的範圍；跨階段的功能應拆成獨立的 spec/plan。
- 佔位檔案（`example-*`）在對應的真正功能實作完成後應被取代，而不是保留。

## 架構文件義務

修改 command／agent／hook 的 stage、status、dispatch、resume、retry、approval、artifact 契約，或新增 Controller／state machine／event／schema／validator／action log／Git 副作用管理**之前**，先讀 `docs/architecture/prompt-orchestration-determinism.md`。

完成上述變更時，在同一份工作中更新該 living document 的 metadata、決策狀態、未決問題、implementation mapping 與實際驗證證據，並同步受影響的現況文件（包含 `docs/project-status.md`）。

該文件中的 `Proposed` 不等於已核准（見上方約束 1）。`docs/manual-testing-checklist.md` 已過時，必須忽略，不得作為現況、覆蓋率或驗證證據。
