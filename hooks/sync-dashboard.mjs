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
