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

test('collectRequests skips a request whose state.json is invalid JSON, keeping the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awt-test-'));
  mkdirSync(join(dir, '.agent-work-team/requests/RQ-001'), { recursive: true });
  writeFileSync(join(dir, '.agent-work-team/requests/RQ-001/state.json'), '{not valid json');
  mkdirSync(join(dir, '.agent-work-team/requests/RQ-002'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-work-team/requests/RQ-002/state.json'),
    JSON.stringify({ id: 'RQ-002', updated: '2026-07-04' }),
  );
  const requests = collectRequests(dir);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].id, 'RQ-002');
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
