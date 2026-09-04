---
title: AGENTS.md 與 CLAUDE.md 內容共用可行性分析（合併版）
document_type: analysis-report
status: 分析報告；方案與 §6 五項決定已於 2026-09-04 由使用者拍板，實作尚未執行（AGENTS.md／CLAUDE.md 內容仍維持原狀）
created: 2026-09-04
updated: 2026-09-04
note: 本檔已合併同日產出的另一份分析（原 docs/reports/2026-09-04-claude-agents-shared-content-analysis.md），為此主題的唯一報告
---

# AGENTS.md 與 CLAUDE.md 內容共用可行性分析（合併版）

## 0. 一句話結論

**「用軟連結共用部分內容」不可行，而整檔 symlink 在本 repo 目前的設定及跨環境協作下不可靠**——symlink 只能整檔共用，且目前 Windows／Git 設定不會可靠保留真實連結（實測見 §2）。最可靠的替代方案是把共用規範集中在 `AGENTS.md`，再由 `CLAUDE.md` 使用 Claude Code 原生的 `@AGENTS.md` 語法匯入；這能保留兩個工具各自的入口與 Claude 專屬補充，也不依賴 symlink。

---

## 1. 兩份文件的現況（分析當下）

| 檔案 | 狀態 | 行數 | 語言 | 章節 |
|---|---|---|---|---|
| `CLAUDE.md` | 已追蹤；目前最後異動為 revert commit `c481704` | 42 | 中文 | 目前狀態／目錄慣例／開發規範／Prompt 編排確定性協作 |
| `AGENTS.md` | **未追蹤**（`git status` 顯示 `??`） | 32 | 英文 | Project Structure／Build,Test,Dev Commands／Coding Style／Testing Guidelines／Commit & PR／Architecture Documentation |

檔名確認為複數形式 `AGENTS.md`（非 `AGENT.md`）。

第三個相關檔案是 `README.md`，它也重複了安裝指令、`.agent-work-team/` 位置說明與分支規則（`README.md:80` 已經寫「見 `CLAUDE.md`」——**repo 內已有「指標而非複製」的既有做法**）。

補充歷史：`365250a` 更新了 `CLAUDE.md` 的現況內容；其後 `1b83eb4` 曾實作「讓 `AGENTS.md` 指向 `CLAUDE.md`」的整併，再由 `c481704` revert。因此本報告以 revert 後的目前工作樹為分析基準，不把該次整併視為現況。

---

## 2. 為什麼部分 symlink 不可行、整檔 symlink 不可靠

以下限制共同使 symlink 不適合作為本 repo 的預設協作方案：

1. **軟連結的粒度是「檔案」，不是「章節」。**
   symlink 只能讓 `AGENTS.md` 整份等於另一個檔案。要共用「其中幾段」，需要的是 include／import 機制，不是 symlink。Markdown 本身也沒有原生的章節引入語法。

2. **目前 Git 設定不會可靠 checkout symlink。**
   實測：
   ```
   git config --local  core.symlinks  → false
   git config --system core.symlinks  → false
   git config --global core.symlinks  →（未設定）
   git config core.symlinks           → false
   ```
   repo 內也沒有任何已追蹤的軟連結或相關 `.gitattributes` 設定。在 `core.symlinks=false` 之下，被 commit 的 symlink（mode `120000`）在 checkout 時會變成一個「內容是目標路徑字串」的普通檔案——`AGENTS.md` 的實際內容會變成一行 `CLAUDE.md`，任何讀它的 agent 都拿不到規則。

3. **目前 Git Bash 設定下，`ln -s` 只產生普通檔案。**
   實測在 scratchpad 建立 `ln -s target.txt link.md`，結果是一個 `-rw-r--r--` 的**普通檔案**（內容被複製），不是連結。連「本機自己手動建連結」都需要先開 Windows 開發者模式並設定 `MSYS=winsymlinks:nativestrict`，而且只對這台機器有效——clone 這個 repo 的其他人（含 CI）不會自動有相同設定。若真要走這條路，等於要把 `core.symlinks=true` 與 Windows Developer Mode 寫進 contributor prerequisites。

4. **官方文件也把 Windows import 視為較穩健的選擇。**
   Claude Code 官方列出 `ln -s AGENTS.md CLAUDE.md`，但同時註明 Windows 建立 symlink 需要 Administrator 權限或 Developer Mode，並建議改用 `@AGENTS.md` import。這直接支持本報告不以 symlink 作為預設方案；不是宣稱 Windows 或 Git 永遠無法支援 symlink。

**補充：Claude Code 的 `@path` import 可以解決一半問題，而且官方明確建議用它匯入 `AGENTS.md`。** Claude Code 會在啟動時展開 `CLAUDE.md` 中的 `@path/to/file`；Codex 則會自動發現並載入 `AGENTS.md`，但 OpenAI 官方文件未記載相同的 Markdown import 語法。因此，若 `AGENTS.md` 本身就是共用來源，兩邊都能原生載入；若另建第三方文件，`CLAUDE.md` 可以原生匯入，但 `AGENTS.md` 仍只能用明確指令要求 Codex 另行讀取。普通 Markdown 連結只提供導覽，不應視為自動載入。

---

## 3. 內容重疊盤點

下表將「目前是否重複」與「後續建議動作」分開，避免把重疊程度、重要性和變動速度混在同一評分中。

| # | 主題 | AGENTS.md | CLAUDE.md | 重疊程度 | 建議動作 |
|---|---|---|---|---|---|
| 1 | 目錄結構 / 檔案放哪 / runtime 資料邊界 | §Project Structure（L5） | 開頭 + §目前狀態 + §目錄慣例（L23–29） | 大幅重複 | 收斂為共用規範 |
| 2 | 測試與安裝指令、hook 測試位置 | §Build, Test and Dev Commands（L9–16）、§Testing Guidelines | L26 提到 `node --test hooks/*.test.mjs` | 部分重複 | 共用測試規則；保留必要的 Claude Code 驗證命令並明確標示用途 |
| 3 | 程式碼風格 / 命名 | §Coding Style（L20） | 無 | `AGENTS.md` 獨有 | 提升為共通規範（§6 決定 4）|
| 4 | 測試撰寫規範 | §Testing Guidelines（L24） | 無 | `AGENTS.md` 獨有 | 提升為共通規範（§6 決定 4）|
| 5 | 分支 / commit / PR 規則 | §Commit & PR（L28） | §開發規範第 3 點（L35） | 分支規則重複；其餘為 `AGENTS.md` 獨有 | 收斂分支規則；commit／PR 規則一併移入共用來源 |
| 6 | 架構文件前置閱讀義務 | §Architecture Documentation（L32） | §Prompt 編排確定性協作（L39–42） | 重複但 `AGENTS.md` 是**有損子集** | 以 `CLAUDE.md` 完整版本為搬移基準，收斂至共用來源（見 §4） |
| 6b | `docs/manual-testing-checklist.md` 已過時 | §Architecture Documentation | §Prompt 編排確定性協作 | 完全一致 | 收斂為共用規範 |
| 7 | 專案目前狀態（各階段已實作什麼、Draft/已核准分類） | 無 | §目前狀態（L7–19，13 條） | `CLAUDE.md` 獨有 | 抽至 `docs/project-status.md`，入口標為必讀（§6 決定 3）|
| 8 | Planning 範圍判斷、`example-*` 佔位檔規則 | 無 | §開發規範 L33–34 | `CLAUDE.md` 獨有 | 提升為共通規範（§6 決定 4）|

兩份文件的主要內容確實描述同一個 repo，重複規則適合收斂。不過仍有少量 Claude Code 專屬機制與命令，例如 plugin 安裝指令、skill 自動判斷及 `.claude-plugin/` metadata。這些資訊給其他 agent 看通常無害，且部分仍是跨工具貢獻者需要知道的驗證與架構知識；是否留在共用來源應依「所有貢獻者是否需要」，而不是只依命令由哪個工具執行。分成兩個入口的主要理由是載入機制、受眾詳略與語言，而不只是語言。

---

## 4. 最該優先處理的一筆：#6 架構文件規則已經漂移

`AGENTS.md:32`（原版）把 `CLAUDE.md:39–42` 濃縮成一句，實際漏掉三類內容：

1. **觸發範圍不完整**：缺少 `status`、`artifact` 契約，以及 Controller、state machine、event、validator、action log 等新增物件。
2. **更新義務不完整**：沒有列出 living document 的 metadata、決策狀態、未決問題、implementation mapping、實際驗證證據，以及同步受影響現況文件的要求。
3. **授權限制缺失**：漏掉 `CLAUDE.md:41` 的以下規則：

> 該文件中的 `Proposed` 不等於已核准；沒有使用者明確核准，不得自行改成 `Approved` 或據此擴大實作範圍。

其中第 3 類風險最高：**只讀 `AGENTS.md` 的 agent 可能少掉防止它自行擴大實作範圍的約束**。這不是排版問題，是行為差異；而且它剛好落在 repo 內最敏感的區域（DET-Q9 等 Draft spec 正處於「已設計、未核准」狀態）。三類漏失共同證明兩份規則已真實漂移，進一步強化「共用規範應維持單一來源」的原結論，而不是推翻它。

---

## 5. 可選方案比較

| 方案 | 做法 | 可行性 | 優點 | 缺點 |
|---|---|---|---|---|
| **A. 整檔 symlink**<br>`AGENTS.md` / `CLAUDE.md` → `docs/agent-instructions.md` | 兩個入口內容完全相同 | ⚠️ 技術上可設定，但目前及跨環境不可靠（§2） | 零重複 | Windows/git 環境可能還原成文字檔；兩入口無法保留不同的專屬段落或各自語言版本；需 Git client／CI／agent loader 全數支援 |
| **B. `AGENTS.md` 為共用來源（建議）** | 共用規範放在 `AGENTS.md`；`CLAUDE.md` 以 `@AGENTS.md` 匯入，再追加 Claude 專屬內容 | ✅ 立即可做 | Codex 自動載入 `AGENTS.md`；Claude Code 原生展開 import；跨平台；單一真實來源；仍可保留 Claude 專屬段落 | `AGENTS.md` 必須納入版控；兩邊都需要的現況資訊也要決定是否併入 |
| **B'. 第三方共用檔** | 新增 `docs/agent-instructions.md`；`CLAUDE.md` 用 `@` 匯入，`AGENTS.md` 明確要求先讀取 | ✅ 可做，但載入不對稱 | 共用內容有語意明確的獨立位置；兩入口可各留專屬段落 | Claude 端是原生匯入，Codex 端則依賴 agent 遵循讀檔指令；比 B 多一層跳轉 |
| **C. Claude Code `/import`** | 將 `AGENTS.md` 一次性附加到 `CLAUDE.md` | ⚠️ 可執行但不採用 | 官方工具可自動搬入既有規則 | 產生靜態副本，之後仍會漂移；需要 Claude Code v2.1.213 以上 |
| **D. 產生式（build）** | 用 partial 檔 + 腳本組出兩份入口，CI 驗證未漂移 | ✅ 可做 | 真正的片段共用、可自動驗證、能同時保留差異 | 對一個只有 32+42 行的規範檔明顯過重 |

建議採用 **B**：它使用兩個工具各自正式支援的載入路徑，不受 Windows symlink 設定影響，也不要求 Codex 額外追蹤普通 Markdown 連結。Claude Code 官方對 Windows 使用者的 `@AGENTS.md` 建議，以及 `/import` 只建立一次性副本的特性，都進一步強化方案 B，而不是改變原本方向。待未來確定所有開發環境／Git client／CI／agent loader 都支援 symlink，再評估 A。

---

## 6. 執行前需要決定的事（已拍板）

以下決定於 2026-09-04 由使用者拍板，實作尚未執行。

| # | 決定項 | 結果 |
|---|---|---|
| 0 | 採用方案 | **方案 B**——共用規範集中在 `AGENTS.md`，`CLAUDE.md` 以 `@AGENTS.md` 匯入後只留 Claude Code 專屬內容 |
| 1 | 共用來源語言 | **中文**——與 `CLAUDE.md`／`README.md` 一致；現有英文版 `AGENTS.md` 內容改寫為中文 |
| 2 | `README.md` 的重複 | **保留**——`README.md` 的作用是給使用者看，安裝指令留在原處；共用來源的指令面向貢獻者，本次不動 `README.md` |
| 3 | §3 #7「目前狀態」 | **抽成 `docs/project-status.md`**——共用來源只留穩定規範；入口必須寫明這份是必讀，不能只放普通連結 |
| 4 | §3 #3／#4／#8 | **三項全部提升為共通規範**——程式風格／命名、測試撰寫規範、Planning 範圍判斷與 `example-*` 佔位檔規則，一律移入共用來源 |

`AGENTS.md` 納入版控不是採用方案 B 後仍可選擇的事項，而是必要條件；否則其他 clone 不會取得共用入口。

---

## 7. 建議的執行順序（尚未執行）

截至本次更新，**`AGENTS.md` 與 `CLAUDE.md` 的內容均未調整**。依 §6 拍板結果，執行順序如下：

1. 把 `CLAUDE.md` §目前狀態（L7–19，13 條）抽到 `docs/project-status.md`。
2. 以 `AGENTS.md` 作為共用規範的單一真實來源，改寫為中文，並納入：現有英文版的工具無關內容（目錄結構、測試與安裝指令、程式風格／命名、測試撰寫規範、commit／PR 規則）、`CLAUDE.md` 的完整架構文件義務（§4 三類漏失以 `CLAUDE.md:39–42` 為準）、以及 #3／#4／#8。
3. `AGENTS.md` 內以明確的「必讀」語句指向 `docs/project-status.md`，不使用普通 Markdown 連結。
4. 將 `CLAUDE.md` 改為以 `@AGENTS.md` 開頭，後方只保留 Claude Code 專屬內容（plugin 安裝／驗證指令、skill 自動判斷、`.claude-plugin/` metadata 等）。
5. 將 `AGENTS.md` 納入版控，這是方案 B 的必要條件。
6. 驗證載入行為，並記錄實際證據（見下方驗收條件）。

**驗收條件**（§7 步驟 6 的判準，避免「已驗證」流於宣稱）：

- Claude Code：新 session 啟動後確認 `@AGENTS.md` 已展開，共用規範實際出現在 context 中（非只看到 import 那一行）。
- Codex：確認根目錄 `AGENTS.md` 被自動載入，且其中指向 `docs/project-status.md` 的必讀語句被實際遵循。
- 內容不重複：`AGENTS.md`、`CLAUDE.md`、`docs/project-status.md` 三份之間，同一條規則只出現一次。
- `README.md` 未被本次變更修改。

---

## 8. 一個容易混淆的點

`CLAUDE.md` 提到 Knowledge Agent 會讀「`CLAUDE.md` 指定的 wiki 路徑」——那指的是**使用者專案**的 `CLAUDE.md`，跟本 repo 這份無關。因此上述任何入口整併或 import 調整**不會**影響 Knowledge 階段的行為。

---

## 9. 官方載入行為依據

- [OpenAI Codex：Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)：Codex 會從專案根目錄到目前工作目錄建立 `AGENTS.md` 指令鏈；官方頁面未記載 Markdown `@path` import。
- [Claude Code：How Claude remembers your project](https://code.claude.com/docs/en/memory)：`CLAUDE.md` 可用 `@path/to/import` 匯入文件，並明確建議既有 `AGENTS.md` 的 repository 使用 `@AGENTS.md`，需要時再於其後加入 Claude 專屬規範。該頁也記載 symlink 的 Windows 權限條件，以及 Claude Code v2.1.213 起可用、但只會建立一次性副本的 `/import`。
