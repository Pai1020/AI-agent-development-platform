---
title: 「AGENTS.md 與 CLAUDE.md 內容共用可行性分析（合併版）」審查建議報告
document_type: review-report
status: 建議報告；本次僅新增本檔，未修改 AGENTS.md／CLAUDE.md／原分析報告
created: 2026-09-04
updated: 2026-09-04
target: docs/reports/2026-09-04-agents-md-claude-md-sharing-analysis.md
audience: 負責修訂上述分析報告的 agent
---

# 審查建議報告

## 0. 給執行 agent 的前置說明

- 本報告的**唯一修改對象**是 `docs/reports/2026-09-04-agents-md-claude-md-sharing-analysis.md`。
- **不要**因為本報告而修改 `AGENTS.md`、`CLAUDE.md`、`README.md`。是否採行分析報告中的方案 B，尚未經使用者拍板。
- 原分析報告的**主要結論成立**（symlink 不可行、建議方案 B、§4 的規則漂移屬實）。以下都是精確度、一致性與完整性的修正，不是推翻結論。
- 下方「§X」皆指原分析報告的章節編號。

---

## 1. 已逐項查證、確認正確的事實（請勿更動、勿重新查證）

| 原報告主張 | 查證結果 |
|---|---|
| `CLAUDE.md` 42 行、`AGENTS.md` 32 行 | ✅ |
| `AGENTS.md` 未追蹤（`git status` 顯示 `??`），且未被 gitignore | ✅ |
| `CLAUDE.md` 由 commit `365250a` 更新，且該 commit 只動這一個檔 | ✅ |
| §3 表格所有行號（AGENTS L5／L9–16／L20／L24／L28／L32；CLAUDE L7–19／L23–29／L33–35／L39–42） | ✅ 全部對得上 |
| 「§目前狀態 13 條」 | ✅ L7–L19 恰為 13 條 |
| `core.symlinks` local／system 皆為 `false` | ✅（`--global` 未設定，effective 值為 `false`） |
| repo 內無已追蹤的 symlink（無 mode `120000` 項目）、無 `.gitattributes` | ✅ |
| `README.md:80` 已寫「（見 `CLAUDE.md`）」 | ✅ 該檔共 80 行，指的就是最後一行 |
| 安裝指令同時存在於 `README.md:10–11` 與 `AGENTS.md:13–14` | ✅ |
| §9 兩個官方連結 | ✅ 兩頁皆實際存在。Codex 頁標題確為「Custom instructions with AGENTS.md」且未記載 `@path` import；Claude Code memory 頁確有 `@path` import，並明確建議既有 `AGENTS.md` 的 repo 用 `@AGENTS.md` 匯入、其後再加 Claude 專屬內容 |

---

## 2. 建議修正項（依重要性排序）

### R1（高）§3 結尾的斷言過度絕對，且與 §5 自相矛盾

**位置**：§3 最後一段（原文第 67 行）。

**問題**：
「沒有任何一段是『只有 Claude Code 才適用、不能給其他 agent 看』的」不成立。實際存在工具專屬內容：

- `AGENTS.md:13–14` 的 `/plugin marketplace add`、`/plugin install` 是 Claude Code 專屬 slash command。
- `CLAUDE.md:23`（skills 由 Claude Code 自動判斷是否套用）、`CLAUDE.md:28–29`（`.claude-plugin/plugin.json`、`marketplace.json`）描述的是只有 Claude Code 會消費的機制。

準確的說法是「這些內容給其他 agent 看**無害**」，而不是「不存在工具專屬內容」。

**連帶矛盾**：同段推導出「分成兩份的唯一實質理由是**語言**」，但 §5 方案 B 的優點欄又寫「仍可保留 Claude 專屬段落」——若真的沒有專屬內容，這個優點不存在。

**建議改法**：把該段改寫為兩層敘述——(a) 兩份文件描述同一組事實，重疊部分沒有任何一段「不能給其他 agent 看」；(b) 確實存在少量 Claude Code 專屬操作內容（列出上述行號），但它對其他 agent 只是冗餘而非有害，因此適合放在 `CLAUDE.md` 的 import 之後、而非共用來源中。並把「唯一實質理由是語言」改為「主要理由是語言與受眾詳略」。

---

### R2（高）§4 低估了規則漂移的幅度

**位置**：§4 全節（原文第 71–77 行）。

**問題**：原文寫 `AGENTS.md:32`「只寫了『改 orchestration 前要讀並更新』，但漏掉」`CLAUDE.md:41` 的授權限制。實際比對 `AGENTS.md:32` 與 `CLAUDE.md:39–42`，漏掉的不只一條：

1. `CLAUDE.md:39` 觸發清單中的 `status`、`artifact 契約`，以及「新增 Controller／state machine／event／schema／validator／action log／Git 副作用管理」中的 Controller、state machine、event、validator、action log 等物件（AGENTS.md 只涵蓋 states／dispatch／resume-retry／schemas／approval gates／Git side effects）。
2. `CLAUDE.md:40` 整條——更新該 living document 的 metadata、決策狀態、未決問題、implementation mapping 與實際驗證證據，並同步受影響的現況文件。`AGENTS.md` 僅以一句 "read and update" 帶過。
3. `CLAUDE.md:41` 的 `Proposed` ≠ 已核准（原文已指出）。

`CLAUDE.md:42` 的 manual-testing-checklist 過時規則兩邊一致（與 §3 #6b 相符）。

**建議改法**：把 §4 從「漏掉一條」改為「漏掉三類」，並保留原本對第 3 類（授權限制）風險最高的強調。這會讓 §4 的論點更強，不是更弱。

---

### R3（中）§6 與 §7 的決定編號對不上

**位置**：§7 最後一段（原文第 113 行）對照 §6 決定 5（原文第 100 行）。

**問題**：§6 決定 5 是「§3 #3、#4、#8 是否提升為所有 agent 的共通規範」，但 §7 寫成「決定 5（#8 是否升為共通規範）」，#3、#4 憑空消失。

**建議改法**：§7 該句改為「決定 5（#3／#4／#8 是否升為共通規範）」。

---

### R4（中）§5 表格與 §6.1 對「語言」的定位互相矛盾

**位置**：§5 方案 A 缺點欄（原文第 85 行）與 §6 決定 1（原文第 96 行）。

**問題**：§5 把「必須放棄中英分流」列為方案 A 的缺點，§6.1 卻稱語言是「A 方案唯一真正的代價」——同一句的後半又承認 B 方案也要決定是否保留英文摘要。語言其實是 A／B／B'／C 共同面對的決定項。

**建議改法**：§6.1 刪除「這是 A 方案唯一真正的代價」，改為「無論採 A／B／B'／C 都必須先決定；差別只在 A 完全無法保留雙語版本，B／B' 可以在專屬段落保留另一種語言的摘要」。

---

### R5（中）漏引官方文件中對自己有利的佐證，方案清單也不完整

**位置**：§2 補充段（原文第 49 行）、§5 方案表、§9 依據清單。

**問題與建議**：Claude Code 官方 memory 文件實際上還記載了兩條路徑，原報告都沒提：

1. **`ln -s AGENTS.md CLAUDE.md`**：官方明列此作法，並直接註明「在 Windows 上建立 symlink 需要 Administrator 權限或 Developer Mode，因此請改用 `@AGENTS.md` import」。這是 §2 論點**最強的官方佐證**，建議補進 §2 作為第 4 項（或併入第 3 項），並在 §9 標注出處。
2. **`/import` 指令**：可一次性把 `AGENTS.md` 內容附加到 `CLAUDE.md`。建議在 §5 補一列並說明**不採用的理由**——它產生的是一次性複製，正是 §4 所描述的漂移成因。
3. **`.claude/rules/`**（Claude 端的拆檔／路徑範圍機制）：屬次要遺漏，只影響 Claude 側，可在 §5 方案 B 的說明中一句帶過，或不補。

---

### R6（中）§3 表格「可共用性」欄混用三種評分尺度

**位置**：§3 表格（原文第 55–65 行）。

**問題**：同一欄的「高」代表三種不同意思：

- 第 1、2、5、6 列：已經重複、應收斂。
- 第 3、4 列：目前**不**重複，是「值得提升為共通規範」（原文自己在備註裡承認了）。
- 第 7 列的「中」則是以**變動速度**評分。

讀者無法據此排優先序。

**建議改法**：拆成兩欄——「重疊程度（重複／單邊獨有）」與「建議動作（收斂／提升為共通／維持單邊／待決）」，或至少在表頭加一句說明本欄的評分基準。

---

### R7（低）章節分隔與編排一致性

**位置**：§8（原文第 115 行）、§9（原文第 119 行）之前。

**問題**：§1–§7 之間都有 `---` 分隔線，§8、§9 之前沒有。

**另建議**：§8「一個容易混淆的點」（Knowledge Agent 讀的是**使用者專案**的 `CLAUDE.md`）是排除影響範圍的前提，目前放在「建議的執行順序」之後，讀起來像事後補記。建議移到 §5 之前（或併入 §2 之後）。

---

### R8（低）§2 第 2 點的實測證據不完整

**位置**：§2 第 2 點的程式碼區塊（原文第 40–43 行）。

**問題**：只列了 `--local` 與 `--system`，但小標寫的是「這台機器」。

**建議改法**：補上 `git config --global core.symlinks →（未設定）` 與 `git config core.symlinks → false`（effective 值），讓「這台機器」的宣稱有完整證據。結論不變。

---

## 3. 修改後的自我檢查清單

- [ ] R1：§3 結尾不再宣稱「不存在工具專屬內容」，且與 §5 方案 B 的優點欄一致。
- [ ] R2：§4 列出三類漏失，且行號可對照 `CLAUDE.md:39`、`:40`、`:41`。
- [ ] R3：§7 與 §6 的決定編號逐一對得上。
- [ ] R4：語言決定不再被描述成 A 方案獨有的代價。
- [ ] R5：§2／§5／§9 已納入 `ln -s AGENTS.md CLAUDE.md` 的官方註記與 `/import` 的不採用理由。
- [ ] R6：§3 表格的評分基準單一且明確。
- [ ] R7、R8：格式與證據補齊。
- [ ] 全程未修改 `AGENTS.md`、`CLAUDE.md`、`README.md`。
