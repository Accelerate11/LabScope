import { describe, expect, it } from 'vitest';
import { ToolRegistry, markdownReport, parseLogText, type ExperimentAnalysis } from '../src/index';

describe('analysis engine', () => {
  it('parses common severity formats and clusters repeated errors', () => {
    const result = parseLogText('2026-01-01T00:00:00Z ERROR node=local timeout 12\nWARN camera dropped frame\nERROR node=local timeout 13', 'fixture.log');
    expect(result.counts.ERROR).toBe(2);
    expect(result.counts.WARN).toBe(1);
    expect(result.clusters[0]?.count).toBe(2);
    expect(result.records[0]?.source).toBe('fixture.log');
  });

  it('validates tool identity and executes registered read-only tools', async () => {
    const registry = new ToolRegistry();
    registry.register({ id: 'echo', name: 'Echo', description: 'test', permission: 'read', execute: (input) => input });
    expect(await registry.execute('echo', { ok: true })).toEqual({ ok: true });
    await expect(registry.execute('missing', {})).rejects.toThrow('unknown analysis tool');
  });

  it('generates evidence-oriented markdown', () => {
    const analysis = { experimentId: 'EXP_1', experimentName: 'Fixture', generatedAt: '2026-01-01T00:00:00Z', topics: [], imu: [], pointCloud: [], events: [], warnings: [], evidence: [{ sourceFiles: ['segment-0000.mcap'], topics: ['/imu/data'], startNs: '1', endNs: '2', details: 'fixture' }] } satisfies ExperimentAnalysis;
    const report = markdownReport(analysis);
    expect(report).toContain('Observed Facts');
    expect(report).toContain('segment-0000.mcap');
  });
});
