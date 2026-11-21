import { SimulationDataSource } from '@labscope/simulation-engine';
import type { PointCloud2Message } from '@labscope/ros-schema';
import { DEFAULT_LAYER_STYLE } from '../../src/renderer/src/pointcloud/config';
import { PointCloudViewerEngine, type ViewerStats } from '../../src/renderer/src/pointcloud/viewer-engine';
import { MessageBus, type MessageEnvelope, type SourceId } from '../../src/renderer/src/workspace/message-bus';
import { PlaybackFeed } from '../../src/renderer/src/workspace/playback-feed';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const liveTopics: string[][] = [];
  const bus = new MessageBus((topics) => liveTopics.push(topics));
  const replay = new PlaybackFeed(bus);
  let stats: ViewerStats | undefined;
  let sample: MessageEnvelope | undefined;
  let rendererError: string | undefined;
  const viewer = new PointCloudViewerEngine(document.querySelector('#canvas')!, bus, (value) => { stats = value; },
    (error) => { rendererError = error; });
  const gl = viewer.canvasElement.getContext('webgl2')!;
  async function wait(predicate: (stats: ViewerStats) => unknown, label: string) {
    const deadline = performance.now() + 4_000;
    while (performance.now() < deadline) {
      if (rendererError) throw new Error(rendererError);
      if (stats && predicate(stats)) return stats;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(label);
  }
  const topic = '/points';
  const source = new SimulationDataSource({
    setChannels(_source, channels) {
      bus.setChannels('simulation', channels);
      bus.setChannels('live', channels);
      replay.load(channels);
    },
    publish(frame) {
      if (frame.topic !== topic) return;
      bus.publish(frame);
      replay.deliver(frame);
      bus.publishLive({
        topics: [{
          topic, schemaName: frame.schemaName, sample: {}, pointCloud: frame.payload.value,
          channelId: 1, encoding: 'cdr', count: 1, bytes: 0, rateHz: 0, lastLogTimeNs: frame.logTimeNs,
          lastReceiveAt: null, decodeErrors: 0, sampleSequence: frame.sequence, sampleLogTimeNs: frame.logTimeNs!,
        }], totalMessages: 1, totalBytes: 0, uptimeMs: 0, timestamp: 0,
      });
      sample = frame;
    },
    reset(source) { bus.reset(source); },
    hasSubscribers(_source, candidate) { return candidate === topic; },
  });
  try {
    const sources: SourceId[] = ['simulation', 'live', 'playback'];
    viewer.sync(sources.map((source) => ({ ...DEFAULT_LAYER_STYLE, id: source, topic, source })));
    source.start();
    source.advance(100);
    const first = await wait((stats) => stats.points === 30_000, 'Three decoded source routes did not render');
    assert(first.layers.every(({ frame, count, stamp, logTimeNs }) =>
      frame === 'lidar_link' && count === 10_000 && stamp === first.layers[0]?.stamp && logTimeNs === sample?.logTimeNs),
      'Sources disagreed on count or metadata');
    assert(liveTopics.length === 1 && liveTopics[0]?.join() === topic, 'Simulation or playback requested live IPC');
    assert(sample?.payload.kind === 'decoded', 'simulator did not emit a decoded frame');
    const original = sample;
    const raw = original.payload.value as PointCloud2Message;
    const before = raw.data.slice();
    function publishPlayback(sequence: number, value: PointCloud2Message) {
      replay.deliver({ ...original, sequence, payload: { kind: 'decoded', value } });
    }

    publishPlayback(100, { ...raw, header: { ...raw.header, frame_id: 'another_lidar' } });
    await wait((stats) => stats.points === 20_000 && stats.layers[2]?.frameMismatch, 'Cross-frame layer was overlaid');

    publishPlayback(101, { ...raw, fields: raw.fields.map((field) =>
      field.name === 'x' ? { ...field, offset: raw.point_step } : field) });
    await wait((stats) => stats.points === 20_000 && stats.layers[2]?.error, 'Malformed schema did not clear only its layer');

    for (const sequence of [102, 103, 104]) publishPlayback(sequence, raw);
    const restored = await wait((stats) => stats.points === 30_000 && stats.dropped >= 2, 'Display burst was not coalesced');
    assert(restored.layers[2]?.allocations === 1, 'Clearing or updating allocated another GPU buffer capacity');
    assert(before.every((value, index) => raw.data[index] === value), 'Rendering modified original data');

    replay.seek();
    await wait((stats) => stats.points === 20_000 && !stats.layers[2]?.stamp, 'Playback seek did not clear metadata and geometry');
    bus.reset('live');
    bus.reset('simulation');
    const cleared = await wait((stats) => stats.points === 0, 'Source reset did not clear points');
    assert(cleared.queuePeak <= 3, 'Queue exceeded one slot per layer');
  } finally {
    viewer.dispose();
    source.reset();
    replay.close();
  }
  await Promise.resolve();
  assert(gl.isContextLost() && !viewer.canvasElement.isConnected, 'GPU context or canvas was retained');
  assert(liveTopics.at(-1)?.length === 0 && !bus.hasSubscribers('simulation', topic) &&
    !bus.hasSubscribers('live', topic) && !bus.hasSubscribers('playback', topic), 'Closing did not release topic subscriptions');
}

run().then(() => {
  document.body.dataset.result = JSON.stringify({ passed: true, sources: 3, burst: true, frameGuard: true, released: true });
}).catch((error: unknown) => {
  document.body.dataset.result = JSON.stringify({ passed: false, error: String(error) });
});
