# Agent Work Team Enforce Block Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic `PostToolUse` hook backstop that forces `state.json` to `Blocked` whenever any of the three retry counters in `dev/progress.json` exceed 2, so the Development stage can't silently keep retrying past its limit even if the Controller's own prompt-level check is skipped.

**Architecture:** `hooks/enforce-block.mjs` mirrors `hooks/sync-dashboard.mjs`'s shape (pure, unit-tested functions + a thin hook-mode CLI entrypoint), fires on every `Write`, self-filters to only act on `.agent-work-team/requests/<id>/dev/progress.json`, and — unlike the dashboard hook — is deliberately **not** silent when it actually intervenes: its output must reach the Controller so it notices and stops. It reuses `sync-dashboard.mjs`'s already-exported `rebuildDashboard` to keep the dashboard in sync after it flips `state.json`.

**Tech Stack:** Node.js (ESM, `node:fs`/`node:path`/`node:url` built-ins only), Node's built-in test runner (`node --test`).

## Global Constraints

- Threshold: any of `fix_rounds` (per task), `needs_context_rounds` (per task), or `final_review_fix_rounds` (top-level) strictly greater than 2.
- Self-filter path: `.agent-work-team/requests/<id>/dev/progress.json` (path-separator-normalized, same style as `sync-dashboard.mjs`'s `matchesStateJsonPath`). Anything else: exit 0, no output.
- On exceeding the threshold: read the sibling `state.json` (one directory up from `dev/`). If its `status` is not already `"Blocked"`, set `status: "Blocked"`, `waiting_on: "Human"`, write it back, then call `rebuildDashboard(cwd)` (imported from `./sync-dashboard.mjs`) so `dashboard.md` reflects it.
- **Do not use `suppressOutput` when a fresh block was just applied** — print a clear, visible message telling the Controller to stop and report to the user. If the request was already `Blocked` (no new transition), stay silent (exit 0, no output) to avoid repeat noise on every subsequent write.
- On any real failure (unreadable/corrupt `progress.json` or `state.json`): stderr message, exit 2.
- No dependency on `sync-dashboard.mjs`'s internal state beyond its exported `rebuildDashboard` function.

---

### Task 1: `hooks/enforce-block.mjs`, unit tested

**Files:**
- Create: `hooks/enforce-block.mjs`
- Create: `hooks/enforce-block.test.mjs`

**Interfaces:**
- Consumes: `rebuildDashboard(cwd)` from `hooks/sync-dashboard.mjs` (already exported, unchanged signature).
- Produces: named exports `matchesProgressJsonPath(filePath)`, `exceedsThreshold(progress)`, `enforceBlock(progressFilePath, cwd)` — `enforceBlock` returns `{ blocked: boolean, alreadyBlocked: boolean, requestId?: string }`.

- [ ] **Step 1: Write the failing tests**

Create `hooks/enforce-block.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesProgressJsonPath, exceedsThreshold, enforceBlock } from './enforce-block.mjs';

test('matchesProgressJsonPath matches the expected pattern', () => {
  assert.equal(matchesProgressJsonPath('.agent-work-team/requests/RQ-001/dev/progress.json'), true);
  assert.equal(matchesProgressJsonPath('/abs/path/.agent-work-team/requests/RQ-001/dev/progress.json'), true);
  assert.equal(matchesProgressJsonPath('C:\\abs\\.agent-work-team\\requests\\RQ-001\\dev\\progress.json'), true);
  assert.equal(matchesProgressJsonPath('.agent-work-team/requests/RQ-001/state.json'), false);
  assert.equal(matchesProgressJsonPath('.agent-work-team/requests/RQ-001/dev/T1-report.json'), false);
  assert.equal(matchesProgressJsonPath('foo.txt'), false);
  assert.equal(matchesProgressJsonPath(undefined), false);
});

test('exceedsThreshold is false when every counter is at or below 2', () => {
  assert.equal(exceedsThreshold({
    tasks: [{ id: 'T1', fix_rounds: 2, needs_context_rounds: 2 }],
    final_review_fix_rounds: 2,
  }), false);
});

test('exceedsThreshold is true when a task fix_rounds exceeds 2', () => {
  assert.equal(exceedsThreshold({
    tasks: [{ id: 'T1', fix_rounds: 3, needs_context_rounds: 0 }],
    final_review_fix_rounds: 0,
  }), true);
});

test('exceedsThreshold is true when a task needs_context_rounds exceeds 2', () => {
  assert.equal(exceedsThreshold({
    tasks: [{ id: 'T1', fix_rounds: 0, needs_context_rounds: 3 }],
    final_review_fix_rounds: 0,
  }), true);
});

test('exceedsThreshold is true when final_review_fix_rounds exceeds 2', () => {
  assert.equal(exceedsThreshold({
    tasks: [{ id: 'T1', fix_rounds: 0, needs_context_rounds: 0 }],
    final_review_fix_rounds: 3,
  }), true);
});

function setupRequest(dir, { fixRounds = 0, status = 'Running' } = {}) {
  mkdirSync(join(dir, '.agent-work-team/requests/RQ-001/dev'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-work-team/requests/RQ-001/dev/progress.json'),
    JSON.stringify({
      base_branch: 'main',
      tasks: [{ id: 'T1', status: 'in_progress', commits: [], fix_rounds: fixRounds, needs_context_rounds: 0 }],
      final_review_fix_rounds: 0,
    }),
  );
  writeFileSync(
    join(dir, '.agent-work-team/requests/RQ-001/state.json'),
    JSON.stringify({
      id: 'RQ-001', name: 'Test', type: 'New Feature', source: 'User', team: 'New Feature Team',
      priority: 'High', progress: 70, current_stage: 'DEVELOPING', current_agent: 'Developer Agent',
      status, waiting_on: null, created: '2026-07-05', updated: '2026-07-05',
    }),
  );
}

test('enforceBlock does nothing when the threshold is not exceeded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  setupRequest(dir, { fixRounds: 1 });
  const result = enforceBlock('.agent-work-team/requests/RQ-001/dev/progress.json', dir);
  assert.deepEqual(result, { blocked: false, alreadyBlocked: false });
  const state = JSON.parse(readFileSync(join(dir, '.agent-work-team/requests/RQ-001/state.json'), 'utf8'));
  assert.equal(state.status, 'Running');
});

test('enforceBlock sets state.json to Blocked when the threshold is exceeded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  setupRequest(dir, { fixRounds: 3 });
  const result = enforceBlock('.agent-work-team/requests/RQ-001/dev/progress.json', dir);
  assert.equal(result.blocked, true);
  assert.equal(result.alreadyBlocked, false);
  assert.equal(result.requestId, 'RQ-001');
  const state = JSON.parse(readFileSync(join(dir, '.agent-work-team/requests/RQ-001/state.json'), 'utf8'));
  assert.equal(state.status, 'Blocked');
  assert.equal(state.waiting_on, 'Human');
  assert.ok(existsSync(join(dir, '.agent-work-team/dashboard.md')), 'rebuildDashboard should have run');
});

test('enforceBlock reports alreadyBlocked without re-writing when state.json is already Blocked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  setupRequest(dir, { fixRounds: 3, status: 'Blocked' });
  const result = enforceBlock('.agent-work-team/requests/RQ-001/dev/progress.json', dir);
  assert.equal(result.blocked, true);
  assert.equal(result.alreadyBlocked, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test hooks/enforce-block.test.mjs`
Expected: FAIL — `Cannot find module './enforce-block.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Write `hooks/enforce-block.mjs`**

Create `hooks/enforce-block.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rebuildDashboard } from './sync-dashboard.mjs';

const THRESHOLD = 2;

export function matchesProgressJsonPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/');
  return /(^|\/)\.agent-work-team\/requests\/[^/]+\/dev\/progress\.json$/.test(normalized);
}

export function exceedsThreshold(progress) {
  if (typeof progress?.final_review_fix_rounds === 'number' && progress.final_review_fix_rounds > THRESHOLD) {
    return true;
  }
  if (Array.isArray(progress?.tasks)) {
    for (const task of progress.tasks) {
      if (typeof task.fix_rounds === 'number' && task.fix_rounds > THRESHOLD) return true;
      if (typeof task.needs_context_rounds === 'number' && task.needs_context_rounds > THRESHOLD) return true;
    }
  }
  return false;
}

export function enforceBlock(progressFilePath, cwd = process.cwd()) {
  const absProgressPath = resolve(cwd, progressFilePath);
  const progress = JSON.parse(readFileSync(absProgressPath, 'utf8'));

  if (!exceedsThreshold(progress)) {
    return { blocked: false, alreadyBlocked: false };
  }

  const requestDir = dirname(dirname(absProgressPath));
  const stateFilePath = resolve(requestDir, 'state.json');
  const state = JSON.parse(readFileSync(stateFilePath, 'utf8'));

  if (state.status === 'Blocked') {
    return { blocked: true, alreadyBlocked: true, requestId: state.id };
  }

  state.status = 'Blocked';
  state.waiting_on = 'Human';
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');

  rebuildDashboard(cwd);

  return { blocked: true, alreadyBlocked: false, requestId: state.id };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`enforce-block: failed to parse hook input: ${err.message}\n`);
    process.exit(2);
  }

  const filePath = input?.tool_input?.file_path;
  if (!matchesProgressJsonPath(filePath)) {
    process.exit(0);
  }

  try {
    const result = enforceBlock(filePath, input.cwd || process.cwd());
    if (!result.blocked || result.alreadyBlocked) {
      process.exit(0);
    }
    process.stdout.write(
      `⚠️ agent-work-team: 需求 ${result.requestId} 已超過重試上限（fix_rounds／needs_context_rounds／final_review_fix_rounds 其中之一超過 2），state.json 已被自動設為 Blocked。請立即停止 Development 流程、不要再重新 dispatch，並把這個狀況回報給使用者。\n`,
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`enforce-block: failed to enforce block: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test hooks/enforce-block.test.mjs`
Expected: PASS — all 8 tests green, `# pass 8`, `# fail 0`.

- [ ] **Step 5: Manually verify the CLI entrypoint (hook mode)**

Run (from repo root):

```bash
CHECK_DIR_UNIX=$(mktemp -d)
CHECK_DIR=$(cygpath -w "$CHECK_DIR_UNIX" 2>/dev/null | tr '\\' '/' || echo "$CHECK_DIR_UNIX")
SCRIPT_PATH="$(pwd)/hooks/enforce-block.mjs"
mkdir -p "$CHECK_DIR_UNIX/.agent-work-team/requests/RQ-001/dev"
cat > "$CHECK_DIR_UNIX/.agent-work-team/requests/RQ-001/dev/progress.json" <<'EOF'
{"base_branch":"main","tasks":[{"id":"T1","status":"in_progress","commits":[],"fix_rounds":3,"needs_context_rounds":0}],"final_review_fix_rounds":0}
EOF
cat > "$CHECK_DIR_UNIX/.agent-work-team/requests/RQ-001/state.json" <<'EOF'
{"id":"RQ-001","name":"CLI Check","type":"New Feature","source":"User","team":"New Feature Team","priority":"High","progress":70,"current_stage":"DEVELOPING","current_agent":"Developer Agent","status":"Running","waiting_on":null,"created":"2026-07-05","updated":"2026-07-05"}
EOF
echo "{\"tool_input\":{\"file_path\":\".agent-work-team/requests/RQ-001/dev/progress.json\"},\"cwd\":\"$CHECK_DIR\"}" | node "$SCRIPT_PATH"
echo "exit:$?"
cat "$CHECK_DIR_UNIX/.agent-work-team/requests/RQ-001/state.json"
```

Expected:
- A visible warning line printed to stdout mentioning `RQ-001` and telling the Controller to stop (not a `{"suppressOutput":true}` blob).
- `exit:0`.
- `state.json`'s `status` is now `"Blocked"` and `waiting_on` is `"Human"`.

- [ ] **Step 6: Commit**

```bash
git add hooks/enforce-block.mjs hooks/enforce-block.test.mjs
git commit -m "Add enforce-block hook: deterministic backstop for the fix-round threshold"
```

---

### Task 2: Wire the hook into `hooks/hooks.json`

**Files:**
- Modify: `hooks/hooks.json`

**Interfaces:**
- Consumes: `hooks/enforce-block.mjs` from Task 1.

- [ ] **Step 1: Overwrite `hooks/hooks.json` with this exact content**

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
          },
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-block.mjs\"",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON syntax and coverage**

Run: `node -e "const h = JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf8')); const cmds = h.hooks.PostToolUse[0].hooks.map(x => x.command); if (!cmds.some(c => c.includes('sync-dashboard.mjs'))) throw new Error('missing sync-dashboard'); if (!cmds.some(c => c.includes('enforce-block.mjs'))) throw new Error('missing enforce-block'); console.log('VALID', cmds.length)"`
Expected: `VALID 2` printed, no error thrown.

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "Wire enforce-block.mjs into the PostToolUse Write hook alongside sync-dashboard.mjs"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (manual verification only, no files created).

**Interfaces:**
- Consumes: everything produced in Tasks 1–2.

- [ ] **Step 1: Confirm final tree**

Run: `find hooks -type f`
Expected output:
```
hooks/enforce-block.mjs
hooks/enforce-block.test.mjs
hooks/hooks.json
hooks/sync-dashboard.mjs
hooks/sync-dashboard.test.mjs
```

- [ ] **Step 2: Manually verify in a live session (user-driven, not scriptable)**

In a scratch project where this plugin is installed and updated:

1. Run `/agent-work-team-develop` through a task that fails review twice (per the existing manual-testing checklist's Test 3/4 technique). On the 3rd failed review (`fix_rounds` becomes 3), confirm the flow stops and reports `Blocked` — same as before.
2. Now simulate the Controller *missing* its own check: manually edit `dev/progress.json` for a task to set `fix_rounds` to 3 while `state.json`'s `status` is still `"Running"` (simulating a skipped check), then have Claude make any unrelated `Write` call in the same project (e.g. ask it to write a scratch file) to trigger the hook.
3. Confirm a visible warning appears mentioning the request ID and telling the Controller to stop — this should NOT be silent/suppressed.
4. Confirm `state.json` is now `"Blocked"`/`waiting_on: "Human"`, and `dashboard.md` reflects it, without you having to run `/agent-work-team-dashboard`.
5. Trigger another unrelated `Write` in the same project — confirm the hook now stays silent (no repeat warning) since the request was already `Blocked`.
6. Make an unrelated `Write` in a part of the project with no `.agent-work-team/` directory at all — confirm no output, no error, no interference.

This step is manual because observing hook output visibility and live state transitions in an interactive Claude Code session is not something scriptable via Bash.
