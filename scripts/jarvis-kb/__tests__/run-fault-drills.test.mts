import { describe, expect, it } from 'vitest';
import { runFaultDrills } from '../run-fault-drills.mts';

describe('run-fault-drills', () => {
  it('covers six scenarios and keeps full degrade->fallback->rollback DAG', async () => {
    const report = await runFaultDrills();

    expect(report.total_scenarios).toBe(6);
    expect(report.dag_complete_scenarios).toBe(6);
    expect(report.dag_complete_ratio).toBe(1);
    expect(report.default_guardrail_state.read_mode).toBe('local');
    expect(report.default_guardrail_state.write_mode).toBe('off');

    const scenarioNames = report.scenarios.map((scenario) => scenario.name);
    expect(scenarioNames).toEqual([
      'Jarvis down',
      'Graph timeout',
      'Vector down',
      'Auth fail',
      'Quota exceed',
      'Replay worker crash',
    ]);

    report.scenarios.forEach((scenario) => {
      expect(scenario.dag.degrade.stage).toBe('degrade');
      expect(scenario.dag.fallback.stage).toBe('fallback');
      expect(scenario.dag.rollback.stage).toBe('rollback');
      expect(scenario.dag.degrade.executed).toBe(true);
      expect(scenario.dag.fallback.executed).toBe(true);
      expect(scenario.dag.rollback.executed).toBe(true);
      expect(scenario.dag_complete).toBe(true);
      expect(scenario.post_recovery.read_mode).toBe('local');
      expect(scenario.post_recovery.write_mode).toBe('off');
    });
  });
});
