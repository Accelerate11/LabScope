import { expect, it } from 'vitest';
import { DEFAULT_LAYER_STYLE, type PointCloudConfig } from '../src/renderer/src/pointcloud/config';
import { deserializeLayout, serializeLayout } from '../src/renderer/src/workspace/layout';

const settings: PointCloudConfig = {
  primary: { ...DEFAULT_LAYER_STYLE, colorMode: 'intensity', maxPoints: 50_000 },
  overlays: [
    { ...DEFAULT_LAYER_STYLE, source: 'simulation', topic: '/points/structure', pointSize: 3 },
    { ...DEFAULT_LAYER_STYLE, source: 'playback', topic: '/points', visible: false, sampling: 'first' },
  ],
};

it('persists per-topic settings and accepts legacy Viewer3D layouts', () => {
  const panel = { id: 'viewer', type: 'Viewer3D', source: 'simulation', topic: '/points' } as const;
  for (const pointCloud of [undefined, settings]) {
    const layout = { kind: 'panel', panel: { ...panel, pointCloud } } as const;
    expect(deserializeLayout(serializeLayout(layout))).toEqual(layout);
  }
});

it('falls back to safe settings without discarding the rest of the workbench', () => {
  const layout = deserializeLayout(JSON.stringify({ version: 1, root: { kind: 'panel', panel: {
    id: 'viewer', type: 'Viewer3D', source: 'simulation', topic: '/points',
    pointCloud: { ...settings, primary: { ...settings.primary, maxPoints: 2_000_000 } },
  } } }));
  expect(layout).toMatchObject({ kind: 'panel', panel: { id: 'viewer', topic: '/points' } });
  expect(layout?.kind === 'panel' && layout.panel.pointCloud).toBeUndefined();
});
