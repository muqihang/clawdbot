import { describe, expect, it } from 'vitest';
import { createJarvisClient } from '../client/jarvis-client.js';
import { buildLocalRollbackFlags, resolveJarvisBridgeFlags } from '../config/flags.js';

describe('memory-jarvis-bridge cutover routing', () => {
  it('keeps conservative defaults for Batch-5 cutover flags', () => {
    const flags = resolveJarvisBridgeFlags(undefined);
    expect(flags.backfill_enabled).toBe(false);
    expect(flags.read_mode).toBe('local');
    expect(flags.cutover_percent).toBe(0);
  });

  it('routes all traffic to local when read_mode=local', () => {
    const client = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: 'local',
        cutover_percent: 100,
        jarvis_base_url: 'https://jarvis.example.com',
      }),
    );

    const decision = client.resolveReadRoute('query-local-only');
    expect(decision.route).toBe('local');
    expect(decision.shadow_compare).toBe(false);
  });

  it('supports canary routing in primary mode with cutover percentage', () => {
    const localOnly = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: 'primary',
        cutover_percent: 0,
        jarvis_base_url: 'https://jarvis.example.com',
      }),
    );
    const fullCutover = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: 'primary',
        cutover_percent: 100,
        jarvis_base_url: 'https://jarvis.example.com',
      }),
    );

    expect(localOnly.resolveReadRoute('query-canary-0').route).toBe('local');
    expect(fullCutover.resolveReadRoute('query-canary-100').route).toBe('jarvis');
  });

  it('keeps user path local in shadow mode and enables compare flow', () => {
    const client = createJarvisClient(
      resolveJarvisBridgeFlags({
        read_mode: 'shadow',
        cutover_percent: 35,
        jarvis_base_url: 'https://jarvis.example.com',
      }),
    );

    const decision = client.resolveReadRoute('query-shadow');
    expect(decision.route).toBe('local');
    expect(decision.shadow_compare).toBe(true);
  });

  it('rolls back to read_mode=local and cutover_percent=0 within 60s', () => {
    const flags = resolveJarvisBridgeFlags({
      read_mode: 'primary',
      cutover_percent: 50,
      backfill_enabled: true,
      jarvis_base_url: 'https://jarvis.example.com',
    });

    const start = Date.now();
    const rolledBack = buildLocalRollbackFlags(flags);
    const durationMs = Date.now() - start;

    expect(rolledBack.read_mode).toBe('local');
    expect(rolledBack.cutover_percent).toBe(0);
    expect(durationMs).toBeLessThanOrEqual(60_000);
  });
});
