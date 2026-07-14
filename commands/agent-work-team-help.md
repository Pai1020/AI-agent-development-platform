---
description: 列出 agent-work-team pipeline 所有可用指令與各自功能，以及狀態/階段圖例
---

你正在執行 `/agent-work-team-help`。這是一個靜態說明指令：直接把下面的內容整理後回覆給使用者，不需要讀取任何檔案、不需要 dispatch 任何 subagent。若使用者的專案裡已經有 `.agent-work-team/requests/`，可以額外提醒他們先看一眼 `.agent-work-team/dashboard.md` 掌握目前所有需求的總覽。

把以下內容原樣（可以調整措辭使其更口語，但資訊要完整）回覆給使用者：

## 指令一覽

| 指令 | 功能 |
|---|---|
| `/agent-work-team "<需求描述>"` | **開一個全新需求**。驅動 PM → BA → Plan/SA/SD，止於 `SPEC_APPROVED`。不會接續任何既有需求——要接續請用 `/agent-work-team-resume`。 |
| `/agent-work-team-resume [RQ-ID]` | **續接入口**。列出所有在途／待確認／卡住的需求，顯示每一個停在哪、為什麼停、有哪些待確認問題；可以從任何全新 session 把 Planning 階段的軟停接回去。Development／Knowledge 階段的需求會被導向下面兩個指令，不在這裡處理。 |
| `/agent-work-team-develop <RQ-ID>` | **Development 階段**。驅動 Developer Agent 逐一實作 task、Reviewer 逐一審查，全部完成後跑整體審查，止於 `DEV_APPROVED`。若需求已經在這個階段跑到一半（含 `Blocked`），重新執行會自動從磁碟續接，不需要用 `/agent-work-team-resume`。 |
| `/agent-work-team-knowledge <RQ-ID>` | **Knowledge Agent 階段**。把已核准的 Development 成果整理進 Obsidian wiki，止於 `DONE`。同樣能直接重新執行自動續接。 |
| `/agent-work-team-dashboard` | 備用指令，手動重建 `.agent-work-team/dashboard.md`。正常情況不需要——這個檔案由 hook 在每次 `state.json` 被寫入時自動同步；只有懷疑它過期或損毀時才用這個。 |
| `/agent-work-team-help` | 顯示這份說明。 |

## 需求生命週期（`current_stage`）

```
CREATED → PM_TRIAGE → BA_CLARIFYING → SPEC_DRAFTING → PENDING_SPEC_APPROVAL → SPEC_APPROVED
        → DEVELOPING → TESTING → PENDING_FINAL_APPROVAL → DEV_APPROVED
        → PENDING_KNOWLEDGE_APPROVAL → DONE
```

## 狀態（`status`）圖例

| status | 意思 |
|---|---|
| `Running` | Controller 正在處理，或 subagent 執行中。 |
| `Pending Confirmation` | Planning 階段的**軟停**——一段即時對話（BA 提問、需求摘要確認）暫停，等你回答或確認。沒有成品產出，只能靠 `/agent-work-team-resume` 接回對話。 |
| `Pending Approval` | 已經有成品在磁碟（`plan-spec.md`／`final-review.md`／`knowledge-report.md`），等你正式核准（approve）。 |
| `Blocked` | Agent 判斷自己卡住了（資訊不足、重試次數用完），需要你介入。`/agent-work-team-resume` 或對應階段指令都能看到卡住原因並重試。 |
| `Approved` / `Completed` | 該階段的關卡已核准，流程繼續往下或已全部結束。 |

## 狀態存在哪裡

所有需求狀態都是**你自己專案**裡的檔案，不在這個 plugin repo：`.agent-work-team/requests/RQ-NNN/`（`state.json` 是單一真相來源，`planning/checkpoint.json`／`dev/progress.json` 是各階段的續接用 checkpoint）。`.agent-work-team/dashboard.md` 是彙整全部需求的總覽表格，自動維護。
