import {
  AxesHelper, Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D, type Scene,
} from 'three';
import { spatialSchemas as schemas } from '../../../shared/spatial-schemas';
import type { MessageBus, SourceId } from '../workspace/message-bus';
import { directionArrow, disposeVisual, MarkerVisual, textLabel } from './marker-visual';
import { compose, identity, type RigidTransform } from './ros';
import { SceneFeed, sceneKey, type StampedPose } from './scene-feed';
import { defaultScene, type SceneSettings } from './scene-settings';
import { TransformError } from './tf-buffer';

class Segments extends LineSegments<BufferGeometry, LineBasicMaterial> {
  private readonly positions: BufferAttribute;
  private vertices = 0;

  constructor(capacity: number, color: string) {
    const positions = new BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(DynamicDrawUsage);
    super(new BufferGeometry().setAttribute('position', positions), new LineBasicMaterial({ color }));
    this.positions = positions;
    this.frustumCulled = false;
    this.reset();
    this.commit();
  }

  reset(): void { this.vertices = 0; }

  segment(a: RigidTransform['translation'], b: RigidTransform['translation']): void {
    if (this.vertices + 2 > this.positions.count) return;
    this.positions.setXYZ(this.vertices++, a.x, a.y, a.z);
    this.positions.setXYZ(this.vertices++, b.x, b.y, b.z);
  }

  commit(): void {
    this.geometry.setDrawRange(0, this.vertices);
    this.positions.clearUpdateRanges();
    if (this.vertices) {
      this.positions.addUpdateRange(0, this.vertices * 3);
      this.positions.needsUpdate = true;
    }
  }
}

interface FeedVisuals {
  feed: SceneFeed;
  seen: number;
  axes: Map<string, Group>;
  markers: Map<string, MarkerVisual>;
  paths: Map<string, Segments>;
  robots: Map<string, Group>;
  links: Segments;
  stats: SourceSceneStats;
}

interface SourceSceneStats {
  source: SourceId;
  frames: ReturnType<SceneFeed['tf']['tree']>;
  topics: { topic: string; schema: string; error: string | null }[];
  visibleFrames: number;
  poses: number;
  odometry: number;
  pathPoints: number;
  markers: number;
  error: string | null;
}

export class SpatialScene {
  readonly group = new Group();
  private readonly sources = new Map<SourceId, FeedVisuals>();
  settings = defaultScene;
  primary: SourceId = 'simulation';

  constructor(private readonly bus: MessageBus, scene: Scene) { scene.add(this.group); }

  sync(settings: SceneSettings, primary: SourceId, related: readonly SourceId[]): void {
    this.settings = settings;
    this.primary = primary;
    const active = settings.fixedFrame !== null || settings.transforms || settings.pose || settings.odometry || settings.path || settings.markers;
    const desired = new Set(active ? [primary, ...related] : []);
    for (const [source, state] of this.sources) if (!desired.has(source)) this.remove(source, state);
    for (const source of desired) {
      let state = this.sources.get(source);
      if (!state) {
        const links = new Segments(256, '#52677c');
        this.group.add(links);
        state = { feed: new SceneFeed(source, this.bus, settings), seen: -1,
          axes: new Map(), links, markers: new Map(), paths: new Map(), robots: new Map(),
          stats: { source, frames: [], topics: [], visibleFrames: 0, poses: 0, odometry: 0, pathPoints: 0, markers: 0, error: null } };
        this.sources.set(source, state);
      } else state.feed.configure(settings);
      state.seen = -1;
    }
  }

  private remove(source: SourceId, state: FeedVisuals): void {
    state.feed.dispose();
    state.axes.forEach(disposeVisual);
    state.paths.forEach(disposeVisual);
    state.robots.forEach(disposeVisual);
    state.markers.forEach((marker) => marker.dispose());
    disposeVisual(state.links);
    this.sources.delete(source);
  }

  revision(source: SourceId): number { return this.sources.get(source)?.feed.tf.revision ?? 0; }

  transform(source: SourceId, frame: string, time: bigint, reference: string | null): RigidTransform {
    if (!frame) throw new TransformError('missing-frame', '消息未提供 frame_id');
    const target = this.settings.fixedFrame ?? reference;
    if (!target) return identity();
    if (target === frame) return identity();
    const feed = this.sources.get(source)?.feed;
    if (!feed) throw new TransformError('missing-frame', frame);
    return feed.tf.lookup(target, frame, time);
  }

  private place(node: Object3D, at: RigidTransform): void {
    node.position.copy(at.translation);
    node.quaternion.copy(at.rotation);
    node.visible = true;
  }

  private axes(state: FeedVisuals, reference: string | null): void {
    const target = this.settings.fixedFrame ?? reference;
    const time = state.feed.tf.latestDynamic ?? state.feed.clock;
    const frames = state.stats.frames;
    const positions = new Map<string, RigidTransform>();
    if (this.settings.transforms && target) {
      for (const { frame } of frames.slice(0, 64)) {
        try {
          positions.set(frame, this.transform(state.feed.source, frame, time, target));
        } catch (error) { state.stats.error ??= (error as Error).message; }
      }
    }
    for (const [frame, node] of state.axes) {
      if (!positions.has(frame)) { disposeVisual(node); state.axes.delete(frame); }
    }
    state.links.reset();
    for (const { frame, parent } of frames) {
      const at = positions.get(frame);
      if (!at || this.settings.hidden.includes(sceneKey(state.feed.source, 'frame:' + frame))) {
        const node = state.axes.get(frame);
        if (node) node.visible = false;
        continue;
      }
      let node = state.axes.get(frame);
      if (!node) {
        node = new Group();
        const label = textLabel(frame, 0.27);
        label.position.z = 0.25;
        node.add(new AxesHelper(1), label);
        this.group.add(node);
        state.axes.set(frame, node);
      }
      node.children[0]!.scale.setScalar(this.settings.axisLength);
      this.place(node, at);
      state.stats.visibleFrames++;
      const from = parent && positions.get(parent);
      if (from && !this.settings.hidden.includes(sceneKey(state.feed.source, 'frame:' + parent))) {
        state.links.segment(from.translation, at.translation);
      }
    }
    state.links.commit();
  }

  private robot(state: FeedVisuals, topic: string, pose: StampedPose, isOdometry: boolean, reference: string | null): void {
    let node = state.robots.get(topic);
    if (!node) {
      const tint = new Color(isOdometry ? '#ffbe66' : '#37ebbb');
      node = directionArrow(0.9, 0.09, 0.26, 0.26);
      node.traverse((item) => {
        if (item instanceof Mesh && item.material instanceof MeshBasicMaterial) item.material.color.copy(tint);
      });
      node.add(new Mesh(new SphereGeometry(isOdometry ? 0.1 : 0.16, 12, 8), new MeshBasicMaterial({ color: tint })));
      this.group.add(node);
      state.robots.set(topic, node);
    }
    try {
      this.place(node, compose(this.transform(state.feed.source, pose.frame, pose.time, reference), pose.pose));
      if (isOdometry) state.stats.odometry++;
      else state.stats.poses++;
    } catch (error) { state.stats.error ??= (error as Error).message; }
  }

  private drawPath(state: FeedVisuals, topic: string, samples: readonly StampedPose[], reference: string | null): void {
    let line = state.paths.get(topic);
    if (!line) {
      line = new Segments(2048, this.settings.pathColor);
      state.paths.set(topic, line);
      this.group.add(line);
    }
    line.material.color.set(this.settings.pathColor);
    const from = Math.max(0, samples.length - this.settings.pathLength * this.settings.pathStep);
    const meters = this.settings.pathMeters ?? 0;
    const head = samples.length - 1;
    const first = head - Math.floor((head - from) / this.settings.pathStep) * this.settings.pathStep;
    const step = (meters > 0 ? -1 : 1) * this.settings.pathStep;
    let prior: RigidTransform['translation'] | undefined;
    let count = 0, length = 0;
    line.reset();
    for (let index = meters > 0 ? head : first; index <= head && index >= first && index >= 0; index += step) {
      const sample = samples[index]!;
      try {
        const transform = this.transform(state.feed.source, sample.frame, sample.time, reference);
        const point = sample.pose.translation.clone().applyQuaternion(transform.rotation).add(transform.translation);
        if (prior) {
          if (meters > 0) {
            const segment = prior.distanceTo(point);
            if (length + segment > meters) {
              line.segment(prior, point.lerp(prior, 1 - (meters - length) / segment));
              count++;
              break;
            }
            length += segment;
          }
          line.segment(prior, point);
        }
        prior = point;
        count++;
      } catch (error) {
        prior = undefined;
        state.stats.error ??= (error as Error).message;
      }
    }
    line.commit();
    line.visible = count >= 2;
    state.stats.pathPoints += count;
  }

  private draw(state: FeedVisuals, reference: string | null): void {
    const { feed, stats } = state;
    stats.frames = feed.tf.tree();
    stats.topics = [...feed.topics.entries()].map(([topic, item]) => ({ topic, schema: item.schema, error: item.error ?? null }));
    stats.visibleFrames = stats.poses = stats.odometry = stats.pathPoints = stats.markers = 0;
    stats.error = stats.topics.find((topic) => topic.error)?.error ?? null;
    if (this.settings.fixedFrame && !stats.frames.some(({ frame }) => frame === this.settings.fixedFrame)) {
      stats.error ??= '等待 TF · ' + this.settings.fixedFrame;
    }
    this.axes(state, reference);
    state.paths.forEach((item) => { item.visible = false; });
    state.robots.forEach((item) => { item.visible = false; });
    const used = new Set<string>();
    for (const [topic, data] of feed.topics) {
      if (this.settings.hidden.includes(sceneKey(feed.source, topic))) continue;
      const latest = data.poses?.at(-1);
      if (latest && data.schema === schemas.pose && this.settings.pose) this.robot(state, topic, latest, false, reference);
      if (latest && data.schema === schemas.odom && this.settings.odometry) this.robot(state, topic, latest, true, reference);
      if (data.poses && this.settings.path && (data.schema === schemas.path || data.schema === schemas.odom)) {
        this.drawPath(state, topic, data.poses, reference);
      }
      for (const marker of data.markers?.values ?? []) {
        const key = JSON.stringify([topic, marker.key]);
        used.add(key);
        let visual = state.markers.get(key);
        if (!visual) {
          visual = new MarkerVisual();
          state.markers.set(key, visual);
          this.group.add(visual.group);
        }
        visual.update(marker);
        visual.group.visible = false;
        try {
          const time = marker.locked ? (feed.tf.latestDynamic ?? marker.time) : marker.time;
          this.place(visual.group, compose(this.transform(feed.source, marker.frame, time, reference), marker.pose));
          stats.markers++;
        } catch (error) { stats.error ??= (error as Error).message; }
      }
    }
    for (const [key, visual] of state.markers) if (!used.has(key)) { visual.dispose(); state.markers.delete(key); }
    for (const [topic, node] of state.paths) if (!feed.topics.has(topic)) { disposeVisual(node); state.paths.delete(topic); }
    for (const [topic, node] of state.robots) if (!feed.topics.has(topic)) { disposeVisual(node); state.robots.delete(topic); }
  }

  private lastReference: string | null = null;

  update(reference: string | null): void {
    for (const state of this.sources.values()) {
      if (state.seen === state.feed.revision && this.lastReference === reference) continue;
      state.seen = state.feed.revision;
      this.draw(state, reference);
    }
    this.lastReference = reference;
  }

  get stats(): SourceSceneStats[] {
    return [...this.sources.values()].map(({ stats }) => stats);
  }

  bounds(): Box3 {
    const bounds = new Box3();
    for (const state of this.sources.values()) {
      for (const visual of state.robots.values()) if (visual.visible) bounds.expandByObject(visual);
      for (const marker of state.markers.values()) if (marker.group.visible) bounds.expandByObject(marker.group);
    }
    return bounds;
  }

  dispose(): void {
    for (const [source, state] of this.sources) this.remove(source, state);
    this.group.removeFromParent();
  }
}
