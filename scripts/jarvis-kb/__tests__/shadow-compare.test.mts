import { describe, expect, it } from 'vitest';
import { runBackfillIngest } from '../backfill-ingest.mts';
import { runShadowCompare } from '../shadow-compare.mts';

describe('jarvis-kb backfill & shadow scripts', () => {
  it('supports dry-run backfill and meets >=99.5% import ratio', async () => {
    const report = await runBackfillIngest({
      dryRun: true,
      candidateRecords: [
        { id: 'r-1', text: 'alpha' },
        { id: 'r-2', text: 'beta' },
        { id: 'r-3', text: 'gamma' },
        { id: 'r-4', text: 'delta' },
      ],
    });

    expect(report.dry_run).toBe(true);
    expect(report.candidate_records).toBe(4);
    expect(report.imported_records / report.candidate_records).toBeGreaterThanOrEqual(0.995);
    expect(report.status).toBe('pass');
  });

  it('outputs structured shadow report and meets >=98% query pass ratio', async () => {
    const report = await runShadowCompare({
      cases: [
        { query: 'alpha', local_hits: 3, jarvis_hits: 3 },
        { query: 'beta', local_hits: 5, jarvis_hits: 5 },
        { query: 'gamma', local_hits: 2, jarvis_hits: 2 },
        { query: 'delta', local_hits: 4, jarvis_hits: 4 },
        { query: 'epsilon', local_hits: 6, jarvis_hits: 6 },
      ],
    });

    expect(report.total_queries).toBe(5);
    expect(report.pass_queries).toBe(5);
    expect(report.pass_queries / report.total_queries).toBeGreaterThanOrEqual(0.98);
    expect(report.status).toBe('pass');
    expect(Array.isArray(report.failures)).toBe(true);
  });
});
