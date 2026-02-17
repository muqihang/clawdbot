import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  analyzeContractDiff,
  writeContractDiffArtifacts,
} from './check-contract-diff.mts';

describe('check-contract-diff', () => {
  it('reports missing api/ddl contracts and binds owners', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'contract-diff-'));
    const openapiPath = join(fixtureDir, 'openapi-v0.yaml');
    const ddlPath = join(fixtureDir, 'ddl-v0.sql');
    const outJsonPath = join(fixtureDir, 'd1-contract-diff.json');

    writeFileSync(
      openapiPath,
      `openapi: 3.1.0
info:
  title: demo
  version: 0.0.1
paths:
  /v0/approval-tickets/{approvalId}/approve:
    post:
      responses:
        "200":
          description: ok
components:
  schemas:
    ApprovalActionResponse:
      type: object
      required: [meta, data]
      properties:
        meta:
          type: object
        data:
          type: object
          required: [approval_id, status]
          properties:
            approval_id:
              type: string
            status:
              type: string
              enum: [approved, rejected, expired]
`,
      'utf8',
    );

    writeFileSync(
      ddlPath,
      `CREATE TABLE IF NOT EXISTS audit.policy_decision (id uuid);
CREATE TABLE IF NOT EXISTS audit.approval_ticket (id uuid);
CREATE TABLE IF NOT EXISTS audit.approval_action_log (id uuid);
CREATE TABLE IF NOT EXISTS audit.actor_role_binding (id uuid);
CREATE TABLE IF NOT EXISTS audit.service_trust (id uuid);
CREATE TABLE IF NOT EXISTS audit.quota_policy (id uuid);
CREATE TABLE IF NOT EXISTS audit.quota_usage_hourly (id uuid);
CREATE TABLE IF NOT EXISTS mem.replay_queue (id uuid);
CREATE TABLE IF NOT EXISTS mem.replay_checkpoint (id uuid);
CREATE TABLE IF NOT EXISTS mem.ingest_dead_letter (id uuid);
CREATE TABLE IF NOT EXISTS mem.replay_manual_fix (id uuid);
`,
      'utf8',
    );

    const report = analyzeContractDiff({ openapiPath, ddlPath });

    expect(report.total_diffs).toBeGreaterThan(0);
    expect(report.unresolved_without_owner).toBe(0);

    const diffIds = new Set(report.diffs.map((item) => item.id));
    expect(diffIds).toContain('api.missing_path.cancel');
    expect(diffIds).toContain('api.missing_path.cutover.create');
    expect(diffIds).toContain('api.schema.approval_action_response.decision_id_required');
    expect(diffIds).toContain('ddl.missing_object.batch_003.audit.cutover_run');

    writeContractDiffArtifacts({ report, outJsonPath });

    const json = JSON.parse(readFileSync(outJsonPath, 'utf8')) as {
      unresolved_without_owner: number;
    };
    expect(json.unresolved_without_owner).toBe(0);

    const markdownPath = outJsonPath.replace(/\.json$/u, '.md');
    const markdown = readFileSync(markdownPath, 'utf8');
    expect(markdown).toContain('D1 Contract Diff Baseline');
    expect(markdown).toContain('api.missing_path.cancel');
  });
});
