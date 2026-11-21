import { parsePointCloud2, type PointCloud2Layout } from '@labscope/ros-schema';
import type { MessageEnvelope } from '../workspace/message-bus';

export const POINT_CLOUD_SCHEMA = 'sensor_msgs/msg/PointCloud2';
export const MAX_LAYER_POINTS = 500_000;
export const COLOR_MODES = ['xyz', 'intensity', 'rgb', 'height', 'distance'] as const;
export const SAMPLING_MODES = ['uniform', 'first'] as const;
export type ColorMode = typeof COLOR_MODES[number];
export type SamplingMode = typeof SAMPLING_MODES[number];

export interface ProcessingOptions {
  colorMode: ColorMode;
  sampling: SamplingMode;
  maxPoints: number;
  fixedColor?: string;
  intensityRange?: [number, number];
  heightRange?: [number, number];
}

export interface ProcessedCloud {
  sourcePoints: number;
  sampledPoints: number;
  validPoints: number;
  drawnPoints: number;
  invalidPoints: number;
  frameId: string;
  stamp: PointCloud2Layout['message']['header']['stamp'];
  effectiveColor: ColorMode;
  hasAlpha: boolean;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const f32Limit = 3.4028234663852886e38;
const finitePosition = (value: number) => Number.isFinite(value) && Math.abs(value) <= f32Limit;

/** Both replay and streaming producers supply the same full decoded ROS message. */
export function decodeDisplayCloud(message: MessageEnvelope): PointCloud2Layout {
  if (message.schemaName !== POINT_CLOUD_SCHEMA || message.payload.kind !== 'decoded') {
    throw new Error('等待完整的 PointCloud2 解码消息');
  }
  return parsePointCloud2(message.payload.value);
}

export class PointCloudProcessor {
  positions: Float32Array<ArrayBuffer> = new Float32Array(0);
  colors: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private scalars: Float64Array<ArrayBuffer> = new Float64Array(0);

  get capacity(): number { return this.positions.length / 3; }
  get allocatedBytes(): number {
    return this.positions.byteLength + this.colors.byteLength + this.scalars.byteLength;
  }

  private reserve(needed: number): void {
    if (needed <= this.capacity) return;
    const capacity = Math.min(MAX_LAYER_POINTS, Math.max(needed, this.capacity * 2));
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Uint8Array(capacity * 4);
    this.scalars = new Float64Array(capacity);
  }

  process(cloud: PointCloud2Layout, options: ProcessingOptions): ProcessedCloud {
    const x = cloud.scalar('x'), y = cloud.scalar('y'), z = cloud.scalar('z');
    if (!x || !y || !z) throw new Error('PointCloud2 缺少标量 x、y 或 z');
    const sampledPoints = Math.min(cloud.pointCount, options.maxPoints);
    if (!Number.isInteger(sampledPoints) || sampledPoints < 0 || sampledPoints > MAX_LAYER_POINTS) {
      throw new RangeError('无效的点数上限');
    }
    this.reserve(sampledPoints);
    const { positions, colors, scalars } = this;
    const intensity = options.colorMode === 'intensity' ? cloud.scalar('intensity') : undefined;
    const packedColor = options.colorMode === 'rgb' ? cloud.color() : undefined;
    let effectiveColor = options.colorMode;
    if ((effectiveColor === 'intensity' && !intensity) || (effectiveColor === 'rgb' && !packedColor)) {
      effectiveColor = 'xyz';
    }
    const height = effectiveColor === 'height', distance = effectiveColor === 'distance';
    const scalarMode = height || distance || intensity !== undefined;
    const stride = options.sampling === 'uniform' && sampledPoints < cloud.pointCount
      ? cloud.pointCount / sampledPoints : 1;
    let drawnPoints = 0, scalarMin = Infinity, scalarMax = -Infinity, hasAlpha = false;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    // Sampling is over logical rows. Invalid sampled points are dropped without changing sample indices.
    for (let index = 0; index < sampledPoints; index++) {
      const base = cloud.byteOffset(Math.floor(index * stride));
      const px = x(base), py = y(base), pz = z(base);
      if (!finitePosition(px) || !finitePosition(py) || !finitePosition(pz)) continue;
      const xyz = drawnPoints * 3;
      positions[xyz] = px;
      positions[xyz + 1] = py;
      positions[xyz + 2] = pz;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
      if (packedColor) {
        const color = packedColor(base);
        const rgba = drawnPoints * 4;
        colors[rgba] = color >>> 16;
        colors[rgba + 1] = color >>> 8;
        colors[rgba + 2] = color;
        colors[rgba + 3] = color >>> 24;
        hasAlpha ||= colors[rgba + 3] !== 255;
      } else if (scalarMode) {
        const value = intensity ? intensity(base) : height ? pz : Math.sqrt(px * px + py * py + pz * pz);
        scalars[drawnPoints] = value;
        if (Number.isFinite(value)) {
          scalarMin = Math.min(scalarMin, value);
          scalarMax = Math.max(scalarMax, value);
        }
      }
      drawnPoints++;
    }

    let validPoints = drawnPoints;
    if (sampledPoints < cloud.pointCount) {
      let sampleIndex = 0;
      for (let index = 0; index < cloud.pointCount; index++) {
        if (sampleIndex < sampledPoints && index === Math.floor(sampleIndex * stride)) {
          sampleIndex++;
          continue;
        }
        const base = cloud.byteOffset(index);
        if (finitePosition(x(base)) && finitePosition(y(base)) && finitePosition(z(base))) validPoints++;
      }
    }

    if (!packedColor) {
      const topologyColor = !scalarMode;
      const fixed = Number.parseInt((options.fixedColor ?? '#52c0f1').slice(1), 16);
      const fixedRange = height ? options.heightRange : intensity ? options.intensityRange : undefined;
      if (fixedRange) [scalarMin, scalarMax] = fixedRange;
      const range = scalarMax - scalarMin;
      for (let index = 0; index < drawnPoints; index++) {
        const color = index * 4;
        const scalar = scalars[index]!;
        const value = topologyColor || !Number.isFinite(scalar) || range <= 0 ? 0.5 : Math.max(0, Math.min(1,
          Number.isFinite(range) ? (scalar - scalarMin) / range :
            (scalar * 0.5 - scalarMin * 0.5) / (scalarMax * 0.5 - scalarMin * 0.5)));
        colors[color] = topologyColor ? fixed >>> 16 : Math.round(32 + value * 215);
        colors[color + 1] = topologyColor ? fixed >>> 8 : Math.round(91 + value * 107);
        colors[color + 2] = topologyColor ? fixed : Math.round(243 - value * 173);
        colors[color + 3] = 255;
      }
    }

    const { frame_id, stamp } = cloud.message.header;
    return { sourcePoints: cloud.pointCount, sampledPoints, validPoints, drawnPoints, invalidPoints: cloud.pointCount - validPoints,
      frameId: frame_id, stamp, effectiveColor, hasAlpha,
      bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } };
  }
}
