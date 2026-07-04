# Claude Code Plugin Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `AI-agent-development-platform` as an installable Claude Code plugin skeleton — manifest, local marketplace entry, and one placeholder skill/agent/command — with no SDLC feature logic yet.

**Architecture:** Standard Claude Code plugin layout: `.claude-plugin/plugin.json` (manifest) + `.claude-plugin/marketplace.json` (local install entry), plus top-level `skills/`, `agents/`, `commands/` directories each holding one placeholder file with valid frontmatter. `CLAUDE.md` and `README.md` document the layout for humans and for Claude Code itself.

**Tech Stack:** Plain JSON + Markdown/YAML-frontmatter files. No build step, no runtime dependencies.

## Global Constraints

- Plugin `name`: `ai-agent-dev-platform` (from spec, kebab-case, used identically in `plugin.json` and `marketplace.json`).
- Plugin `version`: `0.1.0`.
- Repository URL: `https://github.com/Pai1020/AI-agent-development-platform`.
- Author: `Pai1020` (GitHub handle; no email confirmed, omit email field).
- No `hooks/`, no CI/lint scripts, no MCP server — explicitly out of scope per spec.
- All placeholder files (`example-planning`, `example-planner`, `example-plan`) must say in their own body text that they are placeholders to be replaced later.

---

### Task 1: Plugin manifest + local marketplace entry

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

**Interfaces:**
- Produces: a `name: "ai-agent-dev-platform"` value that Task 2–4's frontmatter descriptions reference conceptually (no code coupling — JSON manifests only).

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "ai-agent-dev-platform",
  "description": "SDLC 開發流程自動化工具集 for Claude Code — 目前聚焦需求與規劃階段",
  "version": "0.1.0",
  "author": {
    "name": "Pai1020"
  },
  "homepage": "https://github.com/Pai1020/AI-agent-development-platform",
  "repository": "https://github.com/Pai1020/AI-agent-development-platform",
  "license": "MIT",
  "keywords": [
    "sdlc",
    "planning",
    "workflow-automation"
  ]
}
```

- [ ] **Step 2: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "ai-agent-dev-platform-marketplace",
  "description": "Local marketplace for the ai-agent-dev-platform Claude Code plugin",
  "owner": {
    "name": "Pai1020"
  },
  "plugins": [
    {
      "name": "ai-agent-dev-platform",
      "description": "SDLC 開發流程自動化工具集 for Claude Code — 目前聚焦需求與規劃階段",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "Pai1020"
      }
    }
  ]
}
```

- [ ] **Step 3: Validate both files are syntactically valid JSON**

Run: `python -m json.tool .claude-plugin/plugin.json > /dev/null && python -m json.tool .claude-plugin/marketplace.json > /dev/null && echo VALID`
Expected: `VALID` printed, no traceback.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "Add plugin manifest and local marketplace entry"
```

---

### Task 2: Placeholder skill

**Files:**
- Create: `skills/example-planning/SKILL.md`

**Interfaces:**
- Produces: a skill discoverable by Claude Code with frontmatter `name: example-planning`.

- [ ] **Step 1: Create `skills/example-planning/SKILL.md`**

```markdown
---
name: example-planning
description: 佔位範例 skill，用於驗證 plugin 骨架能被 Claude Code 正確載入；之後會被實際的需求與規劃（Planning）功能取代
---

# Example Planning (佔位)

這是一個佔位 skill，唯一目的是驗證 plugin 骨架可以被 Claude Code 載入並辨識。

之後這裡會放上實際的 SDLC 規劃階段功能（例如需求整理、design doc 產生流程）。
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 skills/example-planning/SKILL.md && grep -c '^name:' skills/example-planning/SKILL.md && grep -c '^description:' skills/example-planning/SKILL.md`
Expected: first line is `---`, both grep counts return `1`.

- [ ] **Step 3: Commit**

```bash
git add skills/example-planning/SKILL.md
git commit -m "Add placeholder example-planning skill"
```

---

### Task 3: Placeholder subagent

**Files:**
- Create: `agents/example-planner.md`

**Interfaces:**
- Produces: an agent discoverable by the `Agent` tool with frontmatter `name: example-planner`.

- [ ] **Step 1: Create `agents/example-planner.md`**

```markdown
---
name: example-planner
description: 佔位範例 subagent，用於驗證 plugin 骨架的 agents 目錄能被 Claude Code 正確載入；之後會被實際的規劃用 subagent 取代
tools: Read, Grep, Glob
---

你是一個佔位用的 subagent，目前沒有實際任務邏輯。

你唯一的職責是回覆「example-planner 佔位 subagent 已載入」，確認 plugin 的 agents 目錄骨架運作正常。之後這裡會被實際的規劃（Planning）用途 subagent 取代。
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 agents/example-planner.md && grep -c '^name:' agents/example-planner.md && grep -c '^tools:' agents/example-planner.md`
Expected: first line is `---`, both grep counts return `1`.

- [ ] **Step 3: Commit**

```bash
git add agents/example-planner.md
git commit -m "Add placeholder example-planner subagent"
```

---

### Task 4: Placeholder slash command

**Files:**
- Create: `commands/example-plan.md`

**Interfaces:**
- Produces: a slash command `/example-plan` discoverable by Claude Code.

- [ ] **Step 1: Create `commands/example-plan.md`**

```markdown
---
description: 佔位範例 slash command，用於驗證 plugin 骨架的 commands 目錄能被 Claude Code 正確載入
---

這是一個佔位 slash command，目前沒有實際功能。

請直接回覆：「example-plan 佔位 command 已載入」，確認 plugin 的 commands 目錄骨架運作正常。之後這裡會被實際的規劃（Planning）功能取代。
```

- [ ] **Step 2: Validate frontmatter structure**

Run: `head -1 commands/example-plan.md && grep -c '^description:' commands/example-plan.md`
Expected: first line is `---`, grep count returns `1`.

- [ ] **Step 3: Commit**

```bash
git add commands/example-plan.md
git commit -m "Add placeholder example-plan slash command"
```

---

### Task 5: Project docs (CLAUDE.md, README.md, .gitignore)

**Files:**
- Create: `CLAUDE.md`
- Modify: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Consumes: directory layout established in Tasks 1–4 (documents it, no code coupling).

- [ ] **Step 1: Create `CLAUDE.md`**

```markdown
# AI Agent Development Platform

這是一個 Claude Code plugin 專案：`ai-agent-dev-platform`，目標是提供一組 SDLC（軟體開發生命週期）開發流程自動化工具。

## 目前狀態

- 僅有基礎骨架（plugin.json、marketplace.json、skills/agents/commands 佔位範例）
- 第一版具體功能將聚焦於「需求與規劃（Planning）」階段，尚未實作

## 目錄慣例

- `skills/<name>/SKILL.md` — 供 Claude Code 自動判斷是否套用的技能
- `agents/<name>.md` — 可被 Agent 工具呼叫的 subagent 定義
- `commands/<name>.md` — 使用者可用 `/<name>` 觸發的 slash command
- `.claude-plugin/plugin.json` — plugin manifest
- `.claude-plugin/marketplace.json` — 本機測試安裝用的 marketplace 定義

## 開發規範

- 新增功能前先確認是否屬於 Planning 階段範圍，跨階段功能應拆成獨立的 spec/plan。
- 佔位檔案（example-*）在對應真正功能實作完成後應被取代，而不是保留。
```

- [ ] **Step 2: Overwrite `README.md`**

```markdown
# AI Agent Development Platform

Claude Code plugin：一組 SDLC（軟體開發生命週期）開發流程自動化工具集。目前第一版聚焦於需求與規劃（Planning）階段，其他階段（測試、部署等）將於後續版本加入。

## 安裝（本機測試）

```
/plugin marketplace add <此 repo 的本機路徑或 git URL>
/plugin install ai-agent-dev-platform
```

## 目前內容

目前僅提供骨架與佔位範例，尚未實作具體 Planning 功能：

- `skills/example-planning` — 佔位 skill
- `agents/example-planner.md` — 佔位 subagent
- `commands/example-plan.md` — 佔位 slash command

## 開發狀態

骨架建置中，具體功能開發中。
```

- [ ] **Step 3: Create `.gitignore`**

```
.DS_Store
Thumbs.db
*.log
node_modules/
```

- [ ] **Step 4: Verify all three files exist with expected first lines**

Run: `head -1 CLAUDE.md && head -1 README.md && test -f .gitignore && echo GITIGNORE_OK`
Expected: `# AI Agent Development Platform` (twice, once per file) and `GITIGNORE_OK`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md .gitignore
git commit -m "Add project docs and gitignore for plugin scaffold"
```

---

### Task 6: Manual install verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–5.

- [ ] **Step 1: Confirm final tree**

Run: `find .claude-plugin skills agents commands CLAUDE.md README.md .gitignore -type f`
Expected output (order may vary):
```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
skills/example-planning/SKILL.md
agents/example-planner.md
commands/example-plan.md
CLAUDE.md
README.md
.gitignore
```

- [ ] **Step 2: Manually install and verify inside a Claude Code session (user-driven, not scriptable)**

In a Claude Code session, run:
```
/plugin marketplace add <absolute path to this repo>
/plugin install ai-agent-dev-platform
```
Then confirm:
- The skill `example-planning` is listed as available (or triggers when asked "use example planning").
- The agent `example-planner` can be invoked via the `Agent` tool and replies with the placeholder confirmation line.
- `/example-plan` runs and replies with the placeholder confirmation line.

This step is manual because plugin installation is a client-side slash-command action, not something scriptable via Bash.
