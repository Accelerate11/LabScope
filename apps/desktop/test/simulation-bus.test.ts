import { expect, it, vi } from 'vitest';
import { SimulationScenarioManager } from '../../../packages/simulation-engine/src/index';
import { MessageBus } from '../src/renderer/src/workspace/message-bus';
import { panelRegistry } from '../src/renderer/src/workspace/built-in-panels';
import { deserializeLayout, serializeLayout } from '../src/renderer/src/workspace/layout';

it('binds simulators to existing panel types without issuing live subscription IPC', async () => {
  const liveTopics = vi.fn();
  const bus = new MessageBus(liveTopics);
  const manager = new SimulationScenarioManager(bus);
  const point = vi.fn(), camera = vi.fn();
  const unbindPoint = bus.subscribe('simulation', '/points', point);
  const unbindCamera = bus.subscribe('simulation', '/camera/color/image_raw', camera);
  const source = manager.start('static-room', { cameraWidth: 32, cameraHeight: 24 });
  source.advance(200);
  await Promise.resolve();
  const cloud = bus.getLatest('simulation', '/points')!;
  const rgb = bus.getLatest('simulation', '/camera/color/image_raw')!;
  expect(panelRegistry.get('Viewer3D')?.accepts(cloud.schemaName)).toBe(true);
  expect(panelRegistry.get('CameraViewer')?.accepts(rgb.schemaName)).toBe(true);
  expect(cloud.payload.kind).toBe('decoded');
  expect(rgb.payload.value).toMatchObject({ width: 32, height: 24, encoding: 'rgb8' });
  expect(point).toHaveBeenCalled();
  expect(camera).toHaveBeenCalled();
  expect(liveTopics).not.toHaveBeenCalled();
  expect(bus.getChannels('live')).toEqual([]);
  expect(bus.getLatest('live', '/points')).toBeUndefined();
  unbindPoint();
  unbindCamera();
  const count = source.diagnostics.generated;
  source.advance(1000);
  expect(source.diagnostics.generated).toBe(count);
  manager.reset();
  expect(bus.getChannels('simulation')).toEqual([]);
});

it('round-trips a workspace layout bound to the simulation source', () => {
  const layout = { kind: 'panel' as const, panel: {
    id: 'sim', type: 'Viewer3D', source: 'simulation' as const, topic: '/points',
  }};
  expect(serializeLayout(deserializeLayout(serializeLayout(layout)))).toEqual(serializeLayout(layout));
});
