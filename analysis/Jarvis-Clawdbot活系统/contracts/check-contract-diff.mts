import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const REQUIRED_API_PATHS = [
  {
    id: 'api.missing_path.cancel',
    path: '/v0/approval-tickets/{approvalId}/cancel',
    owner: 'API 合同负责人',
    expected: 'POST path exists',
    resolution_task: 'T00-02',
  },
  {
    id: 'api.missing_path.cutover.create',
    path: '/v0/cutover/runs',
    owner: 'API 合同负责人',
    expected: 'POST path exists',
    resolution_task: 'T00-02',
  },
  {
    id: 'api.missing_path.cutover.advance',
    path: '/v0/cutover/runs/{cutoverId}/advance',
    owner: 'API 合同负责人',
    expected: 'POST path exists',
    resolution_task: 'T00-02',
  },
  {
    id: 'api.missing_path.cutover.rollback',
    path: '/v0/cutover/runs/{cutoverId}/rollback',
    owner: 'API 合同负责人',
    expected: 'POST path exists',
    resolution_task: 'T00-02',
  },
];

const REQUIRED_DDL_OBJECTS = [
  {
    batch: 'batch_001',
    object: 'audit.policy_decision',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_001',
    object: 'audit.approval_ticket',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_001',
    object: 'audit.approval_action_log',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_002',
    object: 'audit.actor_role_binding',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_002',
    object: 'audit.service_trust',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_003',
    object: 'audit.cutover_run',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_003',
    object: 'audit.cutover_stage_log',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_004',
    object: 'public.memory_lifecycle_status_enum',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_004',
    object: 'mem.memory_record.lifecycle_status',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_005',
    object: 'audit.quota_policy',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_005',
    object: 'audit.quota_usage_hourly',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_006',
    object: 'mem.replay_queue',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_006',
    object: 'mem.replay_checkpoint',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_006',
    object: 'mem.ingest_dead_letter',
    owner: 'DB 负责人',
  },
  {
    batch: 'batch_006',
    object: 'mem.replay_manual_fix',
    owner: 'DB 负责人',
  },
];

const FLAG_CONTRACT_BASELINE = [
  'memory.jarvis.enabled=false',
  'memory.jarvis.read_mode=local',
  'memory.jarvis.write_mode=off',
  'memory.jarvis.cutover_percent=0',
  'memory.jarvis.backfill.enabled=false',
  'security.auth_claim_mapping.enabled=false',
  'security.mtls.required=false',
  'governance.approval_api.enabled=false',
  'governance.approval_api.require_audit_write=true',
  'governance.data_policy.enforced=false',
  'governance.forgetting.purge_enabled=false',
  'quota.enforced=false',
  'quota.hard_block.enabled=false',
  'replay.auto.enabled=false',
  'replay.partition_strict.enabled=true',
];

function ensurePostPath(openapiDoc, routePath) {
  const route = openapiDoc?.paths?.[routePath];
  return Boolean(route && typeof route === 'object' && route.post);
}

function hasObjectInDdl(ddlSource, objectName) {
  if (objectName === 'public.memory_lifecycle_status_enum') {
    return ddlSource.includes('create type public.memory_lifecycle_status_enum');
  }

  if (objectName === 'mem.memory_record.lifecycle_status') {
    return ddlSource.includes('create table if not exists mem.memory_record') && ddlSource.includes('lifecycle_status');
  }

  return ddlSource.includes(objectName);
}

function pushOpenDiff(target, input) {
  target.push({
    ...input,
    status: 'open',
  });
}

function summarizeByCategory(diffs) {
  const summary = {};

  for (const diff of diffs) {
    if (!summary[diff.category]) {
      summary[diff.category] = { total: 0, open: 0, resolved: 0 };
    }

    const categorySummary = summary[diff.category];
    categorySummary.total += 1;

    if (diff.status === 'resolved') {
      categorySummary.resolved += 1;
    } else {
      categorySummary.open += 1;
    }
  }

  return summary;
}

export function analyzeContractDiff({ openapiPath, ddlPath }) {
  const resolvedOpenapiPath = resolve(openapiPath);
  const resolvedDdlPath = resolve(ddlPath);

  const openapiText = readFileSync(resolvedOpenapiPath, 'utf8');
  const ddlText = readFileSync(resolvedDdlPath, 'utf8');

  const openapiDoc = parseYaml(openapiText);
  const ddlSource = ddlText.toLowerCase();

  const diffs = [];

  for (const requirement of REQUIRED_API_PATHS) {
    if (!ensurePostPath(openapiDoc, requirement.path)) {
      pushOpenDiff(diffs, {
        id: requirement.id,
        category: 'openapi',
        owner: requirement.owner,
        item: requirement.path,
        expected: requirement.expected,
        actual: 'missing',
        resolution_task: requirement.resolution_task,
        notes: 'P0 必需路径缺失。',
      });
    }
  }

  const approvalActionData =
    openapiDoc?.components?.schemas?.ApprovalActionResponse?.properties?.data ?? {};
  const approvalActionRequired = Array.isArray(approvalActionData.required)
    ? approvalActionData.required
    : [];
  const approvalActionProperties =
    approvalActionData?.properties && typeof approvalActionData.properties === 'object'
      ? approvalActionData.properties
      : {};
  const approvalActionStatusEnum = Array.isArray(approvalActionProperties?.status?.enum)
    ? approvalActionProperties.status.enum
    : [];

  if (!approvalActionRequired.includes('decision_id')) {
    pushOpenDiff(diffs, {
      id: 'api.schema.approval_action_response.decision_id_required',
      category: 'openapi',
      owner: 'API 合同负责人',
      item: 'components.schemas.ApprovalActionResponse.data.required',
      expected: 'contains decision_id',
      actual: JSON.stringify(approvalActionRequired),
      resolution_task: 'T00-02',
      notes: '审批动作返回体缺少 decision_id 必填约束。',
    });
  }

  if (!approvalActionProperties?.decision_id) {
    pushOpenDiff(diffs, {
      id: 'api.schema.approval_action_response.decision_id_property',
      category: 'openapi',
      owner: 'API 合同负责人',
      item: 'components.schemas.ApprovalActionResponse.data.properties.decision_id',
      expected: 'UUID field exists',
      actual: 'missing',
      resolution_task: 'T00-02',
      notes: '审批动作返回体未声明 decision_id 字段。',
    });
  }

  if (!approvalActionStatusEnum.includes('canceled')) {
    pushOpenDiff(diffs, {
      id: 'api.schema.approval_action_response.status_canceled',
      category: 'openapi',
      owner: 'API 合同负责人',
      item: 'components.schemas.ApprovalActionResponse.data.properties.status.enum',
      expected: 'includes canceled',
      actual: JSON.stringify(approvalActionStatusEnum),
      resolution_task: 'T00-02',
      notes: '审批终态缺少 canceled。',
    });
  }

  for (const requirement of REQUIRED_DDL_OBJECTS) {
    if (!hasObjectInDdl(ddlSource, requirement.object)) {
      pushOpenDiff(diffs, {
        id: `ddl.missing_object.${requirement.batch}.${requirement.object}`,
        category: 'ddl',
        owner: requirement.owner,
        item: requirement.object,
        expected: `${requirement.batch} contains object`,
        actual: 'missing',
        resolution_task: 'T00-03',
        notes: `DDL 草案缺少 ${requirement.batch} 对象。`,
      });
    }
  }

  pushOpenDiff(diffs, {
    id: 'flags.contract.freeze.pending',
    category: 'flags',
    owner: '配置/门禁负责人',
    item: '15 canonical flags + defaults',
    expected: 'contract file frozen in D1',
    actual: 'pending T00-04/T00-06 lock',
    resolution_task: 'T00-04',
    notes: `待冻结 flags: ${FLAG_CONTRACT_BASELINE.join(', ')}`,
  });

  const unresolvedWithoutOwner = diffs.filter(
    (item) => item.status !== 'resolved' && !item.owner,
  ).length;

  const report = {
    version: 'd1-contract-diff-v1',
    generated_at: new Date().toISOString(),
    openapi_path: resolvedOpenapiPath,
    ddl_path: resolvedDdlPath,
    total_diffs: diffs.length,
    unresolved_without_owner: unresolvedWithoutOwner,
    by_category: summarizeByCategory(diffs),
    diffs,
  };

  return report;
}

export function renderMarkdownReport(report) {
  const header = [
    '# D1 Contract Diff Baseline',
    '',
    `- generated_at: ${report.generated_at}`,
    `- total_diffs: ${report.total_diffs}`,
    `- unresolved_without_owner: ${report.unresolved_without_owner}`,
    '',
    '## Category Summary',
    '',
    '| category | total | open | resolved |',
    '| --- | ---: | ---: | ---: |',
  ];

  for (const [category, summary] of Object.entries(report.by_category)) {
    header.push(
      `| ${category} | ${summary.total} | ${summary.open} | ${summary.resolved} |`,
    );
  }

  const detail = [
    '',
    '## Diff Items',
    '',
    '| id | category | status | owner | item | expected | actual | resolution_task | notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const item of report.diffs) {
    detail.push(
      `| ${item.id} | ${item.category} | ${item.status} | ${item.owner ?? '-'} | ${item.item} | ${item.expected} | ${item.actual} | ${item.resolution_task ?? '-'} | ${item.notes ?? '-'} |`,
    );
  }

  return [...header, ...detail, ''].join('\n');
}

export function writeContractDiffArtifacts({ report, outJsonPath, outMdPath }) {
  const resolvedOutJsonPath = resolve(outJsonPath);
  const resolvedOutMdPath = outMdPath
    ? resolve(outMdPath)
    : resolvedOutJsonPath.replace(/\.json$/u, '.md');

  mkdirSync(dirname(resolvedOutJsonPath), { recursive: true });
  mkdirSync(dirname(resolvedOutMdPath), { recursive: true });

  writeFileSync(resolvedOutJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(resolvedOutMdPath, renderMarkdownReport(report), 'utf8');

  return {
    jsonPath: resolvedOutJsonPath,
    markdownPath: resolvedOutMdPath,
  };
}

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--openapi') {
      args.openapiPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--ddl') {
      args.ddlPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--out') {
      args.outPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--md') {
      args.mdPath = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return args;
}

function printUsageAndExit() {
  console.error(
    'Usage: node check-contract-diff.mts --openapi <path> --ddl <path> --out <json-path> [--md <md-path>]',
  );
  process.exitCode = 1;
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (!parsed.openapiPath || !parsed.ddlPath || !parsed.outPath) {
    printUsageAndExit();
    return;
  }

  const report = analyzeContractDiff({
    openapiPath: parsed.openapiPath,
    ddlPath: parsed.ddlPath,
  });

  const output = writeContractDiffArtifacts({
    report,
    outJsonPath: parsed.outPath,
    outMdPath: parsed.mdPath,
  });

  console.log(
    JSON.stringify(
      {
        total_diffs: report.total_diffs,
        unresolved_without_owner: report.unresolved_without_owner,
        json: output.jsonPath,
        markdown: output.markdownPath,
      },
      null,
      2,
    ),
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  main();
}
