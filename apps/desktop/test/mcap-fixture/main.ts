import { PointCloudViewerEngine, type ViewerStats } from '../../src/renderer/src/pointcloud/viewer-engine';
import { DEFAULT_LAYER_STYLE } from '../../src/renderer/src/pointcloud/config';
import { McapPlaybackDataSource } from '../../src/renderer/src/spatial/mcap-playback';
import { fullScene } from '../../src/renderer/src/spatial/scene-settings';
import { MessageBus } from '../../src/renderer/src/workspace/message-bus';
import { makeVisualizationMcap } from '../visualization-mcap-fixture';

const waitTime = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wait(check: () => unknown, label: string): Promise<void> {
  const end = performance.now() + 5500;
  while (performance.now() < end) {
    if (check()) return;
    await waitTime(25);
  }
  throw new Error(label);
}

async function run() {
  let stats: ViewerStats | undefined;
  let rendererError: string | undefined;
  const bus = new MessageBus(() => { throw new Error('MCAP started live IPC'); }, (error) => { rendererError = String(error); });
  const source = await McapPlaybackDataSource.open(await makeVisualizationMcap(), bus);
  const mount = () => {
    const engine = new PointCloudViewerEngine(document.querySelector('#canvas')!, bus, (s) => { stats = s; },
      (error) => { rendererError = error; });
    engine.configureScene(fullScene, 'playback');
    engine.sync([{ ...DEFAULT_LAYER_STYLE, id: 'main', source: 'playback', topic: '/points' }]);
    return engine;
  };
  const full = () => {
    if (rendererError || source.state.error) throw new Error(rendererError ?? source.state.error ?? 'unknown');
    return stats?.points === 10_000 && stats.fixedFrame === 'map' && stats.scene.some((state) =>
      state.source === 'playback' && state.visibleFrames === 7 && state.poses === 1 && state.odometry === 1 &&
      state.pathPoints > 2 && state.markers === 7);
  };
  let viewer = mount();
  source.mount();
  try {
    await source.seek(530);
    await wait(full, 'indexed MCAP seek did not draw the full scene');
    viewer.configureScene({ ...fullScene, pathMeters: 0.01 }, 'playback');
    await wait(() => stats?.scene[0]?.pathPoints === 3, 'metric cap should retain a two-point path and one seek-restored odometry pose');
    viewer.configureScene(fullScene, 'playback');
    source.start();
    await wait(() => source.state.timeMs > 620, 'MCAP did not advance');
    source.stop();
    const paused = source.state.timeMs;
    await waitTime(950);
    if (source.state.timeMs !== paused) throw new Error('Pause advanced the source clock');
    await wait(full, 'Marker expired while playback was paused');
    source.start();
    await wait(() => source.state.timeMs > 880, 'Resume did not preserve the cursor');
    source.stop();

    const event = bus.getLatest('playback', '/visualization_marker_array')!;
    const previous = event.payload.value as { markers: { ns: string; id: number; type: number; scale: { x: number; y: number } }[] };
    const pointMarker = previous.markers.find((marker) => marker.type === 8)!;
    const sendMarker = (sequence: number, marker: unknown) => bus.publish({ ...event, sequence,
      payload: { kind: 'decoded', value: { markers: [marker] } } });
    sendMarker(1_000_000, { ...pointMarker, scale: { ...pointMarker.scale, y: pointMarker.scale.x * 0.5 } });
    await wait(full, 'non-square Marker POINTS scale');
    await waitTime(800);
    if (viewer.canvasElement.getContext('webgl2')!.getError() !== 0) throw new Error('Marker POINTS shader failed');
    sendMarker(1_000_001, { ns: pointMarker.ns, id: pointMarker.id, action: 2 });
    await wait(() => stats?.scene[0]?.markers === 6, 'Marker DELETE did not clear only its ID');
    sendMarker(1_000_002, { action: 3 });
    await wait(() => stats?.scene[0]?.markers === 0, 'Marker DELETEALL did not clear the topic');
    await source.seek(530);
    await wait(full, 'Seek did not restore Marker history');
    const clock = bus.getClock('playback')!;
    bus.setClock('playback', clock + 900_000_000n);
    await wait(() => stats?.scene[0]?.markers === 0, 'Marker lifetime did not clear GPU objects');
    await source.seek(0);
    await wait(() => stats?.points === 0 && !stats.layers[0]?.stamp, 'Backward seek retained the old cloud');

    const canvas = viewer.canvasElement;
    const gl = canvas.getContext('webgl2')!;
    viewer.dispose();
    await wait(() => !canvas.isConnected && gl.isContextLost(), 'Previous renderer did not release its context');
    stats = undefined;
    viewer = mount();
    await source.seek(530);
    await wait(full, 'Reopening renderer did not resubscribe and draw MCAP');
  } finally {
    viewer.dispose();
    source.close();
  }
  if (bus.getChannels('playback').length || bus.hasSubscribers('playback', '/points')) throw new Error('Replay retained subscriptions');
}

run().then(() => {
  document.body.dataset.result = JSON.stringify({ passed: true, mcap: true, seek: true, pause: true, resume: true,
    markerExpiry: true, markerActions: true, metricPath: true, reopen: true });
}).catch((error: unknown) => { document.body.dataset.result = JSON.stringify({ passed: false, error: String(error) }); });
