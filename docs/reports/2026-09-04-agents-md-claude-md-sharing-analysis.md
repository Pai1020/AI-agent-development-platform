---
title: AGENTS.md 與 CLAUDE.md 內容共用可行性分析（合併版）
document_type: analysis-report
status: 分析報告；未執行任何調整（AGENTS.md／CLAUDE.md 內容均維持原狀）
created: 2026-09-04
updated: 2026-09-04
note: 本檔已合併同日產出的另一份分析（原 docs/reports/2026-09-04-claude-agents-shared-content-analysis.md），為此主題的唯一報告
---

# AGENTS.md 與 CLAUDE.md 內容共用可行性分析（合併版）

## 0. 一句話結論

**「用軟連結共用部分內容」在本 repo 目前的環境下做不到**——技術上軟連結只能整檔共用（無法只連結某幾個章節），而這台機器的 Git 與 shell 都不支援真實 symlink（實測見 §2）。實際可行的是「**單一真實來源 + 指標檔**」：把兩份文件重疊的主題收斂到 `CLAUDE.md`，讓 `AGENTS.md` 變成薄薄一頁指向它。兩份獨立產出的分析在這個結論上一致。

---

## 1. 兩份文件的現況（分析當下）

| 檔案 | 狀態 | 行數 | 語言 | 章節 |
|---|---|---|---|---|
| `CLAUDE.md` | 已追蹤（`365250a` 剛更新） | 42 | 中文 | 目前狀態／目錄慣例／開發規範／Prompt 編排確定性協作 |
| `AGENTS.md` | **未追蹤**（`git status` 顯示 `??`） | 32 | 英文 | Project Structure／Build,Test,Dev Commands／Coding Style／Testing Guidelines／Commit & PR／Architecture Documentation |

檔名確認為複數形式 `AGENTS.md`（非 `AGENT.md`）。

第三個相關檔案是 `README.md`，它也重複了安裝指令、`.agent-work-team/` 位置說明與分支規則（`README.md:80` 已經寫「見 `CLAUDE.md`」——**repo 內已有「指標而非複製」的既有做法**）。

---

## 2. 為什麼「部分內容用軟連結共用」不可行

三個各自獨立的阻礙，任一個都足以否定這個做法：

1. **軟連結的粒度是「檔案」，不是「章節」。**
   symlink 只能讓 `AGENTS.md` 整份等於另一個檔案。要共用「其中幾段」，需要的是 include／import 機制，不是 symlink。Markdown 本身也沒有原生的章節引入語法。

2. **這台機器的 Git 會把 symlink 還原成純文字檔。**
   實測：
   ```
   git config --local  core.symlinks  → false
   git config --system core.symlinks  → false
   ```
   repo 內也沒有任何已追蹤的軟連結或相關 `.gitattributes` 設定。在 `core.symlinks=false` 之下，被 commit 的 symlink（mode `120000`）在 checkout 時會變成一個「內容是目標路徑字串」的普通檔案——`AGENTS.md` 的實際內容會變成一行 `CLAUDE.md`，任何讀它的 agent 都拿不到規則。

3. **Git Bash 的 `ln -s` 只是複製。**
   實測在 scratchpad 建立 `ln -s target.txt link.md`，結果是一個 `-rw-r--r--` 的**普通檔案**（內容被複製），不是連結。連「本機自己手動建連結」都需要先開 Windows 開發者模式並設定 `MSYS=winsymlinks:nativestrict`，而且只對這台機器有效——clone 這個 repo 的其他人（含 CI）不會自動有相同設定。若真要走這條路，等於要把 `core.symlinks=true` 與 Windows Developer Mode 寫進 contributor prerequisites。

**補充：Claude Code 的 `@path` import 也救不了這件事。** `CLAUDE.md` 可以用 `@docs/xxx.md` 把片段拉進來，但 `AGENTS.md` 是給其他 agent 工具讀的、沒有 import 展開機制，共用片段對它等於不存在。所以任何「片段共用」的方案都只會單邊生效；也因此，任何被移出入口文件的**強制性**內容，必須在入口文件明確寫「你必須去讀它」，不能只放一個普通 Markdown 連結就期待 agent 會自動載入。

---

## 3. 內容重疊盤點

| # | 主題 | AGENTS.md | CLAUDE.md | 關係 | 可共用性 |
|---|---|---|---|---|---|
| 1 | 目錄結構 / 檔案放哪 / runtime 資料邊界 | §Project Structure（L5） | 開頭 + §目前狀態 + §目錄慣例（L23–29） | 同一組事實，兩種寫法 | **高**——近乎重複，應只留一份 |
| 2 | 測試與安裝指令、hook 測試位置 | §Build, Test and Dev Commands（L9–16）、§Testing Guidelines | 只有 L26 提到 `node --test hooks/*.test.mjs` | AGENTS.md 較完整；安裝指令又和 `README.md` 重複 | **高**——目前三份文件各寫一次 |
| 3 | 程式碼風格 / 命名 | §Coding Style（L20） | 無 | CLAUDE.md 缺這塊 | **高**——工具無關，但屬「提升為共通規範」而非既有重複 |
| 4 | 測試撰寫規範 | §Testing Guidelines（L24） | 無 | CLAUDE.md 缺這塊 | **高**（同上） |
| 5 | 分支 / commit / PR 規則 | §Commit & PR（L28） | §開發規範第 3 點（L35） | 分支規則兩邊都寫，幾乎重複；commit 風格與 PR 要求只有 AGENTS.md 有 | **高**——重複且不對稱 |
| 6 | 架構文件前置閱讀義務 | §Architecture Documentation（L32） | §Prompt 編排確定性協作（L39–42） | AGENTS.md 是**有損子集** | **高，且風險最高**（見 §4） |
| 6b | `docs/manual-testing-checklist.md` 已過時 | §Architecture Documentation | §Prompt 編排確定性協作 | 完全一致 | **高**——可直接共用 |
| 7 | 專案目前狀態（各階段已實作什麼、Draft/已核准分類） | 無 | §目前狀態（L7–19，13 條） | 只有 CLAUDE.md 有 | **中**——對任何 agent 都有用，但變動最快；可考慮抽成 `docs/project-status.md`，但「已實作 vs Draft 未核准」是關鍵操作上下文，抽出後入口必須強制要求讀取 |
| 8 | Planning 範圍判斷、`example-*` 佔位檔規則 | 無 | §開發規範 L33–34 | 只有 CLAUDE.md 有 | **中**——是否提升為所有 agent 的共通規範需另行決定 |

**沒有任何一段是「只有 Claude Code 才適用、不能給其他 agent 看」的。** 兩份文件描述的是同一個 repo 的同一組事實，差別只在語言與詳略——這正是「應該共用」的訊號，也代表分成兩份的唯一實質理由是**語言**。

---

## 4. 最該優先處理的一筆：#6 架構文件規則已經漂移

`AGENTS.md:32`（原版）只寫了「改 orchestration 前要讀並更新 `docs/architecture/prompt-orchestration-determinism.md`」，但漏掉 `CLAUDE.md:41` 的這條授權限制：

> 該文件中的 `Proposed` 不等於已核准；沒有使用者明確核准，不得自行改成 `Approved` 或據此擴大實作範圍。

也就是說，**只讀 `AGENTS.md` 的 agent 會少掉一條防止它自行擴大實作範圍的約束**。這不是排版問題，是行為差異；而且它剛好落在 repo 內最敏感的區域（DET-Q9 等 Draft spec 正處於「已設計、未核准」狀態）。這是「兩份文件各自漂移」已經真實發生過的證據，也是選擇「不重複、只留指標」而非「兩邊各寫一份」的主要理由。

---

## 5. 可選方案比較

| 方案 | 做法 | 可行性 | 優點 | 缺點 |
|---|---|---|---|---|
| **A. 整檔 symlink**<br>`AGENTS.md` / `CLAUDE.md` → `docs/agent-instructions.md` | 兩個入口內容完全相同 | ❌ 本機不可行（§2） | 零重複 | Windows/git 環境還原成文字檔；兩入口無法保留各自專屬段落；需 Git client／CI／agent loader 全數支援；且必須放棄中英分流 |
| **B. 指標檔（建議）** | `AGENTS.md` 縮成數行指向 `CLAUDE.md`，本身不放規則 | ✅ 立即可做 | 零工具依賴、跨平台、單一真實來源、與 `README.md:80` 既有做法一致 | 依賴讀 `AGENTS.md` 的 agent 願意跟著開 `CLAUDE.md`（故指標必須寫成「必讀」而非普通連結） |
| **B'. 抽出第三方共用檔** | 新增 `docs/agent-instructions.md` 收共通規範，兩入口都指過去 | ✅ 可做 | 章節層級單一來源；入口可各留專屬段落 | 多一層跳轉；仍是「兩個指標」而非真共用 |
| **C. 產生式（build）** | 用 partial 檔 + 腳本組出兩份入口，CI 驗證未漂移 | ✅ 可做 | 真正的片段共用、可自動驗證、能同時保留差異 | 對一個只有 32+42 行的規範檔明顯過重 |

兩份分析都建議 **B**（而非 A）：集中維護、不受 Windows symlink 設定影響。待未來確定所有開發環境／Git client／CI／agent loader 都支援 symlink，再評估 A。

---

## 6. 執行前需要決定的事

1. **語言**：合併後的單一真實來源用中文（跟 `CLAUDE.md`／`README.md` 一致）還是英文？這是 A 方案唯一真正的代價，也是 B 方案要不要保留英文摘要的關鍵。
2. **`AGENTS.md` 要不要進版控**：分析當下它未追蹤。若採 B，它必須被 commit，否則其他 clone 的人根本沒有這個入口。
3. **`README.md` 的重複要不要一起收**：安裝指令同時出現在 `README.md` 與 `AGENTS.md`；`README.md` 面向使用者、`CLAUDE.md` 面向貢獻者，可以刻意保留一份重複，但要指定哪一份是準的。
4. **§3 #7 的「目前狀態」是否要抽成 `docs/project-status.md`**，以及抽出後如何確保其他 agent 一定會讀到。
5. **§3 #3、#4、#8 是否提升為所有 agent 的共通規範**（原本只約束單邊）。

---

## 7. 建議的執行順序（尚未執行）

本報告只做分析，**`AGENTS.md` 與 `CLAUDE.md` 的內容均未調整**。若日後決定採行方案 B，建議順序如下：

1. 把 `AGENTS.md` 獨有且工具無關的內容（安裝／測試指令、程式碼風格、測試規範、commit/PR 規則）併入單一真實來源，語言依 §6 決定 1 先拍板。
2. 讓另一個入口縮成純指標檔，本身不保留任何規則，並在檔內寫明「必讀」而非普通連結（理由見 §2 補充與 §4）。
3. 把該入口檔納入版控（§6 決定 2）。
4. 在單一真實來源的目錄慣例中記錄這個指標安排，避免日後有人再往指標檔補規則。

§6 的決定 3（README 重複）、決定 4（抽出 `docs/project-status.md`）、決定 5（#8 是否升為共通規範）需個別拍板，不隨方案 B 一起執行。

## 8. 一個容易混淆的點

`CLAUDE.md` 提到 Knowledge Agent 會讀「`CLAUDE.md` 指定的 wiki 路徑」——那指的是**使用者專案**的 `CLAUDE.md`，跟本 repo 這份無關。因此上述任何調整（包含把 `CLAUDE.md` 內容搬動或讓 `AGENTS.md` 指過來）**不會**影響 Knowledge 階段的行為。
