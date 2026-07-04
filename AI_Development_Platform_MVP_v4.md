# AI Development Platform (ADP) - MVP Proposal

> 一個以 AI Agent 組成的軟體開發團隊，透過 Workflow Engine
> 管理整個需求生命週期，並可根據不同專案的 `CLAUDE.md`、`instructions`
> 等 Context，自動調整 Agent 的行為。

------------------------------------------------------------------------

# 一、專案目標

建立一套通用的 AI 開發團隊，而不是針對每個專案重新建立 Agent。

平台負責：

-   Workflow 管理
-   Agent 協作
-   Progress Dashboard
-   Human Review
-   Knowledge Management

而各個專案只需要提供自己的 Context：

-   CLAUDE.md
-   instructions
-   coding guideline
-   architecture
-   business rules
-   其他專案設定

即可讓同一套 Agent 自動適應不同專案。

------------------------------------------------------------------------

# 二、核心理念

## 平台固定

    AI Development Platform

提供所有專案共用能力：

-   Workflow Engine
-   Agent Library
-   Dashboard
-   State Machine
-   Knowledge Base
-   Validation
-   Human Review

------------------------------------------------------------------------

## 專案客製化

不同專案只提供 Context

    Project A
    ├── CLAUDE.md
    ├── instructions/
    ├── architecture/
    ├── coding-guideline/

    Project B
    ├── CLAUDE.md
    ├── instructions/
    ├── architecture/
    ├── business-rules/

Agent 本身不用修改，只需讀取不同 Context。

------------------------------------------------------------------------

# 三、MVP Agent Team

    Human
        │
        ▼
    PM Agent
        │
        ▼
    BA Agent
        │
        ▼
    Plan + SA/SD Agent
        │
        ▼
    Developer Agent
        │
        ▼
    Review/Test Agent
        │
        ▼
    Knowledge Agent

## PM Agent

-   接收需求
-   判斷需求種類
-   決定派工

例如：

-   Bug
-   Refactor
-   Feature
-   Research

並決定：

    Maintenance Team

    或

    New Feature Team

## BA Agent

-   與使用者互動
-   提問
-   完善需求
-   補齊 Acceptance Criteria

直到：

    Requirement Approved

## Plan + SA/SD Agent（MVP）

目前先合併。

負責產生：

-   Requirement Summary
-   User Story
-   Functional Flow
-   Technical Design
-   File Impact
-   Task Breakdown
-   Test Plan

後續成熟後可拆成：

-   Plan Agent
-   SA Agent
-   SD Agent

## Developer Agent

負責：

-   Coding
-   Refactor
-   Unit Test
-   修改 Extension

例如：

-   package.json
-   commands
-   webview
-   CLI
-   backend
-   frontend

## Review/Test Agent

負責：

-   Code Review
-   Unit Test
-   Risk Check
-   Document Check
-   Best Practice

確認：

-   是否符合需求
-   是否符合 Coding Guideline

## Knowledge Agent

當 Human 確認需求完成後：

整理：

-   Decision
-   Architecture
-   Lessons Learned
-   New Rule
-   Common Solution

寫入 Knowledge Base。

------------------------------------------------------------------------

# 四、Workflow Engine（核心）

Agent 不直接互相呼叫。

改由 Workflow Engine 控制。

    Workflow

    ↓

    PM 完成

    ↓

    Workflow 判斷

    ↓

    叫 BA

    ↓

    BA 完成

    ↓

    Workflow 判斷

    ↓

    叫 Plan

    ↓

    ...

Workflow 才是整個平台的大腦。

Agent 只是執行者。

------------------------------------------------------------------------

# 五、State Machine

    CREATED

    ↓

    PM_TRIAGE

    ↓

    BA_CLARIFYING

    ↓

    SPEC_DRAFTING

    ↓

    PENDING_SPEC_APPROVAL

    ↓

    DEVELOPING

    ↓

    TESTING

    ↓

    PENDING_FINAL_APPROVAL

    ↓

    KNOWLEDGE_CAPTURED

    ↓

    DONE

------------------------------------------------------------------------

# 六、Pending Gate（Human in the Loop）

所有會產生正式文件的流程：

    Agent

    ↓

    Document

    ↓

    Pending

    ↓

    Human Approve

    ↓

    Workflow

    ↓

    Next Agent

避免 AI 錯誤一路傳遞。

------------------------------------------------------------------------

# 七、Dashboard

## Mother Dashboard

作為需求管理總覽，讓 PM、Tech Lead
與開發者能快速掌握每個需求的狀態，而不只是查看進度。

  ---------------------------------------------------------------------------------------------------------------------------------------------------
  ID       需求名稱   類型       來源      Team          優先級     Progress   Current Stage Current   Status     Waiting   Created      Updated
                                                                                             Agent                                       
  -------- ---------- ---------- --------- ------------- ---------- ---------- ------------- --------- ---------- --------- ------------ ------------
  RQ-001   Login API  🆕 New     👤 User   New Feature   High       65%        Development   Dev Agent Running    \-        2026/07/04   2026/07/04
                      Feature              Team                                                                                          

  RQ-002   Search Bug 🐞 Bug Fix 🐞 Bug    Maintenance   Critical   20%        BA            BA Agent  Waiting    User      2026/07/04   2026/07/04
                                 Report    Team                                                                                          

  RQ-003   CLI        ♻️         📋        New Feature   Medium     90%        Review        Review    Pending    Human     2026/07/03   2026/07/04
           Refactor   Refactor   Product   Team                                              Agent     Approval                          
  ---------------------------------------------------------------------------------------------------------------------------------------------------

### 欄位說明

  ---------------------------------------------------------------------------------------------------
  欄位                                說明
  ----------------------------------- ---------------------------------------------------------------
  類型 (Type)                         區分 New Feature、Maintenance、Bug
                                      Fix、Refactor、Performance、Security、Documentation、Research
                                      等需求類型。

  來源 (Source)                       記錄需求來源，例如 User、Product、Bug Report、Tech Debt、AI
                                      Suggestion、Monitoring。

  Team                                顯示目前由 Maintenance Team 或 New Feature Team 負責。

  Progress                            由 Workflow Engine 根據目前 State 自動計算，不由 Agent
                                      自行回報。

  Waiting                             顯示目前等待 User、Human Review 或其他
                                      Agent，方便快速找出流程瓶頸。
  ---------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## Child Dashboard

    Plan-SA-SD

    ✔ Requirement Analysis

    ✔ Impact Analysis

    ✔ File Mapping

    ✔ Task Breakdown

    ● Waiting Human Approval

可顯示：

-   每個 Agent 完成哪些工作
-   哪一步等待
-   哪一步卡住

------------------------------------------------------------------------

## （未來）Agent Dashboard

    Developer Agent

    Controller

    ███████░░░ 70%

    目前修改：

    UserController.java

    目前測試：

    Unit Test

------------------------------------------------------------------------

# 八、Validation Layer（未來）

    SA Agent

    ↓

    Validation Agent

    ↓

    Human Review

Validation：

-   Requirement Completeness
-   Consistency
-   Missing Flow
-   Architecture Rule
-   Dependency

------------------------------------------------------------------------

# 九、Knowledge Management

    Requirement Memory

    Architecture Memory

    Decision Memory

    Code Memory

    Test Memory

    Deployment Memory

最後整理成：

-   Best Practice
-   FAQ
-   Common Pattern
-   Design Decision

------------------------------------------------------------------------

# 十、Project Context

平台固定。

不同專案只提供：

    CLAUDE.md

    instructions/

    architecture/

    coding-guideline/

    business-rules/

Agent：

    讀 CLAUDE.md

    ↓

    了解專案技術

    ↓

    調整 Prompt

    ↓

    開始工作

------------------------------------------------------------------------

# 十一、未來可擴充方向

## Plugin

    Spring Plugin

    Angular Plugin

    Docker Plugin

    Kubernetes Plugin

    Oracle Plugin

    Git Plugin

Agent 可根據：

    CLAUDE.md

自動載入 Plugin。

------------------------------------------------------------------------

## 多團隊

    PM Agent

    ↓

    Maintenance Team

    或

    New Feature Team

------------------------------------------------------------------------

## Methodology

未來可支援：

-   BDD
-   DDD
-   Scrum
-   Internal Company Rules

Workflow 不需要修改。

只替換 Methodology。

------------------------------------------------------------------------

# MVP 開發目標

目前專案：

> **VSCode Extension AI Development Team**

目的：

1.  驗證 PM → BA → Plan/SA/SD → Dev → Review 的 Agent 協作流程。
2.  驗證 Workflow Engine 的狀態管理與派工。
3.  驗證 Pending Gate 的品質控管。
4.  驗證 Mother / Child Dashboard 的可視化能力。
5.  驗證 Context（CLAUDE.md、instructions）是否足以讓同一套 Agent
    適應不同專案。
