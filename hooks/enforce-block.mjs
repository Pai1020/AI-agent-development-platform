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
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `⚠️ agent-work-team: 需求 ${result.requestId} 已超過重試上限（fix_rounds／needs_context_rounds／final_review_fix_rounds 其中之一超過 2），state.json 已被自動設為 Blocked。請立即停止 Development 流程、不要再重新 dispatch，並把這個狀況回報給使用者。`,
      },
    }));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`enforce-block: failed to enforce block: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
