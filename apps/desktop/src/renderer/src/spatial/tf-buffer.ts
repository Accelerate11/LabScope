import { compose, frameId, header, identity, inverse, object, quaternion, vector, type RigidTransform } from './ros';

type Failure = 'missing-frame' | 'disconnected' | 'past' | 'future' | 'gap' | 'cycle' | 'parent-conflict';
const diagnostics: Record<Failure, string> = {
  'missing-frame': 'TF 坐标系不存在', disconnected: 'TF 链不完整', past: 'TF 时间早于缓存',
  future: 'TF 等待后续样本', gap: 'TF 样本断流', cycle: 'TF 循环依赖', 'parent-conflict': 'TF 父坐标系冲突',
};

export class TransformError extends Error {
  constructor(readonly code: Failure, detail: string) {
    super(diagnostics[code] + ' · ' + detail);
  }
}

interface Sample { time: bigint; value: RigidTransform }
interface Edge { parent: string; static: boolean; samples: Sample[] }
const HISTORY = 20_000_000_000n;
const GAP = 500_000_000n;
const MAX_FRAMES = 256;
const MAX_SAMPLES = 1024;

function lowerBound(samples: readonly Sample[], time: bigint): number {
  let left = 0, right = samples.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (samples[middle]!.time < time) left = middle + 1;
    else right = middle;
  }
  return left;
}

export class TfBuffer {
  private readonly edges = new Map<string, Edge>();
  private readonly children = new Map<string, Set<string>>();
  revision = 0;
  latestDynamic: bigint | undefined;

  get frames(): string[] {
    return [...new Set([...this.edges.keys(), ...this.children.keys()])].sort();
  }

  tree(): { frame: string; parent: string | null; static: boolean }[] {
    return this.frames.map((frame) => {
      const edge = this.edges.get(frame);
      return { frame, parent: edge?.parent ?? null, static: edge?.static ?? false };
    });
  }

  clear(): void {
    this.edges.clear();
    this.children.clear();
    this.latestDynamic = undefined;
    this.revision++;
  }

  clearKind(isStatic: boolean): void {
    for (const [child, edge] of this.edges) if (edge.static === isStatic) this.remove(child);
    if (!isStatic) this.latestDynamic = undefined;
  }

  remove(child: string): void {
    const edge = this.edges.get(child);
    if (!edge) return;
    this.edges.delete(child);
    const siblings = this.children.get(edge.parent);
    siblings?.delete(child);
    if (!siblings?.size) this.children.delete(edge.parent);
    if (!edge.static && this.latestDynamic === edge.samples.at(-1)?.time) {
      this.latestDynamic = undefined;
      for (const candidate of this.edges.values()) {
        if (candidate.static) continue;
        const time = candidate.samples.at(-1)?.time;
        if (time !== undefined && (this.latestDynamic === undefined || time > this.latestDynamic)) this.latestDynamic = time;
      }
    }
    this.revision++;
  }

  ingest(message: unknown, isStatic: boolean): { accepted: number; error: string | null } {
    const transforms = object(message).transforms;
    if (!Array.isArray(transforms) || transforms.length > MAX_FRAMES) throw new Error('无效 TFMessage');
    let accepted = 0, error: string | null = null;
    for (const item of transforms) {
      try {
        const transform = object(item);
        const { frame, time } = header(transform.header);
        const child = frameId(transform.child_frame_id);
        const data = object(transform.transform);
        this.insert(frame, child, time, { translation: vector(data.translation), rotation: quaternion(data.rotation) }, isStatic);
        accepted++;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    return { accepted, error };
  }

  private insert(parent: string, child: string, time: bigint, value: RigidTransform, isStatic: boolean): void {
    let edge = this.edges.get(child);
    if (!edge) {
      for (let frame: string | undefined = parent; frame !== undefined; frame = this.edges.get(frame)?.parent) {
        if (frame === child) throw new TransformError('cycle', child);
      }
      if (this.edges.size >= MAX_FRAMES) throw new Error('TF 坐标系数量超出缓存上限');
      edge = { parent, static: isStatic, samples: [] };
      this.edges.set(child, edge);
      let children = this.children.get(parent);
      if (!children) this.children.set(parent, children = new Set());
      children.add(child);
    }
    if (edge.parent !== parent || edge.static !== isStatic) throw new TransformError('parent-conflict', child);
    if (isStatic) {
      const prior = edge.samples[0]?.value;
      if (prior?.translation.equals(value.translation) && Math.abs(prior.rotation.dot(value.rotation)) > 1 - 1e-12) return;
      edge.samples[0] = { time, value };
    } else {
      const samples = edge.samples;
      const newest = samples.at(-1)?.time;
      if (newest !== undefined && time < newest - HISTORY) return;
      const index = lowerBound(samples, time);
      samples.splice(index, samples[index]?.time === time ? 1 : 0, { time, value });
      const cutoff = samples.at(-1)!.time - HISTORY;
      samples.splice(0, Math.max(samples.length - MAX_SAMPLES, lowerBound(samples, cutoff)));
      if (this.latestDynamic === undefined || this.latestDynamic < time) this.latestDynamic = time;
    }
    this.revision++;
  }

  private path(frame: string): string[] {
    if (!this.edges.has(frame) && !this.children.has(frame)) throw new TransformError('missing-frame', frame);
    const path = [frame];
    for (let edge = this.edges.get(frame); edge; edge = this.edges.get(edge.parent)) path.push(edge.parent);
    return path;
  }

  private at(child: string, time: bigint): RigidTransform {
    const edge = this.edges.get(child)!;
    if (edge.static) return edge.samples[0]!.value;
    const samples = edge.samples, at = lowerBound(samples, time);
    const next = samples[at], prior = samples[at - 1];
    const subject = edge.parent + ' → ' + child;
    if (next?.time === time) return next.value;
    if (!prior) throw new TransformError('past', subject);
    if (!next) throw new TransformError(time - prior.time > GAP ? 'gap' : 'future', subject);
    if (next.time - prior.time > GAP) throw new TransformError('gap', subject);
    const fraction = Number(time - prior.time) / Number(next.time - prior.time);
    return {
      translation: prior.value.translation.clone().lerp(next.value.translation, fraction),
      rotation: prior.value.rotation.clone().slerp(next.value.rotation, fraction).normalize(),
    };
  }

  /** T_target_source. Only edges below the common ancestor are sampled. */
  lookup(target: string, source: string, time: bigint): RigidTransform {
    if (target === source && target) return identity();
    const from = this.path(source), to = this.path(target);
    const ancestor = from.find((frame) => to.includes(frame));
    if (ancestor === undefined) throw new TransformError('disconnected', source + ' → ' + target);
    const toAncestor = (path: readonly string[]) => {
      let transform = identity();
      for (const child of path) {
        if (child === ancestor) break;
        transform = compose(this.at(child, time), transform);
      }
      return transform;
    };
    return compose(inverse(toAncestor(to)), toAncestor(from));
  }
}
