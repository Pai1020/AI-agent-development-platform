import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateRun,
  resolveEvidencePath,
  checkRunIdUniqueness,
  guardBaselineOverwrite,
} from './record.mjs';

const RECORD_CLI = fileURLToPath(new URL('./record.mjs', import.meta.url));

const validScores = { identification: 2, evidence: 2, scope: 2, handoff: 2 };
const validReasons = {
  identification: '正確辨識既有 normalizeName',
  evidence: '引用 src/normalize-name.mjs:normalizeName',
  scope: '未修改產品程式碼',
  handoff: '交接內容完整',
};

function buildRecord(overrides = {}) {
  return {
    run_id: 'Q1-before-1',
    case_id: 'Q1',
    case_version: 'quality-v1',
    phase: 'before',
    host: 'Claude Code',
    host_version: 'test-harness',
    model: 'test-model',
    model_settings: {},
    plugin_commit: 'deadbeef',
    prompt_hash: 'abc123',
    fixture_hash: 'def456',
    core_version: null,
    adapter_version: null,
    started_at: '2026-09-09T00:00:00Z',
    duration_seconds: 1,
    evidence: ['transcript.txt'],
    evaluator: 'human',
    scores: validScores,
    score_reasons: validReasons,
    missed_important: 0,
    invalid_suggestions: 0,
    human_correction_minutes: 0,
    hard_failures: [],
    status: 'completed',
    ...overrides,
  };
}

test('valid record with existing evidence has no errors', () => {
  const errors = validateRun(buildRecord(), { evidenceExists: () => true });
  assert.deepEqual(errors, []);
});

test('missing evidence cannot become a valid run', () => {
  const errors = validateRun(
    { run_id: 'Q1-before-1', evidence: ['missing.txt'] },
    { evidenceExists: () => false },
  );
  assert.ok(errors.some(e => e.includes('evidence')));
});

test('missing model and version fields are reported', () => {
  const record = buildRecord({ model: '', host_version: undefined });
  const errors = validateRun(record, { evidenceExists: () => true });
  assert.ok(errors.some(e => e.startsWith('model ')));
  assert.ok(errors.some(e => e.startsWith('host_version ')));
});

test('core_version/adapter_version accept null but not other non-string types', () => {
  const okErrors = validateRun(buildRecord({ core_version: null, adapter_version: null }), {
    evidenceExists: () => true,
  });
  assert.deepEqual(okErrors, []);
  const badErrors = validateRun(buildRecord({ core_version: 42 }), { evidenceExists: () => true });
  assert.ok(badErrors.some(e => e.includes('core_version')));
});

test('out-of-range and non-integer scores are rejected', () => {
  const tooHigh = validateRun(buildRecord({ scores: { ...validScores, identification: 3 } }), {
    evidenceExists: () => true,
  });
  assert.ok(tooHigh.some(e => e.includes('scores.identification')));

  const fractional = validateRun(buildRecord({ scores: { ...validScores, evidence: 1.5 } }), {
    evidenceExists: () => true,
  });
  assert.ok(fractional.some(e => e.includes('scores.evidence')));
});

test('missing score reasons are rejected', () => {
  const record = buildRecord({ score_reasons: { ...validReasons, handoff: '' } });
  const errors = validateRun(record, { evidenceExists: () => true });
  assert.ok(errors.some(e => e.includes('score_reasons.handoff')));
});

test('negative defect counters are rejected', () => {
  const errors = validateRun(buildRecord({ missed_important: -1 }), { evidenceExists: () => true });
  assert.ok(errors.some(e => e.includes('missed_important')));
});

test('unknown phase or status values are rejected', () => {
  const badPhase = validateRun(buildRecord({ phase: 'during' }), { evidenceExists: () => true });
  assert.ok(badPhase.some(e => e.includes('phase')));

  const badStatus = validateRun(buildRecord({ status: 'passed' }), { evidenceExists: () => true });
  assert.ok(badStatus.some(e => e.includes('status')));
});

test('checkRunIdUniqueness rejects duplicates and accepts unique ids', () => {
  assert.ok(checkRunIdUniqueness('Q1-before-1', ['Q1-before-1']).length > 0);
  assert.deepEqual(checkRunIdUniqueness('Q1-before-1', ['Q2-before-1']), []);
});

test('resolveEvidencePath flags paths that escape the run directory', () => {
  const runDir = join(tmpdir(), 'quality-eval-test-runid');
  const inside = resolveEvidencePath(runDir, 'transcript.txt');
  assert.equal(inside.escapesRunDir, false);
  const outside = resolveEvidencePath(runDir, '../../secret.txt');
  assert.equal(outside.escapesRunDir, true);
});

test('guardBaselineOverwrite refuses to overwrite an existing baseline file only', () => {
  const blocked = guardBaselineOverwrite('evals/quality/baselines/quality-v1.json', () => true);
  assert.ok(blocked.length > 0);
  const allowedNew = guardBaselineOverwrite('evals/quality/baselines/quality-v1.json', () => false);
  assert.deepEqual(allowedNew, []);
  const nonBaselinePath = guardBaselineOverwrite('evals/quality/results/before/Q1-before-1/run.json', () => true);
  assert.deepEqual(nonBaselinePath, []);
});

test('CLI exits 0 for a valid run and 1 with an evidence message for an invalid run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-eval-cli-'));
  try {
    writeFileSync(join(dir, 'transcript.txt'), 'evidence contents');
    const validRunFile = join(dir, 'run.json');
    writeFileSync(validRunFile, JSON.stringify(buildRecord()));
    const emptyResultsDir = join(dir, 'empty-results');
    mkdirSync(emptyResultsDir);
    const validResult = spawnSync(process.execPath, [RECORD_CLI, validRunFile, emptyResultsDir]);
    assert.equal(validResult.status, 0, validResult.stderr.toString());

    const invalidDir = join(dir, 'invalid');
    mkdirSync(invalidDir);
    const invalidRunFile = join(invalidDir, 'run.json');
    writeFileSync(invalidRunFile, JSON.stringify(buildRecord({ evidence: ['missing.txt'] })));
    const invalidResult = spawnSync(process.execPath, [RECORD_CLI, invalidRunFile, emptyResultsDir]);
    assert.equal(invalidResult.status, 1);
    assert.ok(invalidResult.stderr.toString().includes('evidence'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI rejects an evidence path that escapes the run directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-eval-cli-escape-'));
  try {
    const runFile = join(dir, 'run.json');
    writeFileSync(runFile, JSON.stringify(buildRecord({ evidence: ['../outside.txt'] })));
    const emptyResultsDir = join(dir, 'empty-results');
    mkdirSync(emptyResultsDir);
    const result = spawnSync(process.execPath, [RECORD_CLI, runFile, emptyResultsDir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.toString().includes('escapes'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI rejects a duplicate run_id across sibling run files in the same results tree', () => {
  const resultsDir = mkdtempSync(join(tmpdir(), 'quality-eval-results-'));
  try {
    const beforeDir = join(resultsDir, 'before');
    mkdirSync(beforeDir);

    const runADir = join(beforeDir, 'Q1-before-1');
    mkdirSync(runADir);
    writeFileSync(join(runADir, 'transcript.txt'), 'x');
    writeFileSync(join(runADir, 'run.json'), JSON.stringify(buildRecord()));

    const runBDir = join(beforeDir, 'Q1-before-1-dup');
    mkdirSync(runBDir);
    writeFileSync(join(runBDir, 'transcript.txt'), 'x');
    const dupRunFile = join(runBDir, 'run.json');
    writeFileSync(dupRunFile, JSON.stringify(buildRecord()));

    const result = spawnSync(process.execPath, [RECORD_CLI, dupRunFile, resultsDir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.toString().includes('run_id'));
  } finally {
    rmSync(resultsDir, { recursive: true, force: true });
  }
});

test('CLI accepts a unique run_id against an existing results tree', () => {
  const resultsDir = mkdtempSync(join(tmpdir(), 'quality-eval-results-unique-'));
  try {
    const beforeDir = join(resultsDir, 'before');
    mkdirSync(beforeDir);

    const runADir = join(beforeDir, 'Q1-before-1');
    mkdirSync(runADir);
    writeFileSync(join(runADir, 'transcript.txt'), 'x');
    writeFileSync(join(runADir, 'run.json'), JSON.stringify(buildRecord()));

    const runBDir = join(beforeDir, 'Q1-before-2');
    mkdirSync(runBDir);
    writeFileSync(join(runBDir, 'transcript.txt'), 'x');
    const uniqueRunFile = join(runBDir, 'run.json');
    writeFileSync(uniqueRunFile, JSON.stringify(buildRecord({ run_id: 'Q1-before-2' })));

    const result = spawnSync(process.execPath, [RECORD_CLI, uniqueRunFile, resultsDir]);
    assert.equal(result.status, 0, result.stderr.toString());
  } finally {
    rmSync(resultsDir, { recursive: true, force: true });
  }
});
