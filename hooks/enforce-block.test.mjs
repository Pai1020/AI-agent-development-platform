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
