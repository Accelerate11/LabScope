import type { MessageEnvelope } from '@labscope/data-source';
import type { PointCloud2 } from './lidar.js';
import { channels, header, NS_PER_MS } from './messages.js';

export const faultIds = [
  'message-drop', 'message-delay', 'timestamp-jitter', 'tf-missing', 'tf-out-of-order',
  'nan-point', 'invalid-pointcloud-schema', 'sensor-disconnect', 'burst-messages',
] as const;
export type FaultId = typeof faultIds[number];
export type SimulationFrame = Omit<MessageEnvelope, 'sequence' | 'source'> & { source: 'simulation' };

const MAX_PENDING = 32;
const MAX_PENDING_BYTES = 48 * 1024 * 1024;
interface Queued { due: number; frame: SimulationFrame; bytes: number }

function payloadBytes({ payload }: SimulationFrame): number {
  if (payload.kind === 'binary') return payload.value.byteLength;
  const data = (payload.value as { data?: unknown } | null)?.data;
  return data instanceof Uint8Array ? data.byteLength : 0;
}

function jitterFrame(frame: SimulationFrame, jitterMs: number): SimulationFrame {
  if (frame.logTimeNs === null || frame.payload.kind !== 'decoded') return frame;
  const ns = BigInt(frame.logTimeNs) + BigInt(jitterMs) * NS_PER_MS;
  const payload = frame.payload.value as { header?: ReturnType<typeof header>; transforms?: { header: ReturnType<typeof header> }[] };
  const stamp = (value: ReturnType<typeof header>) => header(ns, value.frame_id);
  const value = payload.header ? { ...payload, header: stamp(payload.header) }
    : payload.transforms ? { ...payload, transforms: payload.transforms.map((tf) => ({ ...tf, header: stamp(tf.header) })) }
      : payload;
  return { ...frame, logTimeNs: ns.toString(), payload: { kind: 'decoded', value } };
}

/** Fault processing is local to SimulationDataSource. Counters are per topic. */
export class FaultInjectionManager {
  private readonly ordinals = new Map<string, number>();
  private pending: Queued[] = [];
  private readonly enabled: ReadonlySet<FaultId>;
  highWater = 0;
  highWaterBytes = 0;
  private queueBytes = 0;
  overflow = 0;
  dropped = 0;

  constructor(faults: readonly FaultId[]) { this.enabled = new Set(faults); }

  reset(): void {
    this.ordinals.clear();
    this.pending = [];
    this.highWater = 0;
    this.highWaterBytes = 0;
    this.queueBytes = 0;
    this.overflow = 0;
    this.dropped = 0;
  }

  get pendingCount(): number { return this.pending.length; }
  get pendingBytes(): number { return this.queueBytes; }

  available(topic: string, simMs: number): boolean {
    const withinWindow = simMs % 4_000 >= 1_000 && simMs % 4_000 < 2_000;
    return !(this.enabled.has('sensor-disconnect') && withinWindow && topic.startsWith('/camera/'));
  }

  push(input: SimulationFrame, simMs: number): SimulationFrame[] {
    const ordinal = (this.ordinals.get(input.topic) ?? 0) + 1;
    this.ordinals.set(input.topic, ordinal);
    const isTf = input.topic === channels.tf.topic;
    const isStatic = input.topic === channels.tfStatic.topic;
    if (!this.available(input.topic, simMs) ||
        (!isStatic && this.enabled.has('message-drop') && ordinal % 5 === 0) ||
        (isTf && this.enabled.has('tf-missing') && ordinal % 3 === 0)) {
      this.dropped++;
      return [];
    }
    let frame = input;
    if (!isStatic && this.enabled.has('timestamp-jitter')) {
      frame = jitterFrame(frame, ordinal % 2 === 0 ? 7 : -7);
    }
    if (input.schemaName === channels.points.schemaName && frame.payload.kind === 'decoded') {
      let cloud = frame.payload.value as PointCloud2;
      if (this.enabled.has('nan-point') && ordinal % 3 === 0) {
        const data = cloud.data.slice();
        new DataView(data.buffer).setFloat32(0, NaN, true);
        cloud = { ...cloud, data, is_dense: false };
      }
      if (this.enabled.has('invalid-pointcloud-schema') && ordinal % 4 === 0) {
        cloud = { ...cloud, fields: cloud.fields.map((field) =>
          field.name === 'x' ? { ...field, offset: cloud.point_step + 4 } : field) };
      }
      frame = { ...frame, payload: { kind: 'decoded', value: cloud } };
    }
    let wait = 0;
    if (!isStatic && this.enabled.has('message-delay') && ordinal % 4 === 0) wait += 80;
    if (isTf && this.enabled.has('tf-out-of-order') && ordinal % 2 === 0) wait += 120;
    const count = !isStatic && this.enabled.has('burst-messages') && ordinal % 7 === 0 ? 4 : 1;
    const result: SimulationFrame[] = [];
    for (let index = 0; index < count; index++) {
      if (wait === 0) result.push(frame);
      else {
        const bytes = payloadBytes(frame);
        if (this.pending.length >= MAX_PENDING || this.queueBytes + bytes > MAX_PENDING_BYTES) {
          this.overflow++;
          continue;
        }
        this.pending.push({ due: simMs + wait, frame, bytes });
        this.queueBytes += bytes;
      }
    }
    this.highWater = Math.max(this.highWater, this.pending.length);
    this.highWaterBytes = Math.max(this.highWaterBytes, this.queueBytes);
    return result;
  }

  release(simMs: number): SimulationFrame[] {
    const ready = this.pending.filter((event) => event.due <= simMs).sort((a, b) => a.due - b.due);
    this.pending = this.pending.filter((event) => event.due > simMs);
    for (const event of ready) this.queueBytes -= event.bytes;
    return ready.filter(({ frame }) => this.available(frame.topic, simMs)).map(({ frame }) => frame);
  }
}
