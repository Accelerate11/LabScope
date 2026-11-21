import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MessageEnvelope, TopicDescriptor } from '../../data-source/src/index';
import { FaultInjectionManager, SimulationDataSource, SimulationScenarioManager, VirtualCameraPublisher,
  VirtualImuPublisher, VirtualLidarPublisher, VirtualRobotStatePublisher, VirtualTFPublisher, lidarPointCounts,
  scenarioIds } from '../src/index';
import type { SimulationFrame } from '../src/faults';
import { motionAt, sceneAt } from '../src/scenarios';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const epoch = 1_700_000_000_000_000_000n;

function capture(demand: string[]) {
  const messages: MessageEnvelope[] = [];
  let catalog: readonly TopicDescriptor[] = [];
  return { messages, get catalog() { return catalog; }, sink: {
    publish(frame: MessageEnvelope) { messages.push(frame); },
    setChannels(_source: string, value: readonly TopicDescriptor[]) { catalog = value; },
    reset() { messages.length = 0; },
    hasSubscribers(_source: string, topic: string) { return demand.includes(topic); },
  }};
}

describe('publishers and clock', () => {
  it('advertises three compatible clouds and generates only subscribed overlays', () => {
    const demand = ['/points/structure'];
    const result = capture(demand);
    const source = new SimulationDataSource(result.sink, { lidarOverlays: true });
    source.start();
    source.advance(100);
    expect(result.catalog.filter((channel) => channel.schemaName === 'sensor_msgs/msg/PointCloud2').map(({ topic }) => topic))
      .toEqual(['/points', '/points/structure', '/points/objects']);
    expect(result.messages.map(({ topic }) => topic)).toEqual(['/points/structure']);
    demand.push('/points', '/points/objects');
    source.advance(100);
    const aligned = result.messages.slice(1);
    expect(aligned).toHaveLength(3);
    expect(new Set(aligned.map(({ logTimeNs }) => logTimeNs)).size).toBe(1);
    for (const frame of aligned) expect(frame.payload.value).toMatchObject({ header: { frame_id: 'lidar_link' } });
  });

  it.each(lidarPointCounts)('writes %i points with ROS field offsets and reproducible bytes', (count) => {
    const lidar = new VirtualLidarPublisher(count, count !== 50_000);
    const create = (seed: number) => lidar.create(epoch, sceneAt('static-room', 0), motionAt('static-room', 0), seed);
    const cloud = create(42);
    expect(cloud.header).toEqual({ frame_id: 'lidar_link', stamp: { sec: 1700000000, nanosec: 0 } });
    expect(cloud.width).toBe(count);
    expect(cloud.row_step).toBe(cloud.point_step * count);
    expect(cloud.data).toHaveLength(cloud.row_step);
    expect(cloud.fields.some(({ name }) => name === 'ring')).toBe(count !== 50_000);
    expect(digest(cloud.data)).toBe(digest(create(42).data));
    expect(digest(cloud.data)).not.toBe(digest(create(43).data));
    const view = new DataView(cloud.data.buffer);
    expect(view.getFloat32(4 * cloud.point_step + 8, true)).toBeCloseTo(-0.95);
  });

  it('renders geometry-dependent RGB and metric depth with matching intrinsics', () => {
    const camera = new VirtualCameraPublisher(80, 50);
    const robot = motionAt('static-room', 0), scene = sceneAt('static-room', 0);
    const { rgb, depth } = camera.render(epoch, scene, robot, true, true);
    const repeated = camera.render(epoch, scene, robot, true, true);
    expect(digest(rgb!.data)).toBe(digest(repeated.rgb!.data));
    expect(digest(depth!.data)).toBe(digest(repeated.depth!.data));
    expect(rgb).toMatchObject({ width: 80, height: 50, step: 240, encoding: 'rgb8' });
    expect(depth).toMatchObject({ step: 320, encoding: '32FC1' });
    expect(camera.info(epoch).header).toEqual(rgb!.header);
    const values = Array.from(new Float32Array(depth!.data.buffer));
    expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(5);
    expect(new Set(rgb!.data).size).toBeGreaterThan(20);
    const rotated = camera.render(epoch, scene, { ...robot, yaw: Math.PI / 2 }, true, false);
    expect(digest(rotated.rgb!.data)).not.toBe(digest(rgb!.data));
    const center = new DataView(depth!.data.buffer).getFloat32((25 * 80 + 40) * 4, true);
    expect(center).toBeCloseTo(4.3, 1);
  });

  it('keeps TF, odometry, IMU and path spatially consistent', () => {
    const robot = motionAt('moving-robot', 2);
    const tf = new VirtualTFPublisher();
    const statics = tf.static(epoch).transforms;
    expect(statics.map(({ child_frame_id }) => child_frame_id)).toEqual([
      'odom', 'lidar_link', 'camera_link', 'camera_optical_frame', 'imu_link',
    ]);
    const dyn = tf.dynamic(epoch, robot).transforms[0]!;
    const state = new VirtualRobotStatePublisher();
    const pose = state.sample(epoch, robot), odom = state.odometry(epoch, robot);
    expect(dyn.transform.translation).toEqual(pose.pose.position);
    expect(dyn.transform.rotation).toEqual(odom.pose.pose.orientation);
    expect(odom.twist.twist.linear.x).toBeCloseTo(Math.hypot(robot.vx, robot.vy));
    for (const transform of [...statics, dyn]) {
      const { x, y, z, w } = transform.transform.rotation;
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1);
    }
    const { x, y, z, w } = statics.find((frame) => frame.child_frame_id === 'camera_optical_frame')!.transform.rotation;
    expect([2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]).toEqual([1, 0, 0]);
    expect(state.path(epoch).poses).toEqual([pose]);
    const imu = new VirtualImuPublisher();
    expect(imu.create(epoch, robot, true, 42)).toEqual(imu.create(epoch, robot, true, 42));
    expect(imu.create(epoch, robot, true, 42).linear_acceleration)
      .not.toEqual(imu.create(epoch, robot, false, 42).linear_acceleration);
  });

  it.each(scenarioIds)('starts, stops, resets and reproduces %s independently', (scenario) => {
    const { sink, messages } = capture(['/imu/data']);
    const manager = new SimulationScenarioManager(sink);
    const source = manager.start(scenario);
    source.advance(60);
    source.advance(140);
    const baseline = structuredClone(messages);
    manager.stop();
    source.advance(100);
    expect(messages).toEqual(baseline);
    manager.reset();
    expect(messages).toEqual([]);
    expect(source.diagnostics.simTimeMs).toBe(0);
    source.start();
    source.advance(200);
    expect(messages).toEqual(baseline);
    expect(source.diagnostics.generated).toBe(10);
  });

  it('uses logical sample time and sim speed', () => {
    const { sink, messages } = capture(['/imu/data']);
    const source = new SimulationDataSource(sink, { speed: 4 });
    source.start();
    source.advance(100);
    expect(source.diagnostics.simTimeMs).toBe(400);
    expect(messages).toHaveLength(20);
    expect(messages[19]!.logTimeNs).toBe('1700000000400000000');
    expect(messages.every(({ source: id }) => id === 'simulation')).toBe(true);
    expect(() => source.advance(NaN)).toThrow(RangeError);
    expect(() => new SimulationDataSource(sink, { seed: -1 })).toThrow(RangeError);
  });
});

describe('fault injection', () => {
  const imu: SimulationFrame = { source: 'simulation', topic: '/imu/data',
    schemaName: 'sensor_msgs/msg/Imu', logTimeNs: epoch.toString(),
    payload: { kind: 'decoded', value: { header: { frame_id: 'imu_link', stamp: { sec: 1700000000, nanosec: 0 } } } } };

  it('drops and bursts reproducibly per topic', () => {
    const faults = new FaultInjectionManager(['message-drop', 'burst-messages']);
    const lengths = () => Array.from({ length: 7 }, (_, index) => faults.push(imu, index * 20).length);
    expect(lengths()).toEqual([1, 1, 1, 1, 0, 1, 4]);
    faults.reset();
    expect(lengths()).toEqual([1, 1, 1, 1, 0, 1, 4]);
  });

  it('delays delivery and jitters both timestamps while retaining the pristine input', () => {
    const faults = new FaultInjectionManager(['message-delay', 'timestamp-jitter']);
    const input = { ...imu, logTimeNs: (epoch + 20_000_000n).toString() };
    const original = structuredClone(input);
    expect(faults.push(input, 0)[0]!.logTimeNs).toBe((epoch + 13_000_000n).toString());
    faults.push(input, 20);
    faults.push(input, 40);
    expect(faults.push(input, 60)).toEqual([]);
    expect(faults.release(139)).toEqual([]);
    const released = faults.release(140)[0]!;
    expect(released.logTimeNs).toBe((epoch + 27_000_000n).toString());
    expect(released.payload.value).toMatchObject({ header: { stamp: { nanosec: 27_000_000 } } });
    expect(input).toEqual(original);
  });

  it('omits dynamic TF samples and delivers delayed older TF after a newer frame', () => {
    const missing = new FaultInjectionManager(['tf-missing']);
    const tf = { ...imu, topic: '/tf', schemaName: 'tf2_msgs/msg/TFMessage' };
    expect([0, 40, 80].map((time) => missing.push(tf, time).length)).toEqual([1, 1, 0]);
    const disorder = new FaultInjectionManager(['tf-out-of-order']);
    disorder.push(tf, 0);
    const older = { ...tf, logTimeNs: (epoch + 40_000_000n).toString() };
    expect(disorder.push(older, 40)).toEqual([]);
    expect(disorder.push({ ...tf, logTimeNs: (epoch + 80_000_000n).toString() }, 80)).toHaveLength(1);
    expect(disorder.release(160)).toEqual([older]);
  });

  it('injects a NaN and invalid schema while preserving the source bytes', () => {
    const cloud = new VirtualLidarPublisher(10_000).create(epoch, sceneAt('static-room', 0), motionAt('static-room', 0), 1);
    const input = { ...imu, topic: '/points', schemaName: 'sensor_msgs/msg/PointCloud2',
      payload: { kind: 'decoded' as const, value: cloud } };
    const fault = new FaultInjectionManager(['nan-point', 'invalid-pointcloud-schema']);
    const checksum = digest(cloud.data);
    const values = Array.from({ length: 4 }, (_, i) => fault.push(input, i * 100)[0]!.payload.value as typeof cloud);
    expect(new DataView(values[2]!.data.buffer).getFloat32(0, true)).toBeNaN();
    expect(values[2]!.is_dense).toBe(false);
    expect(values[3]!.fields[0]!.offset).toBeGreaterThan(cloud.point_step);
    expect(digest(cloud.data)).toBe(checksum);
    expect(cloud.fields[0]!.offset).toBe(0);
  });

  it('withdraws and re-advertises the disconnected camera topics', () => {
    const report = capture(['/imu/data']);
    const source = new SimulationDataSource(report.sink, { faults: ['sensor-disconnect'] });
    source.start();
    expect(report.catalog).toHaveLength(10);
    source.advance(1000);
    expect(report.catalog).toHaveLength(7);
    source.advance(1000);
    expect(report.catalog).toHaveLength(10);
    expect(report.messages).toHaveLength(100);
  });

  it('bounds the delayed queue by message count and bulk bytes', () => {
    const delay = new FaultInjectionManager(['message-delay', 'burst-messages']);
    for (let index = 0; index < 300; index++) delay.push(imu, 1);
    expect(delay.pendingCount).toBe(32);
    expect(delay.overflow).toBeGreaterThan(0);
    delay.reset();
    const bulk = { ...imu, payload: { kind: 'decoded' as const, value: { data: new Uint8Array(12_000_000) } } };
    for (let index = 0; index < 60; index++) delay.push(bulk, 1);
    expect(delay.pendingCount).toBe(4);
    expect(delay.pendingBytes).toBeLessThanOrEqual(48 * 1024 * 1024);
    delay.release(81);
    expect(delay.pendingBytes).toBe(0);
  });
});
