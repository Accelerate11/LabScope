import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { MarkerStore } from '../src/renderer/src/spatial/markers';
import { compose, inverse } from '../src/renderer/src/spatial/ros';
import { TfBuffer } from '../src/renderer/src/spatial/tf-buffer';
import { defaultCamera, validCameraState, viewPresets } from '../src/renderer/src/spatial/camera-state';
import { fullScene } from '../src/renderer/src/spatial/scene-settings';
import { deserializeLayout, serializeLayout } from '../src/renderer/src/workspace/layout';
import { DEFAULT_LAYER_STYLE } from '../src/renderer/src/pointcloud/config';

const stamp = (ms: number) => ({ sec: 42, nanosec: ms * 1e6 });
const vector = (x: number, y = 0, z = 0) => ({ x, y, z });
const rotation = (angle = 0) => ({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
const transform = (parent: string, child: string, ms: number, x = 0, yaw = 0) => ({
  header: { frame_id: parent, stamp: stamp(ms) }, child_frame_id: child,
  transform: { translation: vector(x), rotation: rotation(yaw) },
});
const time = (ms: number) => 42_000_000_000n + BigInt(ms) * 1_000_000n;

it('composes rotated translations and inverts transforms', () => {
  const a = { translation: new Vector3(3, 1, 0), rotation: new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2) };
  const b = { translation: new Vector3(2, 0, 0), rotation: new Quaternion() };
  const combined = compose(a, b);
  expect(combined.translation.distanceTo(new Vector3(3, 3, 0))).toBeLessThan(1e-12);
  const restored = compose(inverse(combined), combined);
  expect(restored.translation.length()).toBeLessThan(1e-12);
  expect(restored.rotation.w).toBeCloseTo(1);
});

it('normalizes and SLERPs sorted samples, then follows the chain both directions', () => {
  const tf = new TfBuffer();
  tf.ingest({ transforms: [transform('map', 'odom', 0, 10), transform('base', 'lidar', 0, 1)] }, true);
  const later = transform('odom', 'base', 200, 2, Math.PI);
  later.transform.rotation.z *= 2;
  later.transform.rotation.w *= 2;
  tf.ingest({ transforms: [later, transform('odom', 'base', 0)] }, false);
  const result = tf.lookup('map', 'lidar', time(100));
  expect(result.translation.distanceTo(new Vector3(11, 1, 0))).toBeLessThan(1e-10);
  expect(result.rotation.length()).toBeCloseTo(1);
  expect(new Vector3(1, 0, 0).applyQuaternion(result.rotation).y).toBeCloseTo(1);
  expect(compose(tf.lookup('lidar', 'map', time(100)), result).translation.length()).toBeLessThan(1e-12);
  expect(tf.tree().find(({ frame }) => frame === 'lidar')).toMatchObject({ parent: 'base', static: true });
});

it('uses the common ancestor without sampling irrelevant dynamic edges', () => {
  const tf = new TfBuffer();
  tf.ingest({ transforms: [transform('map', 'base', 0)] }, false);
  tf.ingest({ transforms: [transform('base', 'camera', 0, 2), transform('base', 'lidar', 0, 1)] }, true);
  expect(tf.lookup('camera', 'lidar', time(900)).translation.x).toBe(-1);
  expect(() => tf.lookup('map', 'lidar', time(900))).toThrow(expect.objectContaining({ code: 'gap' }));
});

it('reports past, future, long gaps and disconnected or missing frames', () => {
  const tf = new TfBuffer();
  tf.ingest({ transforms: [transform('map', 'base', 100, 1), transform('map', 'base', 800, 8)] }, false);
  tf.ingest({ transforms: [transform('other', 'sensor', 0, 3)] }, true);
  for (const [frame, ms, code] of [
    ['base', 10, 'past'], ['base', 400, 'gap'], ['base', 900, 'future'],
    ['sensor', 100, 'disconnected'], ['ghost', 100, 'missing-frame'],
  ] as const) expect(() => tf.lookup('map', frame, time(ms))).toThrow(expect.objectContaining({ code }));
  expect(tf.lookup('map', 'base', time(800)).translation.x).toBe(8);
});

it('rejects cycles and parent conflicts while keeping valid transforms, and can remove a frame', () => {
  const tf = new TfBuffer();
  tf.ingest({ transforms: [transform('map', 'base', 0)] }, true);
  expect(tf.ingest({ transforms: [transform('base', 'map', 0), transform('base', 'camera', 0)] }, true))
    .toMatchObject({ accepted: 1, error: expect.stringContaining('循环') });
  expect(tf.ingest({ transforms: [transform('other', 'base', 0)] }, true).error).toContain('冲突');
  tf.remove('camera');
  expect(tf.frames).not.toContain('camera');
  expect(tf.lookup('base', 'map', time(800)).translation.length()).toBe(0);
  tf.clear();
  expect(tf.frames).toEqual([]);
});

it('replaces ordered duplicates, drops received samples older than the bounded cache, and clears by kind', () => {
  const tf = new TfBuffer();
  tf.ingest({ transforms: [transform('map', 'base', 0), transform('base', 'lidar', 0)] }, true);
  const recent = transform('base', 'imu', 20, 5);
  recent.header.stamp.sec = 70;
  tf.ingest({ transforms: [recent, transform('base', 'imu', 10)] }, false);
  recent.transform.translation.x = 6;
  tf.ingest({ transforms: [recent] }, false);
  expect(tf.lookup('map', 'imu', 70_020_000_000n).translation.x).toBe(6);
  expect(() => tf.lookup('map', 'imu', time(20))).toThrow(expect.objectContaining({ code: 'past' }));
  tf.clearKind(false);
  expect(tf.frames).toEqual(['base', 'lidar', 'map']);
});

const mark = (type: number, ns = 'demo', id = 1) => ({
  header: { frame_id: 'map', stamp: stamp(0) }, ns, id, type, action: 0,
  pose: { position: vector(1), orientation: rotation() }, scale: vector(1, 1, 1),
  color: { r: 1, g: 0.5, b: 0, a: 0.25 }, lifetime: { sec: 0, nanosec: 200_000_000 },
  frame_locked: true, points: [], colors: [], text: 'test',
});

it('handles Marker namespaces, all seven shapes, updates and independent expiry', () => {
  const store = new MarkerStore();
  expect(store.apply({ markers: [0, 1, 2, 4, 5, 8, 9].map((type) => mark(type, 'demo', type)) }, true, time(0))).toBeNull();
  expect([...store.values].map(({ type }) => type)).toEqual([0, 1, 2, 4, 5, 8, 9]);
  store.apply({ ...mark(1, 'alternate'), lifetime: { sec: 0, nanosec: 0 } }, false, time(10));
  store.apply(mark(1), false, time(100));
  expect(store.expire(time(200))).toBe(true);
  expect([...store.values]).toHaveLength(2);
  expect(store.expire(time(300))).toBe(true);
  expect([...store.values].map(({ key }) => key)).toEqual(['["alternate",1]']);
});

it('handles Marker DELETE/DELETEALL and isolates invalid records', () => {
  const store = new MarkerStore();
  const invalid = { ...mark(0), points: [vector(1)] };
  expect(store.apply({ markers: [mark(4), invalid, mark(2, 'other')] }, true, time(0))).toContain('端点');
  expect([...store.values]).toHaveLength(2);
  store.apply({ ns: 'demo', id: 1, action: 2 }, false, time(0));
  expect([...store.values]).toHaveLength(1);
  store.apply({ action: 3 }, false, time(0));
  expect([...store.values]).toHaveLength(0);
});

it('persists orthographic camera and Fixed Frame in an ordinary workspace layout', () => {
  const camera = { ...defaultCamera, projection: 'orthographic' as const, position: viewPresets.top };
  expect(validCameraState(camera)).toBe(true);
  expect(validCameraState({ ...camera, position: camera.target })).toBe(false);
  const layout = { kind: 'panel', panel: { id: '3d', type: 'Viewer3D', source: 'simulation', topic: '/points',
    pointCloud: { primary: DEFAULT_LAYER_STYLE, overlays: [], scene: { ...fullScene, camera, fixedFrame: 'odom' } },
  } } as const;
  expect(deserializeLayout(serializeLayout({ ...layout }))).toEqual(layout);
});
