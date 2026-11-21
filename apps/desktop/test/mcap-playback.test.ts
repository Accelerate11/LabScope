import { zstdCompressSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { McapPlaybackDataSource } from '../src/renderer/src/spatial/mcap-playback';
import { SceneFeed } from '../src/renderer/src/spatial/scene-feed';
import { fullScene } from '../src/renderer/src/spatial/scene-settings';
import { MessageBus } from '../src/renderer/src/workspace/message-bus';
import { makeVisualizationMcap } from './visualization-mcap-fixture';

it.each([false, true])('opens real indexed ROS 2 MCAP and reconstructs the scene on seek (zstd=%o)', async (zstd) => {
  const bus = new MessageBus(() => { throw new Error('Replay must not invoke live IPC'); });
  const file = await makeVisualizationMcap(zstd ? (data) => ({
    compression: 'zstd', compressedData: zstdCompressSync(data),
  }) : undefined);
  const playback = await McapPlaybackDataSource.open(file, bus);
  playback.mount();
  const detach = bus.subscribe('playback', '/points', () => {});
  const scene = new SceneFeed('playback', bus, fullScene);
  try {
    await playback.seek(530);
    expect(playback.state.error).toBeNull();
    const points = bus.getLatest('playback', '/points');
    expect(points?.payload.value).toMatchObject({ width: 10_000, header: { frame_id: 'lidar_link' } });
    expect(scene.tf.lookup('map', 'lidar_link', BigInt(points!.logTimeNs!)).translation.z).toBeCloseTo(0.85);
    expect(scene.topics.get('/path')?.poses?.length).toBeGreaterThan(3);
    expect([...scene.topics.get('/visualization_marker_array')!.markers!.values]).toHaveLength(7);
    await playback.seek(10);
    expect(bus.getLatest('playback', '/points')).toBeUndefined();
    expect(scene.tf.frames).toContain('base_link');
  } finally {
    playback.close();
    detach();
    scene.dispose();
  }
  expect(bus.getChannels('playback')).toEqual([]);
});

it('rejects missing or invalid MCAP indexes', async () => {
  await expect(McapPlaybackDataSource.open(new Blob(['invalid']), new MessageBus(() => {}))).rejects.toThrow();
});
