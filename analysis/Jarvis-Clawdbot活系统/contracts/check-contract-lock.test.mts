import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_FLAG_DEFAULTS,
  evaluateContractLock,
  renderLockOutput,
} from './check-contract-lock.mts';

function writeFixtureFiles(input: {
  diffJson: unknown;
  diffMarkdown: string;
  flagsContract: unknown;
  lockMarkdown: string;
}) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'contract-lock-'));
  const diffJsonPath = join(fixtureDir, 'd1-contract-diff.json');
  const diffMdPath = join(fixtureDir, 'd1-contract-diff.md');
  const flagsPath = join(fixtureDir, 'flags-contract-v1.json');
  const lockPath = join(fixtureDir, 'd1-contract-lock.md');

  writeFileSync(diffJsonPath, `${JSON.stringify(input.diffJson, null, 2)}\n`, 'utf8');
  writeFileSync(diffMdPath, input.diffMarkdown, 'utf8');
  writeFileSync(flagsPath, `${JSON.stringify(input.flagsContract, null, 2)}\n`, 'utf8');
  writeFileSync(lockPath, input.lockMarkdown, 'utf8');

  return {
    diffJsonPath,
    diffMdPath,
    flagsPath,
    lockPath,
  };
}

describe('check-contract-lock', () => {
  it('returns fail when unresolved owner or flag mismatch exists', () => {
    const fixtures = writeFixtureFiles({
      diffJson: {
        version: 'd1-contract-diff-v1',
        unresolved_without_owner: 2,
        diffs: [
          {
            id: 'flags.contract.freeze.pending',
            status: 'open',
            owner: '配置/门禁负责人',
          },
        ],
      },
      diffMarkdown: `# D1 Contract Diff Baseline

## Diff Items

| id | category | status | owner | item | expected | actual | resolution_task | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| flags.contract.freeze.pending | flags | open | 配置/门禁负责人 | 15 canonical flags + defaults | contract file frozen in D1 | pending | T00-04 | pending |
`,
      flagsContract: {
        version: 'jarvis-flags-contract-v1',
        flags: [
          {
            name: 'memory.jarvis.enabled',
            default: true,
          },
        ],
      },
      lockMarkdown: `# D1 Contract Lock

- 主审：pending
- DB：pending
- API：pending
- 插件：pending
`,
    });

    const result = evaluateContractLock({
      diffJsonPath: fixtures.diffJsonPath,
      diffMdPath: fixtures.diffMdPath,
      flagsContractPath: fixtures.flagsPath,
      lockDocPath: fixtures.lockPath,
    });

    expect(result.lock_ready).toBe(false);
    expect(result.unresolved_without_owner).toBe(2);
    expect(result.unresolved).toBeGreaterThanOrEqual(2);
    expect(result.flags_missing).toBeGreaterThan(0);
    expect(result.flags_default_mismatch).toBeGreaterThan(0);

    const line = renderLockOutput(result);
    expect(line).toContain('lock_ready=false');
    expect(line).toContain('unresolved=');
  });

  it('returns pass when diff and flags contract checks all pass', () => {
    const canonicalFlags = Object.entries(CANONICAL_FLAG_DEFAULTS).map(([name, defaultValue]) => ({
      name,
      default: defaultValue,
    }));

    const diffRows = [
      '| api.schema.approval_action_response.decision_id_required | openapi | resolved | API 合同负责人 | components.schemas.ApprovalActionResponse.data.required | contains decision_id | includes decision_id | T00-02 | done |',
      '| ddl.missing_object.batch_003.audit.cutover_run | ddl | open | DB 负责人 | audit.cutover_run | batch_003 contains object | missing | T00-03 | follow-up in D2 |',
      '| flags.contract.freeze.pending | flags | open | 配置/门禁负责人 | 15 canonical flags + defaults | contract file frozen in D1 | pending | T00-04 | waiting lock |',
    ];

    const fixtures = writeFixtureFiles({
      diffJson: {
        version: 'd1-contract-diff-v1',
        unresolved_without_owner: 0,
        diffs: [
          {
            id: 'api.schema.approval_action_response.decision_id_required',
            status: 'resolved',
            owner: 'API 合同负责人',
          },
          {
            id: 'ddl.missing_object.batch_003.audit.cutover_run',
            status: 'open',
            owner: 'DB 负责人',
          },
          {
            id: 'flags.contract.freeze.pending',
            status: 'open',
            owner: '配置/门禁负责人',
          },
        ],
      },
      diffMarkdown: `# D1 Contract Diff Baseline

## Diff Items

| id | category | status | owner | item | expected | actual | resolution_task | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${diffRows.join('\n')}
`,
      flagsContract: {
        version: 'jarvis-flags-contract-v1',
        flags: canonicalFlags,
      },
      lockMarkdown: `# D1 Contract Lock

## Sign-off

- 主审：signed
- DB：signed
- API：signed
- 插件：signed
`,
    });

    const result = evaluateContractLock({
      diffJsonPath: fixtures.diffJsonPath,
      diffMdPath: fixtures.diffMdPath,
      flagsContractPath: fixtures.flagsPath,
      lockDocPath: fixtures.lockPath,
    });

    expect(result.lock_ready).toBe(true);
    expect(result.unresolved).toBe(0);
    expect(result.diff_id_missing_in_markdown).toBe(0);
    expect(result.flags_missing).toBe(0);
    expect(result.flags_default_mismatch).toBe(0);
    expect(result.flags_unexpected).toBe(0);
    expect(result.required_signatures_ready).toBe(true);

    const line = renderLockOutput(result);
    expect(line).toContain('lock_ready=true');
    expect(line).toContain('unresolved=0');
  });
});
