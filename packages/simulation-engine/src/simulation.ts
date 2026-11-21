import type { DataSource, DataSourceSink, MessageEnvelope, TopicDescriptor } from '@labscope/data-source';
import { VirtualCameraPublisher } from './camera.js';
import { FaultInjectionManager, faultIds, type FaultId, type SimulationFrame } from './faults.js';
import { VirtualLidarPublisher, lidarPointCounts, type LidarPointCount } from './lidar.js';
import { CHANNELS, channels, DEFAULT_EPOCH_NS, lidarOverlayChannels, markerChannel, NS_PER_MS } from './messages.js';
import { VirtualMarkerPublisher } from './markers.js';
import { VirtualImuPublisher, VirtualRobotStatePublisher, VirtualTFPublisher } from './robot.js';
import { motionAt, scenarioIds, sceneAt, type ScenarioId } from './scenarios.js';

export const simulationSpeeds = [0.5, 1, 2, 4] as const;
export type SimulationSpeed = typeof simulationSpeeds[number];
export interface SimulationOptions {
  scenario?: ScenarioId;
  seed?: number;
  pointCount?: LidarPointCount;
  ring?: boolean;
  lidarOverlays?: boolean;
  markers?: boolean;
  cameraWidth?: number;
  cameraHeight?: number;
  speed?: SimulationSpeed;
  faults?: readonly FaultId[];
}

const TICK_MS = 20;
const CAMERA_AND_STATIC_TICKS = 10;

export class SimulationDataSource implements DataSource {
  readonly id = 'simulation';
  readonly scenario: ScenarioId;
  readonly seed: number;
  private readonly speed: SimulationSpeed;
  private readonly catalog: readonly TopicDescriptor[];
  private readonly lidars: readonly TopicDescriptor[];
  private readonly lidar: VirtualLidarPublisher;
  private readonly camera: VirtualCameraPublisher;
  private readonly tf = new VirtualTFPublisher();
  private readonly imu = new VirtualImuPublisher();
  private readonly robotState = new VirtualRobotStatePublisher();
  private readonly markers = new VirtualMarkerPublisher();
  private readonly faults: FaultInjectionManager;
  private running = false;
  private tick = 0;
  private remainingMs = 0;
  private sequence = 0;
  private delivered = 0;
  private generated = 0;
  private catalogSize = -1;

  constructor(private readonly sink: DataSourceSink, options: SimulationOptions = {}) {
    this.scenario = options.scenario ?? 'static-room';
    this.seed = options.seed ?? 42;
    this.speed = options.speed ?? 1;
    const pointCount = options.pointCount ?? 10_000;
    if (!scenarioIds.includes(this.scenario) || !lidarPointCounts.includes(pointCount) ||
        !simulationSpeeds.includes(this.speed) || !Number.isInteger(this.seed) ||
        this.seed < 0 || this.seed > 0xffff_ffff || options.faults?.some((fault) => !faultIds.includes(fault))) {
      throw new RangeError('invalid simulation options');
    }
    this.lidar = new VirtualLidarPublisher(pointCount, options.ring);
    this.lidars = options.lidarOverlays ? [channels.points, ...lidarOverlayChannels] : [channels.points];
    this.catalog = [...CHANNELS, ...(options.lidarOverlays ? lidarOverlayChannels : []),
      ...(options.markers ? [markerChannel] : [])];
    this.camera = new VirtualCameraPublisher(options.cameraWidth, options.cameraHeight);
    this.faults = new FaultInjectionManager(options.faults ??
      (this.scenario === 'noisy-sensor' ? ['timestamp-jitter', 'message-drop'] : []));
  }

  get active(): boolean { return this.running; }

  get diagnostics() {
    return { simTimeMs: this.tick * TICK_MS, pendingMs: this.remainingMs, generated: this.generated,
      delivered: this.delivered, delayed: this.faults.pendingCount, queueHighWater: this.faults.highWater,
      delayedBytes: this.faults.pendingBytes, queueHighWaterBytes: this.faults.highWaterBytes,
      dropped: this.faults.dropped, queueOverflow: this.faults.overflow };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.refreshCatalog(this.tick * TICK_MS);
  }

  stop(): void { this.running = false; }

  reset(): void {
    this.stop();
    this.tick = 0;
    this.remainingMs = 0;
    this.sequence = 0;
    this.generated = 0;
    this.delivered = 0;
    this.catalogSize = -1;
    this.robotState.reset();
    this.faults.reset();
    this.sink.reset(this.id);
    this.sink.setChannels(this.id, []);
  }

  /** Deterministic fixed steps. Separate the elapsed wall clock from the producer. */
  advance(wallMs: number): void {
    if (!Number.isFinite(wallMs) || wallMs < 0 || wallMs > 1000) {
      throw new RangeError('advance requires 0–1000 ms of elapsed wall time');
    }
    if (!this.running) return;
    this.remainingMs += wallMs * this.speed;
    while (this.running && this.remainingMs >= TICK_MS) {
      this.remainingMs -= TICK_MS;
      this.tick++;
      this.sample();
    }
  }

  private refreshCatalog(simMs: number): void {
    const available = this.catalog.filter(({ topic }) => this.faults.available(topic, simMs));
    if (available.length === this.catalogSize) return;
    this.catalogSize = available.length;
    this.sink.setChannels(this.id, available);
  }

  private wants(channel: TopicDescriptor, simMs: number): boolean {
    return this.faults.available(channel.topic, simMs) && (this.sink.hasSubscribers?.(this.id, channel.topic) ?? true);
  }

  private deliver(frame: SimulationFrame): void {
    const message: MessageEnvelope = { ...frame, sequence: ++this.sequence };
    this.delivered++;
    this.sink.publish(message);
  }

  private generate(channel: TopicDescriptor, ns: bigint, simMs: number, value: unknown): void {
    const frame: SimulationFrame = { source: this.id, ...channel, logTimeNs: ns.toString(),
      payload: { kind: 'decoded', value } };
    this.generated++;
    for (const ready of this.faults.push(frame, simMs)) this.deliver(ready);
  }

  private sample(): void {
    const simMs = this.tick * TICK_MS;
    const ns = DEFAULT_EPOCH_NS + BigInt(simMs) * NS_PER_MS;
    const time = simMs / 1000;
    const robot = motionAt(this.scenario, time);
    const seed = this.seed ^ Math.imul(this.tick, 0x9e3779b1);
    this.refreshCatalog(simMs);
    for (const ready of this.faults.release(simMs)) {
      if (this.wants(ready, simMs)) this.deliver(ready);
    }

    if (this.wants(channels.imu, simMs)) {
      this.generate(channels.imu, ns, simMs, this.imu.create(ns, robot, this.scenario === 'noisy-sensor', seed));
    }
    if (this.tick % 2 === 0) {
      const pose = this.robotState.sample(ns, robot);
      if (this.wants(channels.pose, simMs)) this.generate(channels.pose, ns, simMs, pose);
      if (this.wants(channels.odom, simMs)) this.generate(channels.odom, ns, simMs, this.robotState.odometry(ns, robot));
      if (this.wants(channels.tf, simMs)) this.generate(channels.tf, ns, simMs, this.tf.dynamic(ns, robot));
    }
    if (this.tick % 5 === 0 && this.lidars.some((channel) => this.wants(channel, simMs))) {
      const scene = sceneAt(this.scenario, time);
      for (const [index, channel] of this.lidars.entries()) {
        if (!this.wants(channel, simMs)) continue;
        const boxes = index === 0 ? scene : index === 1 ? scene.slice(0, 6) : scene.slice(6);
        this.generate(channel, ns, simMs, this.lidar.create(ns, boxes, robot, seed ^ Math.imul(index, 0x85ebca6b)));
      }
    }
    if (this.tick !== 1 && this.tick % CAMERA_AND_STATIC_TICKS !== 0) return;
    if (this.wants(channels.tfStatic, simMs)) {
      this.generate(channels.tfStatic, ns, simMs, this.tf.static(ns));
    }
    if (this.wants(channels.path, simMs)) this.generate(channels.path, ns, simMs, this.robotState.path(ns));
    if (this.catalog.includes(markerChannel) && this.wants(markerChannel, simMs)) {
      this.generate(markerChannel, ns, simMs, this.markers.create(ns, sceneAt(this.scenario, time)));
    }
    if (this.wants(channels.cameraInfo, simMs)) this.generate(channels.cameraInfo, ns, simMs, this.camera.info(ns));
    const color = this.wants(channels.rgb, simMs), depth = this.wants(channels.depth, simMs);
    if (!color && !depth) return;
    const images = this.camera.render(ns, sceneAt(this.scenario, time), robot, color, depth);
    if (images.rgb) this.generate(channels.rgb, ns, simMs, images.rgb);
    if (images.depth) this.generate(channels.depth, ns, simMs, images.depth);
  }
}

/** Switches presets without leaking a previous scene's messages or fault queue. */
export class SimulationScenarioManager {
  private current: SimulationDataSource | undefined;

  constructor(private readonly sink: DataSourceSink) {}

  start(scenario: ScenarioId, options: Omit<SimulationOptions, 'scenario'> = {}): SimulationDataSource {
    const next = new SimulationDataSource(this.sink, { ...options, scenario });
    this.reset();
    this.current = next;
    next.start();
    return next;
  }

  get source(): SimulationDataSource | undefined { return this.current; }
  stop(): void { this.current?.stop(); }
  reset(): void { this.current?.reset(); }
}
