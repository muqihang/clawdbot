import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_FLAG_DEFAULTS = Object.freeze({
  'memory.jarvis.enabled': false,
  'memory.jarvis.read_mode': 'local',
  'memory.jarvis.write_mode': 'off',
  'memory.jarvis.cutover_percent': 0,
  'memory.jarvis.backfill.enabled': false,
  'security.auth_claim_mapping.enabled': false,
  'security.mtls.required': false,
  'governance.approval_api.enabled': false,
  'governance.approval_api.require_audit_write': true,
  'governance.data_policy.enforced': false,
  'governance.forgetting.purge_enabled': false,
  'quota.enforced': false,
  'quota.hard_block.enabled': false,
  'replay.auto.enabled': false,
  'replay.partition_strict.enabled': true,
});

const REQUIRED_FLAG_VERSION = 'jarvis-flags-contract-v1';

const DEFAULT_DIFF_JSON_PATH = resolve(
  process.cwd(),
  'analysis/Jarvis-Clawdbot活系统/contracts/d1-contract-diff.json',
);

const DEFAULT_DIFF_MD_PATH = resolve(
  process.cwd(),
  'analysis/Jarvis-Clawdbot活系统/contracts/d1-contract-diff.md',
);

const DEFAULT_FLAGS_PATH = resolve(
  process.cwd(),
  'analysis/Jarvis-Clawdbot活系统/contracts/flags-contract-v1.json',
);

const DEFAULT_LOCK_DOC_PATH = resolve(
  process.cwd(),
  'analysis/Jarvis-Clawdbot活系统/contracts/d1-contract-lock.md',
);

function parseJsonFile(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

function toFlagDefaultsMap(flags) {
  if (!Array.isArray(flags)) {
    return {};
  }

  const defaults = {};
  for (const item of flags) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (typeof item.name !== 'string') {
      continue;
    }

    defaults[item.name] = item.default;
  }

  return defaults;
}

function extractMarkdownDiffIds(markdown) {
  const ids = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      continue;
    }

    const columns = trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (columns.length < 3) {
      continue;
    }

    const firstColumn = columns[0];
    if (firstColumn === 'id' || firstColumn === '---') {
      continue;
    }

    ids.push(firstColumn);
  }

  return ids;
}

function readUnresolvedWithoutOwner(diffJson) {
  if (typeof diffJson?.unresolved_without_owner === 'number') {
    return Number.isFinite(diffJson.unresolved_without_owner)
      ? Math.max(0, Math.floor(diffJson.unresolved_without_owner))
      : 0;
  }

  if (!Array.isArray(diffJson?.diffs)) {
    return 0;
  }

  return diffJson.diffs.filter((item) => item?.status !== 'resolved' && !item?.owner).length;
}

function evaluateFlags(flagsContract) {
  const defaultsMap = toFlagDefaultsMap(flagsContract?.flags);

  const missing = [];
  const mismatch = [];

  for (const [name, expectedDefault] of Object.entries(CANONICAL_FLAG_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(defaultsMap, name)) {
      missing.push(name);
      continue;
    }

    if (defaultsMap[name] !== expectedDefault) {
      mismatch.push(name);
    }
  }

  const expectedNames = new Set(Object.keys(CANONICAL_FLAG_DEFAULTS));
  const unexpected = Object.keys(defaultsMap)
    .filter((name) => !expectedNames.has(name))
    .sort();

  return {
    versionMismatch: flagsContract?.version === REQUIRED_FLAG_VERSION ? 0 : 1,
    missing,
    mismatch,
    unexpected,
    expectedCount: expectedNames.size,
    actualCount: Object.keys(defaultsMap).length,
  };
}

function hasRequiredSignatures(lockMarkdown) {
  const requiredRoles = ['主审', 'DB', 'API', '插件'];

  for (const role of requiredRoles) {
    const rolePattern = new RegExp(`-\\s*${role}\\s*[：:]\\s*(.+)$`, 'm');
    const matched = lockMarkdown.match(rolePattern);
    if (!matched) {
      return false;
    }

    const normalized = matched[1].trim().toLowerCase();
    if (
      normalized === '' ||
      normalized.includes('pending') ||
      normalized.includes('todo') ||
      normalized.includes('待补')
    ) {
      return false;
    }
  }

  return true;
}

export function evaluateContractLock({
  diffJsonPath = DEFAULT_DIFF_JSON_PATH,
  diffMdPath = DEFAULT_DIFF_MD_PATH,
  flagsContractPath = DEFAULT_FLAGS_PATH,
  lockDocPath = DEFAULT_LOCK_DOC_PATH,
}) {
  const diffJson = parseJsonFile(diffJsonPath);
  const flagsContract = parseJsonFile(flagsContractPath);
  const diffMarkdown = readFileSync(diffMdPath, 'utf8');
  const lockMarkdown = readFileSync(lockDocPath, 'utf8');

  const unresolvedWithoutOwner = readUnresolvedWithoutOwner(diffJson);

  const diffIds = Array.isArray(diffJson?.diffs)
    ? diffJson.diffs
        .map((item) => item?.id)
        .filter((value) => typeof value === 'string')
    : [];

  const markdownDiffIds = new Set(extractMarkdownDiffIds(diffMarkdown));
  const diffIdsMissingInMarkdown = diffIds.filter((id) => !markdownDiffIds.has(id));

  const flagEvaluation = evaluateFlags(flagsContract);
  const requiredSignaturesReady = hasRequiredSignatures(lockMarkdown);

  const unresolved =
    unresolvedWithoutOwner +
    diffIdsMissingInMarkdown.length +
    flagEvaluation.versionMismatch +
    flagEvaluation.missing.length +
    flagEvaluation.mismatch.length +
    flagEvaluation.unexpected.length +
    (requiredSignaturesReady ? 0 : 1);

  return {
    lock_ready: unresolved === 0,
    unresolved,
    unresolved_without_owner: unresolvedWithoutOwner,
    diff_id_missing_in_markdown: diffIdsMissingInMarkdown.length,
    missing_diff_ids: diffIdsMissingInMarkdown,
    flags_expected: flagEvaluation.expectedCount,
    flags_actual: flagEvaluation.actualCount,
    flags_missing: flagEvaluation.missing.length,
    missing_flag_names: flagEvaluation.missing,
    flags_default_mismatch: flagEvaluation.mismatch.length,
    flags_default_mismatch_names: flagEvaluation.mismatch,
    flags_unexpected: flagEvaluation.unexpected.length,
    flags_unexpected_names: flagEvaluation.unexpected,
    flag_contract_version_mismatch: flagEvaluation.versionMismatch,
    required_signatures_ready: requiredSignaturesReady,
    inputs: {
      diff_json: resolve(diffJsonPath),
      diff_markdown: resolve(diffMdPath),
      flags_contract: resolve(flagsContractPath),
      lock_doc: resolve(lockDocPath),
    },
  };
}

export function renderLockOutput(result) {
  return [
    `lock_ready=${result.lock_ready ? 'true' : 'false'}`,
    `unresolved=${result.unresolved}`,
    `unresolved_without_owner=${result.unresolved_without_owner}`,
    `diff_id_missing_in_markdown=${result.diff_id_missing_in_markdown}`,
    `flags_missing=${result.flags_missing}`,
    `flags_default_mismatch=${result.flags_default_mismatch}`,
    `flags_unexpected=${result.flags_unexpected}`,
    `flag_contract_version_mismatch=${result.flag_contract_version_mismatch}`,
    `required_signatures_ready=${result.required_signatures_ready ? 'true' : 'false'}`,
  ].join(' ');
}

function parseCliArgs(argv) {
  const args = {
    diffJsonPath: DEFAULT_DIFF_JSON_PATH,
    diffMdPath: DEFAULT_DIFF_MD_PATH,
    flagsContractPath: DEFAULT_FLAGS_PATH,
    lockDocPath: DEFAULT_LOCK_DOC_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const nextToken = argv[index + 1];

    if (token === '--diff-json' && typeof nextToken === 'string') {
      args.diffJsonPath = resolve(process.cwd(), nextToken);
      index += 1;
      continue;
    }

    if (token === '--diff-md' && typeof nextToken === 'string') {
      args.diffMdPath = resolve(process.cwd(), nextToken);
      index += 1;
      continue;
    }

    if (token === '--flags' && typeof nextToken === 'string') {
      args.flagsContractPath = resolve(process.cwd(), nextToken);
      index += 1;
      continue;
    }

    if (token === '--lock-doc' && typeof nextToken === 'string') {
      args.lockDocPath = resolve(process.cwd(), nextToken);
      index += 1;
      continue;
    }
  }

  return args;
}

export function runCheck(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const result = evaluateContractLock(args);
  process.stdout.write(`${renderLockOutput(result)}\n`);
  return result.lock_ready ? 0 : 1;
}

const modulePath = fileURLToPath(import.meta.url);
const isEntrypoint = typeof process.argv[1] === 'string' && resolve(process.argv[1]) === resolve(modulePath);

if (isEntrypoint) {
  try {
    process.exit(runCheck());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`lock_ready=false unresolved=1 reason=runtime_error message=${JSON.stringify(message)}\n`);
    process.exit(1);
  }
}
