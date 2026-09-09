import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCORE_DIMENSIONS = ['identification', 'evidence', 'scope', 'handoff'];

const REQUIRED_STRING_FIELDS = [
  'run_id',
  'case_id',
  'case_version',
  'phase',
  'host',
  'host_version',
  'model',
  'plugin_commit',
  'prompt_hash',
  'fixture_hash',
  'started_at',
  'evaluator',
  'status',
];

const NULLABLE_STRING_FIELDS = ['core_version', 'adapter_version'];

const REQUIRED_NUMBER_FIELDS = [
  'duration_seconds',
  'missed_important',
  'invalid_suggestions',
  'human_correction_minutes',
];

const VALID_PHASES = new Set(['before', 'after']);
const VALID_STATUSES = new Set(['completed', 'blocked']);

export function validateRun(record, { evidenceExists } = {}) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return ['record must be an object'];
  }

  const errors = [];

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== 'string' || record[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    const value = record[field];
    if (value !== null && typeof value !== 'string') {
      errors.push(`${field} must be a string or null`);
    }
  }

  for (const field of REQUIRED_NUMBER_FIELDS) {
    const value = record[field];
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  if (record.phase !== undefined && typeof record.phase === 'string' && !VALID_PHASES.has(record.phase)) {
    errors.push(`phase must be one of ${[...VALID_PHASES].join(', ')}`);
  }

  if (record.status !== undefined && typeof record.status === 'string' && !VALID_STATUSES.has(record.status)) {
    errors.push(`status must be one of ${[...VALID_STATUSES].join(', ')}`);
  }

  if (
    record.model_settings === undefined ||
    record.model_settings === null ||
    typeof record.model_settings !== 'object' ||
    Array.isArray(record.model_settings)
  ) {
    errors.push('model_settings must be an object');
  }

  if (!Array.isArray(record.hard_failures)) {
    errors.push('hard_failures must be an array');
  } else if (record.hard_failures.some(item => typeof item !== 'string')) {
    errors.push('hard_failures entries must be strings');
  }

  if (!record.scores || typeof record.scores !== 'object' || Array.isArray(record.scores)) {
    errors.push('scores must be an object with identification/evidence/scope/handoff');
  } else {
    for (const dimension of SCORE_DIMENSIONS) {
      const value = record.scores[dimension];
      if (!Number.isInteger(value) || value < 0 || value > 2) {
        errors.push(`scores.${dimension} must be an integer between 0 and 2`);
      }
    }
  }

  if (!record.score_reasons || typeof record.score_reasons !== 'object' || Array.isArray(record.score_reasons)) {
    errors.push('score_reasons must be an object with identification/evidence/scope/handoff');
  } else {
    for (const dimension of SCORE_DIMENSIONS) {
      const value = record.score_reasons[dimension];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`score_reasons.${dimension} must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    errors.push('evidence must be a non-empty array of paths');
  } else if (typeof evidenceExists !== 'function') {
    errors.push('evidenceExists check function is required to validate evidence paths');
  } else {
    for (const path of record.evidence) {
      if (typeof path !== 'string' || path.trim() === '') {
        errors.push('evidence entries must be non-empty strings');
        continue;
      }
      if (!evidenceExists(path)) {
        errors.push(`evidence file does not exist: ${path}`);
      }
    }
  }

  return errors;
}

export function resolveEvidencePath(runDir, evidencePath) {
  const absolutePath = resolve(runDir, evidencePath);
  const relativeToRunDir = relative(runDir, absolutePath);
  const escapesRunDir = relativeToRunDir.startsWith('..') || isAbsolute(relativeToRunDir);
  return { absolutePath, escapesRunDir };
}

export function checkRunIdUniqueness(runId, existingRunIds) {
  return existingRunIds.includes(runId) ? [`run_id already used by another run: ${runId}`] : [];
}

export function guardBaselineOverwrite(targetPath, fileExists) {
  const isBaselinePath = targetPath.split(/[\\/]/).includes('baselines');
  if (isBaselinePath && fileExists(targetPath)) {
    return [`refusing to overwrite existing baseline file: ${targetPath}`];
  }
  return [];
}

function collectExistingRunIds(resultsRoot, excludeFile) {
  const runIds = [];
  if (!existsSync(resultsRoot)) return runIds;
  const excludeAbsolute = resolve(excludeFile);
  const stack = [resultsRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'run.json' && resolve(fullPath) !== excludeAbsolute) {
        try {
          const data = JSON.parse(readFileSync(fullPath, 'utf8'));
          if (typeof data.run_id === 'string') runIds.push(data.run_id);
        } catch {
          // Unreadable sibling run files are reported when they are themselves validated directly.
        }
      }
    }
  }
  return runIds;
}

function main(argv) {
  const runFileArg = argv[2];
  const resultsDirArg = argv[3];

  if (!runFileArg) {
    console.error('usage: node evals/quality/record.mjs <run.json> [resultsDir]');
    process.exit(1);
  }

  const runFile = resolve(runFileArg);
  if (!existsSync(runFile)) {
    console.error(`run file not found: ${runFile}`);
    process.exit(1);
  }

  let record;
  try {
    record = JSON.parse(readFileSync(runFile, 'utf8'));
  } catch (error) {
    console.error(`invalid JSON in ${runFile}: ${error.message}`);
    process.exit(1);
  }

  const runDir = dirname(runFile);
  const errors = validateRun(record, {
    evidenceExists: evidencePath => {
      const { absolutePath, escapesRunDir } = resolveEvidencePath(runDir, evidencePath);
      if (escapesRunDir) return false;
      return existsSync(absolutePath) && statSync(absolutePath).isFile();
    },
  });

  if (Array.isArray(record.evidence)) {
    for (const evidencePath of record.evidence) {
      if (typeof evidencePath !== 'string') continue;
      const { escapesRunDir } = resolveEvidencePath(runDir, evidencePath);
      if (escapesRunDir) {
        errors.push(`evidence path escapes run directory: ${evidencePath}`);
      }
    }
  }

  const resultsRoot = resultsDirArg
    ? resolve(resultsDirArg)
    : resolve(dirname(fileURLToPath(import.meta.url)), 'results');

  if (typeof record.run_id === 'string' && record.run_id.trim() !== '') {
    const existingRunIds = collectExistingRunIds(resultsRoot, runFile);
    errors.push(...checkRunIdUniqueness(record.run_id, existingRunIds));
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`valid: ${basename(runFile)} (run_id=${record.run_id})`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
