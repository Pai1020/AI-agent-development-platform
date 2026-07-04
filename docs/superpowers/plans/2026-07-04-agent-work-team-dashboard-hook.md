# Agent Work Team Dashboard Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move dashboard-rebuild logic out of `/agent-work-team`'s own prompt instructions and into a Claude Code `PostToolUse` hook, so `.agent-work-team/dashboard.md` stays in sync silently — no visible tool calls, no reliance on the model remembering to do it.

**Architecture:** A single Node.js script (`hooks/sync-dashboard.mjs`) exports pure, unit-tested functions for path-matching and table rendering, plus a small CLI entrypoint with two modes: hook mode (reads `PostToolUse` JSON from stdin, self-filters by file path, silently rebuilds) and `--force` mode (unconditional rebuild, prints the table — used by the fallback command). `hooks/hooks.json` wires this script to fire after every `Write` tool call. `commands/agent-work-team.md` loses all its dashboard-sync prose; `commands/agent-work-team-dashboard.md` shrinks to a one-line delegation to the same script.

**Tech Stack:** Node.js (ESM, `node:fs`/`node:path`/`node:url` built-ins only, no dependencies), Node's built-in test runner (`node --test`). Markdown + YAML frontmatter for the command files. JSON for the hook manifest.

## Global Constraints

- Dashboard file: `.agent-work-team/dashboard.md`, content is `# Agent Work Team Dashboard` heading + a 13-column table (ID, 需求名稱, 類型, 來源, Team, 優先級, Progress, Current Stage, Current Agent, Status, Waiting, Created, Updated), sorted by `updated` descending, null-display rules: `name`→`(未命名)`, all other nullable fields→`-`, `progress` gets a `%` suffix.
- `hooks/sync-dashboard.mjs` hook mode: reads JSON from stdin with shape `{ tool_input: { file_path }, cwd, ... }`. If `tool_input.file_path` does not match `.agent-work-team/requests/<anything>/state.json` (path separators normalized), exit 0 with no output — must never touch unrelated files or print anything for them.
- On a real (matching) rebuild success in hook mode: print exactly `{"suppressOutput": true}` to stdout, exit 0. On failure while rebuilding (e.g. a corrupt `state.json`): write a one-line error to stderr, exit 2.
- `--force` mode: ignore stdin, always rebuild, print the rendered table to stdout (or the "no requests" message if there are zero `state.json` files) — this is what `/agent-work-team-dashboard` shells out to.
- `hooks/hooks.json`: `PostToolUse`, `matcher: "Write"`, `command: node "${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs"`, `async: false`.
- `commands/agent-work-team.md` must no longer contain any dashboard-sync instructions (no "Dashboard 同步規則" section, no "同步 dashboard" references) — the hook handles it entirely.
- `commands/agent-work-team-dashboard.md` must not duplicate the table-rendering rules — it delegates to the script via Bash with `--force`.

---

### Task 1: Dashboard rebuild logic (`hooks/sync-dashboard.mjs`), unit tested

**Files:**
- Create: `hooks/sync-dashboard.mjs`
- Create: `hooks/sync-dashboard.test.mjs`

**Interfaces:**
- Produces: named exports `matchesStateJsonPath(filePath)`, `renderDashboardTable(requests)`, `collectRequests(cwd)`, `rebuildDashboard(cwd)` — Task 2 (this same task, CLI wiring) and later manual verification depend on these exact names and signatures. `rebuildDashboard` returns `{ created: boolean, message: string|null, table: string|null }`.

- [ ] **Step 1: Write the failing tests**

Create `hooks/sync-dashboard.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  matchesStateJsonPath,
  renderDashboardTable,
  collectRequests,
  rebuildDashboard,
} from './sync-dashboard.mjs';

test('matchesStateJsonPath matches the expected pattern', () => {
  assert.equal(matchesStateJsonPath('.agent-work-team/requests/RQ-001/state.json'), true);
  assert.equal(matchesStateJsonPath('/abs/path/.agent-work-team/requests/RQ-001/state.json'), true);
  assert.equal(matchesStateJsonPath('C:\\abs\\path\\.agent-work-team\\requests\\RQ-001\\state.json'), true);
  assert.equal(matchesStateJsonPath('.agent-work-team/requests/RQ-001/pm-triage.json'), false);
  assert.equal(matchesStateJsonPath('foo.txt'), false);
  assert.equal(matchesStateJsonPath(undefined), false);
});

test('renderDashboardTable renders null fields with the documented placeholders', () => {
  const table = renderDashboardTable([
    {
      id: 'RQ-001', name: null, type: null, source: null, team: null, priority: null,
      progress: 0, current_stage: 'CREATED', current_agent: null, status: 'Running',
      waiting_on: null, created: '2026-07-04', updated: '2026-07-04',
    },
  ]);
  assert.match(table, /\(未命名\)/);
  assert.match(table, / - /);
  assert.match(table, /0%/);
  assert.match(table, /^\| ID \| 需求名稱 \|/);
});

test('renderDashboardTable sorts by updated descending', () => {
  const table = renderDashboardTable([
    { id: 'RQ-001', name: 'A', type: 't', source: 's', team: 'tm', priority: 'p', progress: 10, current_stage: 'PM_TRIAGE', current_agent: null, status: 'Running', waiting_on: null, created: '2026-07-01', updated: '2026-07-01' },
    { id: 'RQ-002', name: 'B', type: 't', source: 's', team: 'tm', priority: 'p', progress: 10, current_stage: 'PM_TRIAGE', current_agent: null, status: 'Running', waiting_on: null, created: '2026-07-03', updated: '2026-07-03' },
  ]);
  const rows = table.split('\n').filter((l) => l.includes('RQ-'));
  assert.ok(rows[0].includes('RQ-002'));
  assert.ok(rows[1].includes('RQ-001'));
});

test('collectRequests returns [] when the requests dir does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  assert.deepEqual(collectRequests(dir), []);
});

test('collectRequests reads every state.json under requests/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  mkdirSync(join(dir, '.agent-work-team/requests/RQ-001'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-work-team/requests/RQ-001/state.json'),
    JSON.stringify({ id: 'RQ-001', updated: '2026-07-04' }),
  );
  const requests = collectRequests(dir);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].id, 'RQ-001');
});

test('rebuildDashboard writes dashboard.md and returns the table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  mkdirSync(join(dir, '.agent-work-team/requests/RQ-001'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-work-team/requests/RQ-001/state.json'),
    JSON.stringify({
      id: 'RQ-001', name: 'Test', type: 'New Feature', source: 'User', team: 'New Feature Team',
      priority: 'High', progress: 10, current_stage: 'PM_TRIAGE', current_agent: 'PM Agent',
      status: 'Running', waiting_on: null, created: '2026-07-04', updated: '2026-07-04',
    }),
  );
  const result = rebuildDashboard(dir);
  assert.equal(result.created, true);
  assert.ok(existsSync(join(dir, '.agent-work-team/dashboard.md')));
  const content = readFileSync(join(dir, '.agent-work-team/dashboard.md'), 'utf8');
  assert.match(content, /# Agent Work Team Dashboard/);
  assert.match(content, /RQ-001/);
});

test('rebuildDashboard does not create dashboard.md when there are zero requests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  const result = rebuildDashboard(dir);
  assert.equal(result.created, false);
  assert.equal(existsSync(join(dir, '.agent-work-team/dashboard.md')), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test hooks/sync-dashboard.test.mjs`
Expected: FAIL — `Cannot find module './sync-dashboard.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Write `hooks/sync-dashboard.mjs`'s pure-logic exports and CLI entrypoint**

Create `hooks/sync-dashboard.mjs`:

```javascript
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUESTS_DIR = '.agent-work-team/requests';
const DASHBOARD_PATH = '.agent-work-team/dashboard.md';

export function matchesStateJsonPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/');
  return /(^|\/)\.agent-work-team\/requests\/[^/]+\/state\.json$/.test(normalized);
}

function displayOrDash(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function displayName(value) {
  return value === null || value === undefined ? '(未命名)' : String(value);
}

export function renderDashboardTable(requests) {
  const header = '| ID | 需求名稱 | 類型 | 來源 | Team | 優先級 | Progress | Current Stage | Current Agent | Status | Waiting | Created | Updated |';
  const separator = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const sorted = [...requests].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const rows = sorted.map((r) => [
    r.id,
    displayName(r.name),
    displayOrDash(r.type),
    displayOrDash(r.source),
    displayOrDash(r.team),
    displayOrDash(r.priority),
    `${r.progress}%`,
    r.current_stage,
    displayOrDash(r.current_agent),
    r.status,
    displayOrDash(r.waiting_on),
    r.created,
    r.updated,
  ].join(' | '));
  const rowLines = rows.map((row) => `| ${row} |`);
  return [header, separator, ...rowLines].join('\n');
}

export function collectRequests(cwd = process.cwd()) {
  const dir = join(cwd, REQUESTS_DIR);
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const requests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateFile = join(dir, entry.name, 'state.json');
    if (!existsSync(stateFile)) continue;
    try {
      requests.push(JSON.parse(readFileSync(stateFile, 'utf8')));
    } catch (err) {
      throw new Error(`Failed to parse ${stateFile}: ${err.message}`);
    }
  }
  return requests;
}

export function rebuildDashboard(cwd = process.cwd()) {
  const requests = collectRequests(cwd);
  if (requests.length === 0) {
    return { created: false, message: '目前沒有任何 agent-work-team 需求', table: null };
  }
  const table = renderDashboardTable(requests);
  const content = `# Agent Work Team Dashboard\n\n${table}\n`;
  writeFileSync(join(cwd, DASHBOARD_PATH), content, 'utf8');
  return { created: true, message: null, table };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const forceMode = process.argv.includes('--force');

  if (forceMode) {
    const result = rebuildDashboard();
    console.log(result.created ? result.table : result.message);
    process.exit(0);
  }

  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`sync-dashboard: failed to parse hook input: ${err.message}\n`);
    process.exit(2);
  }

  const filePath = input?.tool_input?.file_path;
  if (!matchesStateJsonPath(filePath)) {
    process.exit(0);
  }

  try {
    rebuildDashboard(input.cwd || process.cwd());
    process.stdout.write(JSON.stringify({ suppressOutput: true }));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`sync-dashboard: failed to rebuild dashboard: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test hooks/sync-dashboard.test.mjs`
Expected: PASS — all 6 tests green, e.g. `# pass 6`, `# fail 0`.

- [ ] **Step 5: Manually verify the CLI entrypoint (hook mode + force mode)**

Run (from repo root, in a throwaway temp check — this exercises `main()`, which the unit tests above don't cover):

```bash
CHECK_DIR=$(mktemp -d)
SCRIPT_PATH="$(pwd)/hooks/sync-dashboard.mjs"
mkdir -p "$CHECK_DIR/.agent-work-team/requests/RQ-001"
cat > "$CHECK_DIR/.agent-work-team/requests/RQ-001/state.json" <<'EOF'
{"id":"RQ-001","name":"CLI Check","type":"New Feature","source":"User","team":"New Feature Team","priority":"High","progress":10,"current_stage":"PM_TRIAGE","current_agent":"PM Agent","status":"Running","waiting_on":null,"created":"2026-07-04","updated":"2026-07-04"}
EOF
cd "$CHECK_DIR"
echo "{\"tool_input\":{\"file_path\":\".agent-work-team/requests/RQ-001/state.json\"},\"cwd\":\"$CHECK_DIR\"}" | node "$SCRIPT_PATH"; echo "exit:$?"
cat .agent-work-team/dashboard.md
echo "{\"tool_input\":{\"file_path\":\"some/unrelated/file.txt\"},\"cwd\":\"$CHECK_DIR\"}" | node "$SCRIPT_PATH"; echo "exit:$?"
node "$SCRIPT_PATH" --force
cd - > /dev/null
rm -rf "$CHECK_DIR"
```

Expected:
- First hook-mode call prints exactly `{"suppressOutput":true}` and `exit:0`.
- `cat .agent-work-team/dashboard.md` shows the `# Agent Work Team Dashboard` heading and a row for `RQ-001`.
- Second hook-mode call (unrelated file) prints nothing and `exit:0`.
- `--force` call prints the same table to stdout.

- [ ] **Step 6: Commit**

```bash
git add hooks/sync-dashboard.mjs hooks/sync-dashboard.test.mjs
git commit -m "Add dashboard rebuild script with unit-tested render/collect logic"
```

---

### Task 2: Wire the hook manifest

**Files:**
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: `hooks/sync-dashboard.mjs` from Task 1 (references its path via `${CLAUDE_PLUGIN_ROOT}`).

- [ ] **Step 1: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs\"",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `python -m json.tool hooks/hooks.json > /dev/null && echo VALID`
Expected: `VALID` printed, no traceback.

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "Wire sync-dashboard.mjs as a PostToolUse hook on Write"
```

---

### Task 3: Remove dashboard-sync prose from `/agent-work-team`

**Files:**
- Modify: `commands/agent-work-team.md` (full-file rewrite — see below)

**Interfaces:**
- Consumes: Task 2's hook (implicitly — this task just stops the command from doing the hook's job itself).

- [ ] **Step 1: Overwrite `commands/agent-work-team.md` with this exact content**

```markdown
---
description: 啟動一個新需求的 PM -> BA -> Plan/SA/SD 規劃流程（agent-work-team pipeline）
---

你正在執行 `/agent-work-team` — agent-work-team pipeline 的入口。你（主線程）是這個流程的 Controller，負責依序驅動 PM Agent → BA 階段 → Plan/SA/SD Agent，並維護每個需求的狀態檔案。

使用者在指令後面提供的文字（`$ARGUMENTS`）就是這次的原始需求描述（`raw_description`）。如果 `$ARGUMENTS` 是空的，直接問使用者「這次要處理的需求是什麼？」，拿到回覆後才繼續。

`.agent-work-team/dashboard.md` 會由 plugin 的 hook 自動同步，你不需要做任何事去維護它。

## Step 1: 建立新需求

1. 用 Bash 算出下一個 request id：

```bash
next=$(ls -d .agent-work-team/requests/RQ-* 2>/dev/null | sed 's#.*/RQ-##' | sort -n | tail -1)
next=${next:-0}
printf "RQ-%03d\n" $((10#$next + 1))
```

把輸出結果當作這次的 `request_id`（例如 `RQ-001`）。

2. 用 Bash 建立資料夾：`mkdir -p .agent-work-team/requests/{request_id}`
3. 用 Bash 取得今天日期：`date +%Y-%m-%d`，結果當作 `{today}`。
4. 用 Write 建立 `.agent-work-team/requests/{request_id}/state.json`：

```json
{
  "id": "{request_id}",
  "name": null,
  "type": null,
  "source": null,
  "team": null,
  "priority": null,
  "progress": 0,
  "current_stage": "CREATED",
  "current_agent": null,
  "status": "Running",
  "waiting_on": null,
  "created": "{today}",
  "updated": "{today}"
}
```

## Step 2: PM Agent 分類

1. 用 Write 更新 `state.json`：`current_stage: "PM_TRIAGE"`，`current_agent: "PM Agent"`，`progress: 10`，`updated` 改成今天日期（用 Bash 重新取得）。
2. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-pm"`，`model: haiku`），在 prompt 裡提供：
   - `request_id`: `{request_id}`
   - `output_dir`: `.agent-work-team/requests/{request_id}`
   - `raw_description`: `$ARGUMENTS` 的原文
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把 PM 回報的具體原因告訴使用者，然後停止，不要繼續往下走。
4. 若回報 `DONE`：用 Write 更新 `state.json`：`name`/`type`/`source`/`team`/`priority` 帶入 PM 回報的值，`current_stage: "BA_CLARIFYING"`，`current_agent: "BA Agent"`，`progress: 30`，`updated` 改成今天日期。

## Step 3: BA 階段（你自己直接跟使用者對話，不要 dispatch subagent）

1. 一次問一個問題，釐清需求範圍、限制、成功標準，直到你能寫出完整的 Acceptance Criteria 清單。優先用 AskUserQuestion 工具讓使用者用選的，開放式問題才用純文字問。
2. 把每一組問答記下來，之後要寫進 `clarification_log`。
3. 當你認為需求已經清楚，把完整的「需求摘要」與「Acceptance Criteria 清單」念給使用者確認一次。使用者明確回覆確認（例如「確認」「approved」「可以」）才算通過；如果使用者提出修改，回到本步驟第 1 點繼續問，不要自己假設已經通過。
4. 通過後，用 Bash 取得今天日期，再用 Write 建立 `.agent-work-team/requests/{request_id}/ba-requirement.json`：

```json
{
  "id": "{request_id}",
  "requirement_summary": "<你整理的需求摘要>",
  "acceptance_criteria": [
    "<第一條 AC>",
    "<第二條 AC>"
  ],
  "clarification_log": [
    {"question": "<你問的問題>", "answer": "<使用者的回答>"}
  ],
  "approved_at": "{today}"
}
```

5. 用 Write 建立對應的 `.agent-work-team/requests/{request_id}/ba-requirement.md`（`# BA Requirement — {request_id}`，接著用 `##` 標題呈現需求摘要、Acceptance Criteria 清單、問答紀錄，內容跟 json 一致）。
6. 用 Write 更新 `state.json`：`current_stage: "SPEC_DRAFTING"`，`current_agent: "Plan/SA/SD Agent"`，`progress: 60`，`updated` 改成今天日期。

## Step 4: Plan/SA/SD Agent 產出技術規格

1. 用 Agent 工具 dispatch subagent（`subagent_type: "agent-work-team-plan-sd"`，`model: sonnet`），在 prompt 裡提供 `request_id` 與 `output_dir`（同 Step 2）。
2. 若回報 `NEEDS_CONTEXT`：把它需要的資訊直接補給它，重新 dispatch，不要更動 `state.json` 的 `current_stage`。
3. 若回報 `BLOCKED`：用 Write 把 `state.json` 的 `status` 改成 `"Blocked"`、`waiting_on` 改成 `"Human"`，把具體原因告訴使用者，然後停止。
4. 若回報 `DONE` 或 `DONE_WITH_CONCERNS`：用 Write 更新 `state.json`：`current_stage: "PENDING_SPEC_APPROVAL"`，`current_agent: null`，`status: "Pending Approval"`，`waiting_on: "Human Review"`，`progress: 90`，`updated` 改成今天日期。若是 `DONE_WITH_CONCERNS`，把 concerns 一併告訴使用者。

## Step 5: Human Approval Gate

1. 明確告訴使用者：「Spec 已產出於 `.agent-work-team/requests/{request_id}/plan-spec.md`，請開啟該檔案確認內容，確認沒問題請回覆 approve，有問題請直接說明」。不要只在對話裡貼摘要就當作足夠——一定要請使用者去看實際檔案。
2. 使用者回覆 **approve**（或同義詞如「可以」「沒問題」）：用 Write 更新 `state.json`：`current_stage: "SPEC_APPROVED"`，`status: "Approved"`，`waiting_on: null`，`progress: 100`，`updated` 改成今天日期。告訴使用者這個需求的 Planning 階段已完成，Development 階段是後續版本才會實作。流程到此結束。
3. 使用者提出修改意見：
   - 若意見是針對需求本身（範圍、AC 有誤）→ 回到 Step 3，重新跟使用者釐清，釐清完重新寫一次 `ba-requirement.json`／`.md`，再重新走 Step 4。
   - 若意見只是針對技術設計內容（Technical Design、Task Breakdown 等）→ 直接重新走 Step 4，dispatch 時在 prompt 裡附上使用者的修改意見，不需要重新走 BA。
```

- [ ] **Step 2: Validate no dashboard-sync prose remains**

Run: `head -1 commands/agent-work-team.md && grep -c '^description:' commands/agent-work-team.md && grep -c '同步 dashboard' commands/agent-work-team.md; grep -c 'Dashboard 同步規則' commands/agent-work-team.md; grep -c 'agent-work-team-pm' commands/agent-work-team.md && grep -c 'PM_TRIAGE' commands/agent-work-team.md`
Expected: first line `---`, `description:` count `1`, `同步 dashboard` count `0`, `Dashboard 同步規則` count `0`, `agent-work-team-pm` count `>= 1`, `PM_TRIAGE` count `>= 1` (the state machine itself is untouched — only the sync prose is gone).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team.md
git commit -m "Remove dashboard-sync prose from /agent-work-team (now handled by hook)"
```

---

### Task 4: Simplify `/agent-work-team-dashboard` to delegate to the script

**Files:**
- Modify: `commands/agent-work-team-dashboard.md` (full-file rewrite — see below)

**Interfaces:**
- Consumes: `hooks/sync-dashboard.mjs --force` from Task 1 (invoked via Bash, output relayed as-is).

- [ ] **Step 1: Overwrite `commands/agent-work-team-dashboard.md` with this exact content**

```markdown
---
description: 備用指令，手動重新掃描並重建 .agent-work-team/dashboard.md（正常情況下不需要呼叫——這個檔案由 hook 自動同步）
---

你正在執行 `/agent-work-team-dashboard`。這是備用指令：正常情況下你不需要執行它，因為 `.agent-work-team/dashboard.md` 已經由 plugin 的 hook 在每次相關的 `state.json` 被寫入時自動同步。只有在你懷疑 `dashboard.md` 過期、損毀，或被手動刪除時，才需要手動執行這個指令來重建它。

## Step 1: 執行重建 script

用 Bash 執行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/sync-dashboard.mjs" --force
```

## Step 2: 回報結果

把上面指令的 stdout 原樣顯示在你的回覆裡（可能是重建好的表格，也可能是「目前沒有任何 agent-work-team 需求」）。不要自己重新渲染或改寫內容。
```

- [ ] **Step 2: Validate the new delegation-only content**

Run: `head -1 commands/agent-work-team-dashboard.md && grep -c '^description:' commands/agent-work-team-dashboard.md && grep -c 'sync-dashboard.mjs' commands/agent-work-team-dashboard.md && grep -c '對應欄位' commands/agent-work-team-dashboard.md`
Expected: first line `---`, `description:` count `1`, `sync-dashboard.mjs` count `>= 1`, `對應欄位` count `0` (the old per-column mapping rules must be gone — this file no longer duplicates the render logic).

- [ ] **Step 3: Commit**

```bash
git add commands/agent-work-team-dashboard.md
git commit -m "Simplify /agent-work-team-dashboard to delegate to sync-dashboard.mjs --force"
```

---

### Task 5: Update project docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the behavior established in Tasks 1–4 (documents it, no code coupling).

- [ ] **Step 1: Update `README.md`'s "目前內容" section**

The current section reads:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程，每次狀態變更會自動同步需求總覽（見下）
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

Replace it with:

```markdown
## 目前內容

- `commands/agent-work-team.md` — 入口指令，啟動 PM → BA → Plan/SA/SD 規劃流程
- `commands/agent-work-team-dashboard.md` — 備用指令，手動重建需求總覽檔案（正常情況下不需要呼叫）
- `agents/agent-work-team-pm.md` — PM Agent（需求分類）
- `agents/agent-work-team-plan-sd.md` — Plan/SA/SD Agent（技術規格產出）
- `hooks/hooks.json` + `hooks/sync-dashboard.mjs` — PostToolUse hook，每次相關的 `state.json` 被寫入時在背景自動重建需求總覽，不會出現在對話裡
- `skills/example-planning` — 佔位 skill（尚待後續功能取代）

需求總覽是**使用者專案**裡自動維護的 `.agent-work-team/dashboard.md` 檔案，不在這個 plugin repo 裡，直接開來看即可，不需要呼叫任何指令。

規劃階段的完整流程設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`，實作計畫見 `docs/superpowers/plans/`。
```

- [ ] **Step 2: Update `CLAUDE.md`'s "目前狀態" section**

The current section reads:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，每次狀態變更由 `/agent-work-team` 自動同步；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

Replace it with:

```markdown
## 目前狀態

- Planning 階段第一版已實作：`/agent-work-team` 驅動 PM → BA → Plan/SA/SD 流程
- 需求總覽是自動維護的 `.agent-work-team/dashboard.md` 檔案，由 `hooks/sync-dashboard.mjs`（`PostToolUse` hook）在背景同步，不是 command 自己做，也不會出現在對話裡；`/agent-work-team-dashboard` 只是備用的手動重建指令
- 狀態與各階段產出以檔案形式存在**使用者專案**的 `.agent-work-team/requests/` 底下，這個 plugin repo 本身不存放任何需求資料
- 完整設計見 `docs/superpowers/specs/2026-07-04-agent-work-team-planning-design.md`
- Developer/Review/Knowledge Agent 尚未實作，屬於後續版本
```

- [ ] **Step 3: Verify both files updated**

Run: `grep -c 'hooks/sync-dashboard.mjs' README.md && grep -c 'hooks/sync-dashboard.mjs' CLAUDE.md`
Expected: both counts `>= 1`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the PostToolUse dashboard-sync hook in project docs"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–5.

- [ ] **Step 1: Confirm final tree**

Run: `find hooks -type f && grep -c '同步 dashboard' commands/agent-work-team.md`
Expected output:
```
hooks/hooks.json
hooks/sync-dashboard.mjs
hooks/sync-dashboard.test.mjs
0
```

- [ ] **Step 2: Manually verify the hook fires silently in a live session (user-driven, not scriptable)**

In a scratch project where this plugin is installed (reinstall/update it first if it was installed before this change — see this repo's README), run:

1. `/agent-work-team "測試用需求描述"` — confirm `.agent-work-team/dashboard.md` is created and updated as the request progresses through every stage, and that **no hook-related output or tool-call noise appears in the conversation** at any point.
2. In the same project, ask Claude to create or edit some unrelated file (e.g. `echo hi > scratch.txt` via Write) — confirm this does not touch `.agent-work-team/dashboard.md` and produces no hook-related output.
3. Delete `.agent-work-team/dashboard.md`, then run `/agent-work-team-dashboard` — confirm it's rebuilt and the table is shown inline in the reply.
4. Delete all `.agent-work-team/requests/*` folders, then run `/agent-work-team-dashboard` again — confirm it reports no requests and does not (re)create `dashboard.md`.

This step is manual because observing hook execution silence and live file updates in an interactive Claude Code session is not something scriptable via Bash.
