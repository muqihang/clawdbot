#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_EVIDENCE = [
  { rel: 'contracts/d1-contract-diff.md', type: 'md' },
  { rel: 'contracts/d1-contract-lock.md', type: 'md' },
  { rel: 'evidence/p0-1-batch001-verify.log', type: 'log' },
  { rel: 'evidence/p0-1-approval-api-test.json', type: 'json' },
  { rel: 'evidence/p0-1-audit-completeness.json', type: 'json' },
  { rel: 'evidence/p0-2-batch002-verify.log', type: 'log' },
  { rel: 'evidence/p0-2-auth-matrix.json', type: 'json' },
  { rel: 'evidence/p0-2-clawdbot-auth-e2e.json', type: 'json' },
  { rel: 'evidence/p0-3-batch003-verify.log', type: 'log' },
  { rel: 'evidence/p0-3-cutover-api-test.json', type: 'json' },
  { rel: 'evidence/d11-backfill-report.json', type: 'json' },
  { rel: 'evidence/d11-shadow-report.json', type: 'json' },
  { rel: 'evidence/p0-3-rollback-drill.log', type: 'log' },
  { rel: 'evidence/p0-supabase-cloud-drill-report.md', type: 'md' },
  { rel: 'evidence/p1-4-batch004-verify.log', type: 'log' },
  { rel: 'evidence/p1-4-governance-policy-report.json', type: 'json' },
  { rel: 'evidence/p1-5-batch005-verify.log', type: 'log' },
  { rel: 'evidence/p1-5-quota-api-test.json', type: 'json' },
  { rel: 'evidence/p1-5-quota-alert-latency.json', type: 'json' },
  { rel: 'evidence/p1-6-batch006-verify.log', type: 'log' },
  { rel: 'evidence/p1-6-replay-api-test.json', type: 'json' },
  { rel: 'evidence/p1-6-replay-determinism-report.json', type: 'json' },
  { rel: 'evidence/d12-fault-drill.json', type: 'json' },
  { rel: 'evidence/d12-fault-drill.md', type: 'md' },
  { rel: 'evidence/p1-staging-baseline-fix-report.md', type: 'md' },
  { rel: 'evidence/p1-schema-migrations-reconcile.md', type: 'md' },
];

const OPTIONAL_EVIDENCE = [
  { rel: 'contracts/d1-contract-diff.json', type: 'json' },
  { rel: 'contracts/flags-contract-v1.json', type: 'json' },
  { rel: 'evidence/p0-supabase-cloud-drill-report.json', type: 'json' },
  { rel: 'evidence/p1-schema-migrations-reconcile.json', type: 'json' },
  { rel: 'evidence/p1-staging-baseline-fix-report.json', type: 'json' },
];

const EPS = 1e-9;

function parseArgs(argv) {
  const args = {
    inDir: 'analysis/Jarvis-Clawdbot活系统/evidence',
    outFile: 'analysis/Jarvis-Clawdbot活系统/evidence/d13-gate-review.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--in' && next) {
      args.inDir = next;
      index += 1;
      continue;
    }
    if (current === '--out' && next) {
      args.outFile = next;
      index += 1;
      continue;
    }
  }

  return args;
}

function toSafeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll('%', '');
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
}

function toRatio(value) {
  const numeric = toSafeNumber(value);
  if (numeric === null) {
    return null;
  }
  if (numeric <= 1 + EPS && numeric >= -EPS) {
    return numeric;
  }
  if (numeric <= 100 + EPS && numeric >= -EPS) {
    return numeric / 100;
  }
  return numeric;
}

function normalizeStatus(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().toUpperCase();
}

function deepGet(object, expression) {
  if (object === null || object === undefined) {
    return undefined;
  }
  const normalized = expression.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter(Boolean);
  let cursor = object;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function deepFindByKey(object, keys) {
  const targets = new Set(keys);
  const stack = [object];
  while (stack.length > 0) {
    const cursor = stack.pop();
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      continue;
    }
    if (Array.isArray(cursor)) {
      for (const item of cursor) {
        stack.push(item);
      }
      continue;
    }
    for (const [key, value] of Object.entries(cursor)) {
      if (targets.has(key)) {
        return value;
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return undefined;
}

function pickValue(record, paths, fallbackKeys = []) {
  for (const candidate of paths) {
    const value = deepGet(record, candidate);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  if (fallbackKeys.length > 0) {
    const found = deepFindByKey(record, fallbackKeys);
    if (found !== undefined && found !== null) {
      return found;
    }
  }
  return null;
}

function pickRatio(record, paths, fallbackKeys = []) {
  const raw = pickValue(record, paths, fallbackKeys);
  return toRatio(raw);
}

function pickBool(record, paths, fallbackKeys = []) {
  const raw = pickValue(record, paths, fallbackKeys);
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['true', 'pass', 'passed', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', 'fail', 'failed', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  if (typeof raw === 'number') {
    return raw !== 0;
  }
  return null;
}

function ratioAtLeast(value, threshold) {
  if (value === null || value === undefined) {
    return false;
  }
  return value + EPS >= threshold;
}

function isPassStatus(value) {
  const normalized = normalizeStatus(value);
  if (!normalized) {
    return false;
  }
  return ['PASS', 'PASSED', 'SUCCESS', 'TRUE'].includes(normalized);
}

function testJsonPass(record) {
  const success = pickBool(record, ['success']);
  if (success === true) {
    return true;
  }
  const verifyStatus = normalizeStatus(pickValue(record, ['verify_result.status', 'verification.status', 'result.status']));
  if (verifyStatus && verifyStatus === 'PASS') {
    return true;
  }
  const judgementStatus = normalizeStatus(pickValue(record, ['judgement', 'judgement.result', 'result']));
  if (judgementStatus && judgementStatus === 'PASS') {
    return true;
  }
  const failedTests = toSafeNumber(pickValue(record, ['numFailedTests', 'num_failed_tests', 'verify_result.tests_failed', 'test_result.tests_failed']));
  const totalTests = toSafeNumber(pickValue(record, ['numTotalTests', 'num_total_tests', 'verify_result.tests_passed', 'test_result.tests_passed']));
  if (failedTests !== null && failedTests === 0 && totalTests !== null && totalTests >= 0) {
    return true;
  }
  return false;
}

function containsAll(text, patterns) {
  return patterns.every((pattern) => text.includes(pattern));
}

function parseRollBackDrill(logText) {
  const durationS = Number(logText.match(/duration_s=([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? NaN);
  const durationMs = Number(logText.match(/duration_ms=([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? NaN);
  const resolvedDuration = Number.isFinite(durationS)
    ? durationS
    : Number.isFinite(durationMs)
      ? durationMs / 1000
      : null;
  const afterReadMode = logText.match(/after\.read_mode=([^\n\r]+)/)?.[1]?.trim() ?? null;
  const afterCutoverPercent = toSafeNumber(logText.match(/after\.cutover_percent=([^\n\r]+)/)?.[1]?.trim() ?? null);
  const passFlagRaw = logText.match(/pass=([^\n\r]+)/)?.[1]?.trim() ?? null;
  const passFlag = passFlagRaw === null ? null : ['true', '1', 'pass'].includes(passFlagRaw.toLowerCase());

  return {
    duration_seconds: resolvedDuration,
    after_read_mode: afterReadMode,
    after_cutover_percent: afterCutoverPercent,
    pass_flag: passFlag,
  };
}

function buildEvidenceIndex(baseDir, rootDir, blockers, warnings) {
  const inventory = [];
  const indexed = new Map();

  function load(entry, required) {
    const absPath = path.resolve(rootDir, entry.rel);
    const output = {
      path: entry.rel,
      absolute_path: absPath,
      required,
      type: entry.type,
      exists: false,
      parseable: false,
      non_empty: false,
      size_bytes: 0,
      parse_error: null,
    };

    if (!fs.existsSync(absPath)) {
      if (required) {
        blockers.push(`缺失证据文件: ${entry.rel}`);
      }
      inventory.push(output);
      indexed.set(entry.rel, output);
      return;
    }

    output.exists = true;
    const content = fs.readFileSync(absPath, 'utf8');
    output.size_bytes = Buffer.byteLength(content, 'utf8');
    output.non_empty = content.trim().length > 0;

    if (!output.non_empty) {
      output.parse_error = 'empty_file';
      if (required) {
        blockers.push(`证据文件为空: ${entry.rel}`);
      } else {
        warnings.push(`可选证据为空: ${entry.rel}`);
      }
      inventory.push(output);
      indexed.set(entry.rel, output);
      return;
    }

    if (entry.type === 'json') {
      try {
        output.json = JSON.parse(content);
        output.parseable = true;
      } catch (error) {
        output.parse_error = String(error?.message ?? error);
        if (required) {
          blockers.push(`JSON 解析失败: ${entry.rel} (${output.parse_error})`);
        } else {
          warnings.push(`可选 JSON 解析失败: ${entry.rel} (${output.parse_error})`);
        }
      }
    } else {
      output.text = content;
      output.parseable = true;
    }

    inventory.push(output);
    indexed.set(entry.rel, output);
  }

  for (const required of REQUIRED_EVIDENCE) {
    load(required, true);
  }
  for (const optional of OPTIONAL_EVIDENCE) {
    load(optional, false);
  }

  const requiredTotal = inventory.filter((item) => item.required).length;
  const requiredReady = inventory.filter((item) => item.required && item.exists && item.parseable && item.non_empty).length;

  return {
    in_dir: baseDir,
    root_dir: rootDir,
    required_total: requiredTotal,
    required_ready: requiredReady,
    optional_total: OPTIONAL_EVIDENCE.length,
    missing_required: inventory.filter((item) => item.required && !item.exists).map((item) => item.path),
    required_parse_failures: inventory
      .filter((item) => item.required && item.exists && !item.parseable)
      .map((item) => ({ path: item.path, error: item.parse_error })),
    files: inventory.map((item) => ({
      path: item.path,
      required: item.required,
      type: item.type,
      exists: item.exists,
      parseable: item.parseable,
      non_empty: item.non_empty,
      size_bytes: item.size_bytes,
      parse_error: item.parse_error,
    })),
    indexed,
  };
}

function getRecord(evidenceIndex, relPath) {
  return evidenceIndex.indexed.get(relPath) ?? null;
}

function createGate(name, pass, metrics, evidence) {
  return {
    name,
    pass,
    metrics,
    evidence,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inDir = path.resolve(process.cwd(), args.inDir);
  const outFile = path.resolve(process.cwd(), args.outFile);
  const outDir = path.dirname(outFile);
  const outMdFile = outFile.replace(/\.json$/i, '.md');
  const rootDir = path.resolve(inDir, '..');

  const blockers = [];
  const warnings = [];

  const evidenceIndex = buildEvidenceIndex(inDir, rootDir, blockers, warnings);

  const d1LockMd = getRecord(evidenceIndex, 'contracts/d1-contract-lock.md')?.text ?? '';
  const d1DiffMd = getRecord(evidenceIndex, 'contracts/d1-contract-diff.md')?.text ?? '';
  const d1DiffJson = getRecord(evidenceIndex, 'contracts/d1-contract-diff.json')?.json ?? null;
  const flagsJson = getRecord(evidenceIndex, 'contracts/flags-contract-v1.json')?.json ?? null;

  const unresolvedFromMd = toSafeNumber(d1DiffMd.match(/unresolved_without_owner:\s*([0-9]+)/)?.[1] ?? null);
  const unresolvedFromJson = toSafeNumber(pickValue(d1DiffJson, ['unresolved_without_owner']));
  const unresolved = unresolvedFromJson ?? unresolvedFromMd;

  const signoffAllSigned = containsAll(d1LockMd, ['- 主审：signed', '- DB：signed', '- API：signed', '- 插件：signed']);
  const lockRuleDeclared = d1LockMd.includes('lock_ready=true && unresolved=0');
  const hasChecklist = containsAll(d1LockMd, ['d1-contract-diff.json', 'd1-contract-diff.md', 'flags-contract-v1.json']);
  const flagsCount = Array.isArray(flagsJson?.flags) ? flagsJson.flags.length : null;
  const lockReady = signoffAllSigned && lockRuleDeclared && hasChecklist;
  const p0ContractFreezePass = lockReady && unresolved === 0;

  if (!p0ContractFreezePass) {
    blockers.push(`P0-0 合同冻结未通过: lock_ready=${String(lockReady)}, unresolved=${String(unresolved)}`);
  }

  const approvalApiJson = getRecord(evidenceIndex, 'evidence/p0-1-approval-api-test.json')?.json ?? null;
  const auditCompletenessJson = getRecord(evidenceIndex, 'evidence/p0-1-audit-completeness.json')?.json ?? null;
  const batch001Log = getRecord(evidenceIndex, 'evidence/p0-1-batch001-verify.log')?.text ?? '';

  const approvalApiPass = testJsonPass(approvalApiJson);
  const auditCompletenessRatio = pickRatio(auditCompletenessJson, [
    'verification.audit_completeness_percent',
    'audit_completeness_percent',
    'metrics.audit_completeness',
    'metrics.rate',
  ], ['audit_completeness_percent', 'audit_completeness', 'rate']);
  const auditCompletenessPass = ratioAtLeast(auditCompletenessRatio, 1);
  const decisionTraceRequired = pickBool(auditCompletenessJson, ['verification.approval_decision_trace_required', 'approval_decision_trace_required'], [
    'approval_decision_trace_required',
  ]);
  const requestTraceRequired = pickBool(auditCompletenessJson, ['verification.request_trace_required', 'request_trace_required'], ['request_trace_required']);
  const decisionIdMentionedInTests = JSON.stringify(approvalApiJson ?? {}).toLowerCase().includes('decision_id');
  const decisionIdEvidence = Boolean(decisionIdMentionedInTests && decisionTraceRequired === true && requestTraceRequired === true);
  const batch001VerifyPass = batch001Log.includes('verify_batch_001_approval_closure: PASS');

  const p0ApprovalClosurePass = approvalApiPass && auditCompletenessPass && decisionIdEvidence && batch001VerifyPass;
  if (!p0ApprovalClosurePass) {
    blockers.push('P0-1 审批闭环未通过（approval API / 审计完整率 / decision_id 链路 / Batch001 verify）');
  }

  const authMatrixJson = getRecord(evidenceIndex, 'evidence/p0-2-auth-matrix.json')?.json ?? null;
  const authE2EJson = getRecord(evidenceIndex, 'evidence/p0-2-clawdbot-auth-e2e.json')?.json ?? null;
  const batch002Log = getRecord(evidenceIndex, 'evidence/p0-2-batch002-verify.log')?.text ?? '';

  const missingClaimFailRate = pickRatio(authMatrixJson, [
    'metrics.missing_claim.fail_rate',
    'metrics.missing_claim_fail_rate',
    'missing_claim_fail_rate',
    'missing_claim.fail_rate',
    'metrics.rate',
  ], ['missing_claim_fail_rate', 'fail_rate', 'rate']);
  const crossScopeDeniedRate = pickRatio(authMatrixJson, [
    'metrics.cross_scope.denied_rate',
    'metrics.cross_scope_denied_rate',
    'cross_scope_denied_rate',
    'cross_scope.denied_rate',
    'metrics.rate',
  ], ['cross_scope_denied_rate', 'denied_rate', 'rate']);
  const pluginCrossTenantBlockedRate = pickRatio(authE2EJson, [
    'metrics.cross_tenant.blocked_rate',
    'metrics.cross_tenant_blocked_rate',
    'cross_tenant_blocked_rate',
    'metrics.rate',
  ], ['cross_tenant_blocked_rate', 'blocked_rate', 'rate']);
  const pluginCrossWorkspaceBlockedRate = pickRatio(authE2EJson, [
    'metrics.cross_workspace.blocked_rate',
    'metrics.cross_workspace_blocked_rate',
    'cross_workspace_blocked_rate',
    'metrics.rate',
  ], ['cross_workspace_blocked_rate', 'blocked_rate', 'rate']);
  const pluginCombinedBlockedRate = pickRatio(authE2EJson, [
    'metrics.cross_tenant_and_workspace_combined.blocked_rate',
    'metrics.cross_tenant_workspace_combined.blocked_rate',
    'metrics.cross_tenant_and_workspace.blocked_rate',
    'metrics.cross_tenant_and_workspace_combined.rate',
    'cross_tenant_and_workspace_combined_blocked_rate',
  ], ['cross_tenant_and_workspace_combined_blocked_rate', 'combined_blocked_rate']);
  const pluginInterceptionPass = ratioAtLeast(pluginCombinedBlockedRate, 1)
    || (ratioAtLeast(pluginCrossTenantBlockedRate, 1) && ratioAtLeast(pluginCrossWorkspaceBlockedRate, 1));
  const batch002VerifyPass = batch002Log.includes('verify_batch_002_auth_scope_mapping: PASS');

  const p0AuthMappingPass = ratioAtLeast(missingClaimFailRate, 1)
    && ratioAtLeast(crossScopeDeniedRate, 1)
    && pluginInterceptionPass
    && batch002VerifyPass;
  if (!p0AuthMappingPass) {
    blockers.push('P0-2 鉴权映射未通过（missing_claim / cross_scope / 插件跨租户跨workspace 拦截 / Batch002 verify）');
  }

  const cutoverApiJson = getRecord(evidenceIndex, 'evidence/p0-3-cutover-api-test.json')?.json ?? null;
  const backfillJson = getRecord(evidenceIndex, 'evidence/d11-backfill-report.json')?.json ?? null;
  const shadowJson = getRecord(evidenceIndex, 'evidence/d11-shadow-report.json')?.json ?? null;
  const faultDrillJson = getRecord(evidenceIndex, 'evidence/d12-fault-drill.json')?.json ?? null;
  const rollbackLogText = getRecord(evidenceIndex, 'evidence/p0-3-rollback-drill.log')?.text ?? '';
  const batch003Log = getRecord(evidenceIndex, 'evidence/p0-3-batch003-verify.log')?.text ?? '';

  const backfillImported = toSafeNumber(pickValue(backfillJson, ['imported_records', 'metrics.imported_records']));
  const backfillCandidate = toSafeNumber(pickValue(backfillJson, ['candidate_records', 'metrics.candidate_records']));
  const backfillRatio = pickRatio(backfillJson, ['import_ratio', 'metrics.import_ratio', 'ratio'], ['import_ratio', 'rate'])
    ?? (backfillImported !== null && backfillCandidate && backfillCandidate > 0 ? backfillImported / backfillCandidate : null);

  const shadowPassed = toSafeNumber(pickValue(shadowJson, ['pass_queries', 'metrics.pass_queries']));
  const shadowTotal = toSafeNumber(pickValue(shadowJson, ['total_queries', 'metrics.total_queries']));
  const shadowRatio = pickRatio(shadowJson, ['pass_ratio', 'metrics.pass_ratio', 'ratio'], ['pass_ratio', 'rate'])
    ?? (shadowPassed !== null && shadowTotal && shadowTotal > 0 ? shadowPassed / shadowTotal : null);

  const rollback = parseRollBackDrill(rollbackLogText);
  const rollbackDurationPass = rollback.duration_seconds !== null && rollback.duration_seconds <= 60 + EPS;
  const rollbackReadModePass = rollback.after_read_mode === 'local';
  const rollbackCutoverPass = rollback.after_cutover_percent === 0;
  const rollbackFlagPass = rollback.pass_flag !== false;

  const faultDagCompleteScenarios = toSafeNumber(pickValue(faultDrillJson, ['dag_complete_scenarios', 'metrics.dag_complete_scenarios']));
  const faultTotalScenarios = toSafeNumber(pickValue(faultDrillJson, ['total_scenarios', 'metrics.total_scenarios']));
  const faultDagRatio = pickRatio(faultDrillJson, ['dag_complete_ratio', 'metrics.dag_complete_ratio', 'ratio'], ['dag_complete_ratio', 'rate'])
    ?? (faultDagCompleteScenarios !== null && faultTotalScenarios && faultTotalScenarios > 0
      ? faultDagCompleteScenarios / faultTotalScenarios
      : null);

  const cutoverApiPass = testJsonPass(cutoverApiJson);
  const batch003VerifyPass = batch003Log.includes('verify_batch_003_cutover_runbook: PASS');

  const p0CutoverBackfillPass = ratioAtLeast(backfillRatio, 0.995)
    && ratioAtLeast(shadowRatio, 0.98)
    && rollbackDurationPass
    && rollbackReadModePass
    && rollbackCutoverPass
    && rollbackFlagPass
    && ratioAtLeast(faultDagRatio, 1)
    && cutoverApiPass
    && batch003VerifyPass;
  if (!p0CutoverBackfillPass) {
    blockers.push('P0-3 切流回填未通过（backfill/shadow/rollback/fault-drill/cutover-api/batch003）');
  }

  const cloudDrillJson = getRecord(evidenceIndex, 'evidence/p0-supabase-cloud-drill-report.json')?.json ?? null;
  const cloudDrillVerdict = normalizeStatus(pickValue(cloudDrillJson, ['verdict']));
  if (cloudDrillJson && cloudDrillVerdict !== 'PASS') {
    warnings.push(`P0 云端演练报告 verdict 非 PASS: ${String(cloudDrillVerdict)}`);
  }

  const p1Batch004Log = getRecord(evidenceIndex, 'evidence/p1-4-batch004-verify.log')?.text ?? '';
  const p1Batch005Log = getRecord(evidenceIndex, 'evidence/p1-5-batch005-verify.log')?.text ?? '';
  const p1Batch006Log = getRecord(evidenceIndex, 'evidence/p1-6-batch006-verify.log')?.text ?? '';
  const p1GovernanceJson = getRecord(evidenceIndex, 'evidence/p1-4-governance-policy-report.json')?.json ?? null;
  const p1QuotaApiJson = getRecord(evidenceIndex, 'evidence/p1-5-quota-api-test.json')?.json ?? null;
  const p1QuotaLatencyJson = getRecord(evidenceIndex, 'evidence/p1-5-quota-alert-latency.json')?.json ?? null;
  const p1ReplayApiJson = getRecord(evidenceIndex, 'evidence/p1-6-replay-api-test.json')?.json ?? null;
  const p1ReplayDetJson = getRecord(evidenceIndex, 'evidence/p1-6-replay-determinism-report.json')?.json ?? null;
  const p1SchemaReconcileJson = getRecord(evidenceIndex, 'evidence/p1-schema-migrations-reconcile.json')?.json ?? null;

  const p1VerifyLogsPass = p1Batch004Log.includes('verify_batch_004_data_governance: PASS')
    && p1Batch005Log.includes('verify_batch_005_quota_capacity: PASS')
    && p1Batch006Log.includes('verify_batch_006_replay_determinism: PASS');

  const governancePass = pickBool(p1GovernanceJson, ['pass'], ['pass']) === true;

  const quotaApiRate = pickRatio(p1QuotaApiJson, [
    'quota_exceeded_cases_metric.degraded_reason_non_empty_rate',
    'metrics.degraded_reason_non_empty_rate.rate',
    'degraded_reason_non_empty_rate',
    'metrics.rate',
  ], ['degraded_reason_non_empty_rate', 'rate']);
  const quotaApiJudgementPass = isPassStatus(pickValue(p1QuotaApiJson, ['judgement.result', 'judgement', 'verify_result.status'], ['result', 'status']));
  const quotaAlertLatencySeconds = toSafeNumber(pickValue(p1QuotaLatencyJson, [
    'metrics.alert_latency_seconds.max',
    'alert_latency_seconds.max',
    'alert_latency_seconds',
  ], ['max']));
  const quotaAlertLatencyPassFlag = pickBool(p1QuotaLatencyJson, ['metrics.alert_latency_seconds.pass', 'alert_latency_seconds.pass'], ['pass']);
  const quotaAlertRate = pickRatio(p1QuotaLatencyJson, [
    'metrics.degraded_reason_non_empty_rate.rate',
    'degraded_reason_non_empty_rate.rate',
    'metrics.rate',
  ], ['rate', 'degraded_reason_non_empty_rate']);
  const quotaAlertRatePassFlag = pickBool(p1QuotaLatencyJson, [
    'metrics.degraded_reason_non_empty_rate.pass',
    'degraded_reason_non_empty_rate.pass',
  ], ['pass']);
  const quotaAlertJudgementPass = isPassStatus(pickValue(p1QuotaLatencyJson, ['judgement', 'judgement.result'], ['judgement', 'result']));

  const replayOrderedRatio = pickRatio(p1ReplayDetJson, ['metrics.ordered_ratio', 'ordered_ratio', 'metrics.rate'], ['ordered_ratio', 'rate']);
  const replayConsistency = pickRatio(p1ReplayDetJson, [
    'metrics.replay_consistency_pass_rate',
    'replay_consistency_pass_rate',
    'consistency',
  ], ['replay_consistency_pass_rate', 'consistency']);
  const replayDetJudgementPass = isPassStatus(pickValue(p1ReplayDetJson, ['judgement.result', 'judgement'], ['result', 'judgement']));
  const replayApiAuditRate = pickRatio(p1ReplayApiJson, [
    'dead_letter_manual_fix_metric.dead_letter_manual_fix_audit_rate',
    'metrics.dead_letter_manual_fix_audit_rate',
    'dead_letter_manual_fix_audit_rate',
    'metrics.rate',
  ], ['dead_letter_manual_fix_audit_rate', 'rate']);
  const replayApiJudgementPass = isPassStatus(pickValue(p1ReplayApiJson, ['judgement.result', 'judgement', 'verify_result.status'], ['result', 'status']));

  const schemaLedgerHasAll = pickBool(p1SchemaReconcileJson, ['ledger_check.ledger_has_all_versions'], ['ledger_has_all_versions']);
  const schemaRiskBlocking = pickBool(p1SchemaReconcileJson, ['risk.blocking'], ['blocking']);
  const schemaRiskLevel = String(pickValue(p1SchemaReconcileJson, ['risk.level', 'risk_level'], ['level']) ?? '').trim();
  const schemaRiskSummary = String(pickValue(p1SchemaReconcileJson, ['risk.summary'], ['summary']) ?? '').trim();
  const schemaClassification = String(pickValue(p1SchemaReconcileJson, ['classification'], ['classification']) ?? '').trim();
  const schemaConclusion = String(pickValue(p1SchemaReconcileJson, ['human_conclusion'], ['human_conclusion']) ?? '').trim();
  const schemaReconcileReportComplete = Boolean(schemaClassification && schemaConclusion && schemaRiskSummary);

  const replayReadinessPass = ratioAtLeast(replayOrderedRatio, 1)
    && ratioAtLeast(replayConsistency, 0.99)
    && ratioAtLeast(replayApiAuditRate, 1)
    && replayApiJudgementPass
    && replayDetJudgementPass;
  const quotaReadinessPass = ratioAtLeast(quotaApiRate, 1)
    && quotaApiJudgementPass
    && ratioAtLeast(quotaAlertRate, 1)
    && (quotaAlertLatencyPassFlag !== false)
    && (quotaAlertRatePassFlag !== false)
    && (quotaAlertLatencySeconds === null || quotaAlertLatencySeconds <= 300 + EPS)
    && quotaAlertJudgementPass;
  const schemaReadinessPass = schemaReconcileReportComplete && schemaRiskBlocking !== true;

  const p1Readiness = replayReadinessPass && quotaReadinessPass && schemaReadinessPass;

  if (!p1VerifyLogsPass) {
    warnings.push('P1 verify 日志未全部命中 PASS（Batch004/005/006）');
  }
  if (!governancePass) {
    warnings.push('P1-4 治理报告未命中 pass=true');
  }
  if (!replayReadinessPass) {
    warnings.push('P1 replay readiness 未达标（ordered_ratio/consistency/manual_fix_audit）');
  }
  if (!quotaReadinessPass) {
    warnings.push('P1 quota readiness 未达标（degraded_reason/告警时延）');
  }
  if (!schemaReconcileReportComplete) {
    warnings.push('P1 schema_migrations 对账结论不完整（classification/human_conclusion/risk.summary 缺失）');
  }
  if (schemaLedgerHasAll === false) {
    warnings.push('P1 schema_migrations 账本未完整记录（演练对象存在但 ledger 缺失版本）');
  }
  if (schemaRiskLevel && schemaRiskLevel.toLowerCase() !== 'low') {
    warnings.push(`P1 schema_migrations 风险等级=${schemaRiskLevel}`);
  }

  const gates = {
    p0_0_contract_freeze: createGate(
      'P0-0 合同冻结',
      p0ContractFreezePass,
      {
        lock_ready: lockReady,
        unresolved,
        signoff_all_signed: signoffAllSigned,
        lock_rule_declared: lockRuleDeclared,
        lock_checklist_present: hasChecklist,
        flags_count: flagsCount,
      },
      ['contracts/d1-contract-lock.md', 'contracts/d1-contract-diff.md', 'contracts/d1-contract-diff.json', 'contracts/flags-contract-v1.json'],
    ),
    p0_1_approval_closure: createGate(
      'P0-1 审批闭环',
      p0ApprovalClosurePass,
      {
        approval_api_pass: approvalApiPass,
        audit_completeness_ratio: auditCompletenessRatio,
        audit_completeness_required: 1,
        batch001_verify_pass: batch001VerifyPass,
        decision_trace_required: decisionTraceRequired,
        request_trace_required: requestTraceRequired,
        decision_id_evidence: decisionIdEvidence,
      },
      ['evidence/p0-1-approval-api-test.json', 'evidence/p0-1-audit-completeness.json', 'evidence/p0-1-batch001-verify.log'],
    ),
    p0_2_auth_mapping: createGate(
      'P0-2 鉴权映射',
      p0AuthMappingPass,
      {
        missing_claim_fail_rate: missingClaimFailRate,
        cross_scope_denied_rate: crossScopeDeniedRate,
        plugin_cross_tenant_blocked_rate: pluginCrossTenantBlockedRate,
        plugin_cross_workspace_blocked_rate: pluginCrossWorkspaceBlockedRate,
        plugin_combined_blocked_rate: pluginCombinedBlockedRate,
        plugin_interception_pass: pluginInterceptionPass,
        batch002_verify_pass: batch002VerifyPass,
      },
      ['evidence/p0-2-auth-matrix.json', 'evidence/p0-2-clawdbot-auth-e2e.json', 'evidence/p0-2-batch002-verify.log'],
    ),
    p0_3_cutover_backfill: createGate(
      'P0-3 切流回填',
      p0CutoverBackfillPass,
      {
        backfill_ratio: backfillRatio,
        backfill_required: 0.995,
        shadow_ratio: shadowRatio,
        shadow_required: 0.98,
        rollback_duration_seconds: rollback.duration_seconds,
        rollback_duration_required_max: 60,
        rollback_after_read_mode: rollback.after_read_mode,
        rollback_after_cutover_percent: rollback.after_cutover_percent,
        rollback_pass_flag: rollback.pass_flag,
        fault_dag_ratio: faultDagRatio,
        fault_dag_required: 1,
        cutover_api_pass: cutoverApiPass,
        batch003_verify_pass: batch003VerifyPass,
      },
      [
        'evidence/d11-backfill-report.json',
        'evidence/d11-shadow-report.json',
        'evidence/p0-3-rollback-drill.log',
        'evidence/d12-fault-drill.json',
        'evidence/p0-3-cutover-api-test.json',
        'evidence/p0-3-batch003-verify.log',
      ],
    ),
    p1_readiness: createGate(
      'P1 Readiness（非阻断）',
      p1Readiness,
      {
        replay_ordered_ratio: replayOrderedRatio,
        replay_ordered_required: 1,
        replay_consistency: replayConsistency,
        replay_consistency_required: 0.99,
        replay_manual_fix_audit_rate: replayApiAuditRate,
        quota_degraded_reason_rate: quotaApiRate,
        quota_alert_latency_seconds_max: quotaAlertLatencySeconds,
        quota_alert_latency_required_max: 300,
        quota_alert_degraded_reason_rate: quotaAlertRate,
        governance_pass: governancePass,
        verify_logs_pass: p1VerifyLogsPass,
        schema_ledger_has_all_versions: schemaLedgerHasAll,
        schema_risk_blocking: schemaRiskBlocking,
        schema_risk_level: schemaRiskLevel,
        schema_classification: schemaClassification,
      },
      [
        'evidence/p1-6-replay-api-test.json',
        'evidence/p1-6-replay-determinism-report.json',
        'evidence/p1-5-quota-api-test.json',
        'evidence/p1-5-quota-alert-latency.json',
        'evidence/p1-schema-migrations-reconcile.json',
        'evidence/p1-schema-migrations-reconcile.md',
      ],
    ),
  };

  const p0AllGreen = gates.p0_0_contract_freeze.pass
    && gates.p0_1_approval_closure.pass
    && gates.p0_2_auth_mapping.pass
    && gates.p0_3_cutover_backfill.pass;

  const decision = p0AllGreen ? 'GO' : 'NO-GO';

  const result = {
    generated_at_utc: new Date().toISOString(),
    input: {
      in_dir: args.inDir,
      out_file: args.outFile,
      execution_cwd: process.cwd(),
    },
    evidence_inventory: {
      in_dir: evidenceIndex.in_dir,
      root_dir: evidenceIndex.root_dir,
      required_total: evidenceIndex.required_total,
      required_ready: evidenceIndex.required_ready,
      missing_required: evidenceIndex.missing_required,
      required_parse_failures: evidenceIndex.required_parse_failures,
      files: evidenceIndex.files,
    },
    gates,
    p0_all_green: p0AllGreen,
    p1_readiness: p1Readiness,
    blockers,
    warnings,
    decision,
    hard_rule: '仅当 p0_all_green=true 时，decision 才能为 GO；否则强制 NO-GO',
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const mdLines = [
    '# D13 Gate Review',
    '',
    `- generated_at_utc: ${result.generated_at_utc}`,
    `- p0_all_green: ${String(result.p0_all_green)}`,
    `- p1_readiness: ${String(result.p1_readiness)}`,
    `- decision: ${result.decision}`,
    '',
    '## Gate Summary',
    '',
    '| Gate | Result | Key Metrics |',
    '| --- | --- | --- |',
    `| P0-0 合同冻结 | ${gates.p0_0_contract_freeze.pass ? 'PASS' : 'FAIL'} | lock_ready=${String(lockReady)}, unresolved=${String(unresolved)} |`,
    `| P0-1 审批闭环 | ${gates.p0_1_approval_closure.pass ? 'PASS' : 'FAIL'} | approval_api_pass=${String(approvalApiPass)}, audit_completeness=${String(auditCompletenessRatio)}, decision_id_evidence=${String(decisionIdEvidence)} |`,
    `| P0-2 鉴权映射 | ${gates.p0_2_auth_mapping.pass ? 'PASS' : 'FAIL'} | missing_claim=${String(missingClaimFailRate)}, cross_scope=${String(crossScopeDeniedRate)}, plugin_combined=${String(pluginCombinedBlockedRate)} |`,
    `| P0-3 切流回填 | ${gates.p0_3_cutover_backfill.pass ? 'PASS' : 'FAIL'} | backfill=${String(backfillRatio)}, shadow=${String(shadowRatio)}, rollback_s=${String(rollback.duration_seconds)}, fault_dag=${String(faultDagRatio)} |`,
    `| P1 Readiness（非阻断） | ${gates.p1_readiness.pass ? 'PASS' : 'WARN'} | replay_ordered=${String(replayOrderedRatio)}, replay_consistency=${String(replayConsistency)}, quota_rate=${String(quotaApiRate)}, schema_ledger_complete=${String(schemaLedgerHasAll)} |`,
    '',
    '## Evidence Inventory',
    '',
    `- required_total: ${String(evidenceIndex.required_total)}`,
    `- required_ready: ${String(evidenceIndex.required_ready)}`,
    `- missing_required: ${result.evidence_inventory.missing_required.length}`,
    `- required_parse_failures: ${result.evidence_inventory.required_parse_failures.length}`,
    '',
    '## Blockers',
    '',
    ...(blockers.length > 0 ? blockers.map((item) => `- ${item}`) : ['- 无']),
    '',
    '## Warnings',
    '',
    ...(warnings.length > 0 ? warnings.map((item) => `- ${item}`) : ['- 无']),
    '',
    '## Hard Rule',
    '',
    `- ${result.hard_rule}`,
    '',
    '## Output Files',
    '',
    `- JSON: ${path.relative(process.cwd(), outFile)}`,
    `- Markdown: ${path.relative(process.cwd(), outMdFile)}`,
    '',
  ];

  fs.writeFileSync(outMdFile, mdLines.join('\n'), 'utf8');

  process.stdout.write(`${JSON.stringify({ out_json: outFile, out_md: outMdFile, p0_all_green: p0AllGreen, p1_readiness: p1Readiness, decision }, null, 2)}\n`);
  process.exitCode = p0AllGreen ? 0 : 1;
}

main();
