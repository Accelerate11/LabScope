import { spatialSchemaNames, spatialSchemas as schema } from '../../../shared/spatial-schemas';
import type { MessageBus, MessageEnvelope, SourceId } from '../workspace/message-bus';
import { MarkerStore } from './markers';
import { frameId, header, nanoseconds, object, pose, type RigidTransform } from './ros';
import type { SceneSettings } from './scene-settings';
import { TfBuffer } from './tf-buffer';

export interface StampedPose { frame: string; time: bigint; pose: RigidTransform }
interface TopicState {
  schema: string;
  detach: () => void;
  poses?: StampedPose[];
  markers?: MarkerStore;
  error?: string | null;
}

export const sceneKey = (source: SourceId, name: string) => source + ':' + name;
const MAX_PATH = 2048;
const MAX_TOPICS = 24;

export class SceneFeed {
  readonly tf = new TfBuffer();
  readonly topics = new Map<string, TopicState>();
  revision = 0;
  private settings: SceneSettings;
  private readonly detach: (() => void)[];

  constructor(readonly source: SourceId, private readonly bus: MessageBus, settings: SceneSettings) {
    this.settings = settings;
    this.detach = [
      bus.subscribeChannels(source, () => this.refresh()),
      bus.subscribeReset(source, () => this.clear()),
      bus.subscribeClock(source, () => this.expire()),
    ];
    this.refresh();
  }

  get clock(): bigint { return this.bus.getClock(this.source) ?? 0n; }

  configure(settings: SceneSettings): void {
    this.settings = settings;
    this.refresh();
    this.revision++;
  }

  private enabled(name: string): boolean {
    const s = this.settings;
    switch (name) {
      case schema.tf: return s.fixedFrame !== null || s.transforms || s.pose || s.odometry || s.path || s.markers;
      case schema.pose: return s.pose;
      case schema.odom: return s.odometry || s.path;
      case schema.path: return s.path;
      case schema.marker:
      case schema.markers: return s.markers;
      default: return false;
    }
  }

  private refresh(): void {
    const offered = this.bus.getChannels(this.source);
    const desired = new Map(offered.filter((item) => this.enabled(item.schemaName))
      .sort((a, b) => Number(b.schemaName === schema.tf) - Number(a.schemaName === schema.tf))
      .slice(0, MAX_TOPICS).map((item) => [item.topic, item.schemaName]));
    for (const [topic, state] of this.topics) if (desired.get(topic) !== state.schema) {
      state.detach();
      this.topics.delete(topic);
      if (state.schema === schema.tf) {
        // A withdrawn transform stream invalidates its cache. Other TF topics remain subscribed.
        this.tf.clearKind(this.isStatic(topic));
      }
    }
    for (const [topic, schemaName] of desired) {
      if (this.topics.has(topic)) continue;
      const receive = () => this.read(topic, this.bus.getLatest(this.source, topic));
      this.topics.set(topic, { schema: schemaName, detach: this.bus.subscribe(this.source, topic, receive) });
      receive();
    }
    this.revision++;
  }

  private isStatic(topic: string): boolean { return topic.endsWith('/tf_static'); }

  private clear(): void {
    this.tf.clear();
    for (const item of this.topics.values()) {
      item.poses = undefined;
      item.markers?.clear();
      item.error = null;
    }
    this.revision++;
  }

  private expire(): void {
    for (const topic of this.topics.values()) if (topic.markers?.expire(this.clock)) this.revision++;
  }

  private read(topic: string, frame: MessageEnvelope | undefined): void {
    const state = this.topics.get(topic)!;
    this.revision++;
    state.error = null;
    if (!frame) {
      if (state.schema === schema.tf) this.tf.clearKind(this.isStatic(topic));
      state.poses = undefined;
      state.markers?.clear();
      return;
    }
    if (frame.payload.kind !== 'decoded' || !spatialSchemaNames.has(frame.schemaName) || state.schema !== frame.schemaName) {
      state.error = '等待完整 ROS 解码消息';
      return;
    }
    try {
      const value = frame.payload.value;
      switch (state.schema) {
        case schema.tf:
          state.error = this.tf.ingest(value, this.isStatic(topic)).error;
          break;
        case schema.marker:
        case schema.markers:
          state.markers ??= new MarkerStore();
          state.error = state.markers.apply(value, state.schema === schema.markers,
            frame.logTimeNs && /^-?\d{1,22}$/.test(frame.logTimeNs) ? BigInt(frame.logTimeNs) : this.clock);
          state.markers.expire(this.clock);
          break;
        case schema.path: {
          const path = object(value);
          const root = header(path.header);
          if (!Array.isArray(path.poses)) throw new Error('无效 Path 消息');
          state.poses = path.poses.slice(-MAX_PATH).map((item: unknown) => {
            const p = object(item), h = object(p.header);
            const time = nanoseconds(h.stamp);
            return { frame: h.frame_id === '' ? root.frame : frameId(h.frame_id), time, pose: pose(p.pose) };
          });
          break;
        }
        case schema.pose:
        case schema.odom: {
          const message = object(value);
          const stamped = { ...header(message.header),
            pose: pose(state.schema === schema.odom ? object(message.pose).pose : message.pose) };
          const history = state.poses ??= [];
          const index = history.findIndex((entry) => entry.time >= stamped.time);
          if (index === -1) history.push(stamped);
          else history.splice(index, history[index]?.time === stamped.time ? 1 : 0, stamped);
          if (history.length > MAX_PATH) history.shift();
          break;
        }
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      if (state.schema === schema.pose || state.schema === schema.odom || state.schema === schema.path) state.poses = undefined;
    }
  }

  dispose(): void {
    this.detach.forEach((fn) => fn());
    for (const entry of this.topics.values()) entry.detach();
    this.topics.clear();
    this.tf.clear();
  }
}
