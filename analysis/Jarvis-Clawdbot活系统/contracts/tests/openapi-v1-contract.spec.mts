import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const OPENAPI_V1_PATH = resolve(
  'analysis/Jarvis-Clawdbot活系统/2026-02-15-jarvis-clawdbot-openapi-v1.yaml',
);

function loadOpenapi() {
  const source = readFileSync(OPENAPI_V1_PATH, 'utf8');
  return parseYaml(source);
}

describe('openapi v1 contract freeze', () => {
  it('contains required P0 endpoints', () => {
    const doc = loadOpenapi();
    const requiredPaths = [
      '/v0/approval-tickets/{approvalId}/cancel',
      '/v0/cutover/runs',
      '/v0/cutover/runs/{cutoverId}/advance',
      '/v0/cutover/runs/{cutoverId}/rollback',
    ];

    for (const routePath of requiredPaths) {
      expect(doc?.paths?.[routePath]?.post, `missing POST ${routePath}`).toBeTruthy();
    }
  });

  it('requires decision_id in ApprovalActionResponse', () => {
    const doc = loadOpenapi();
    const data =
      doc?.components?.schemas?.ApprovalActionResponse?.properties?.data ?? {};
    const required = Array.isArray(data.required) ? data.required : [];
    const statusEnum = Array.isArray(data?.properties?.status?.enum)
      ? data.properties.status.enum
      : [];

    expect(required).toContain('decision_id');
    expect(data?.properties?.decision_id).toBeTruthy();
    expect(statusEnum).toContain('canceled');
  });

  it('declares proposalId and payload.proposal_id consistency rule', () => {
    const doc = loadOpenapi();
    const contractRule =
      doc?.paths?.['/v0/memory/proposals/{proposalId}/commit']?.post?.[
        'x-contract-rules'
      ]?.proposal_id_must_match_path_param;

    expect(contractRule).toBe(true);
  });
});
