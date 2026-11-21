import type { Vector3 } from 'three';
import { header, nanoseconds, number, object, pose, vector, type RigidTransform } from './ros';

export type MarkerType = 0 | 1 | 2 | 4 | 5 | 8 | 9;
export type Tint = [number, number, number, number];
export interface MarkerState {
  key: string;
  type: MarkerType;
  frame: string;
  time: bigint;
  expires: bigint | null;
  locked: boolean;
  pose: RigidTransform;
  scale: Vector3;
  color: Tint;
  points: Vector3[];
  colors: Tint[];
  text: string;
}

const supported = new Set([0, 1, 2, 4, 5, 8, 9]);
const MAX_MARKERS = 256;
const MAX_POINTS = 8192;
const MAX_TOTAL_POINTS = 65536;
function tint(value: unknown): Tint {
  const c = object(value);
  const norm = (value: unknown) => Math.max(0, Math.min(1, number(value)));
  return [norm(c.r), norm(c.g), norm(c.b), norm(c.a)];
}

export class MarkerStore {
  private readonly entries = new Map<string, MarkerState>();
  private points = 0;
  get values(): Iterable<MarkerState> { return this.entries.values(); }

  clear(): void {
    this.entries.clear();
    this.points = 0;
  }

  private remove(key: string): void {
    this.points -= this.entries.get(key)?.points.length ?? 0;
    this.entries.delete(key);
  }

  expire(now: bigint): boolean {
    let changed = false;
    for (const [key, marker] of this.entries) if (marker.expires !== null && marker.expires <= now) {
      this.remove(key);
      changed = true;
    }
    return changed;
  }

  apply(value: unknown, array: boolean, now: bigint): string | null {
    const list = array ? object(value).markers : [value];
    if (!Array.isArray(list) || list.length > 2048) throw new Error('无效 MarkerArray');
    let lastError: string | null = null;
    for (const item of list) {
      try { this.action(object(item), now); }
      catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    }
    return lastError;
  }

  private action(marker: ReturnType<typeof object>, now: bigint): void {
    const action = number(marker.action);
    if (action === 3) { this.clear(); return; }
    const id = number(marker.id);
    if (!Number.isInteger(id) || id < -2147483648 || id > 2147483647 ||
        typeof marker.ns !== 'string' || marker.ns.length > 256) throw new Error('无效 Marker Namespace / ID');
    const key = JSON.stringify([marker.ns, id]);
    if (action === 2) { this.remove(key); return; }
    const type = number(marker.type);
    if (action !== 0 || !supported.has(type)) throw new Error('未支持的 Marker 类型或 Action');
    const timestamp = header(marker.header);
    const duration = nanoseconds(marker.lifetime);
    const scale = vector(marker.scale);
    if (duration < 0n || scale.x < 0 || scale.y < 0 || scale.z < 0) throw new Error('无效 Marker lifetime 或 scale');
    const points = marker.points ?? [];
    const colors = marker.colors ?? [];
    if (!Array.isArray(points) || points.length > MAX_POINTS || !Array.isArray(colors) ||
        (colors.length !== 0 && colors.length !== points.length)) throw new Error('无效 Marker points 或 colors');
    const previous = this.entries.get(key);
    if ((!previous && this.entries.size >= MAX_MARKERS) ||
        this.points - (previous?.points.length ?? 0) + points.length > MAX_TOTAL_POINTS) {
      throw new Error('Marker 超出显示缓存上限');
    }
    if ((type === 0 && points.length !== 0 && points.length !== 2) || (type === 5 && points.length % 2 !== 0)) {
      throw new Error('Marker 端点数量无效');
    }
    this.entries.set(key, { key, ...timestamp, type: type as MarkerType, pose: pose(marker.pose), scale, color: tint(marker.color),
      points: points.map(vector), colors: colors.map(tint), locked: marker.frame_locked === true,
      expires: duration === 0n ? null : now + duration, text: typeof marker.text === 'string' ? marker.text.slice(0, 192) : '' });
    this.points += points.length - (previous?.points.length ?? 0);
  }
}
