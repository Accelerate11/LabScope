import { POINT_FIELD_DATATYPE as DT, readPointFieldValue } from './decode.ts';
import { CdrDecodeError, type RosTime } from './types.ts';

export interface PointCloud2Field {
  readonly name: string;
  readonly offset: number;
  readonly datatype: number;
  readonly count: number;
}

export interface PointCloud2Message {
  readonly header: { readonly stamp: RosTime; readonly frame_id: string };
  readonly width: number;
  readonly height: number;
  readonly point_step: number;
  readonly row_step: number;
  readonly is_bigendian: boolean;
  readonly is_dense: boolean;
  readonly fields: readonly PointCloud2Field[];
  readonly data: Uint8Array;
}

type ReadField = (pointOffset: number) => number;
type ReadColor = (pointOffset: number) => number;

const fieldBytes = [0, 1, 1, 2, 2, 4, 4, 4, 8];

function uint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function invalid(reason: string): never {
  throw new CdrDecodeError('PointCloud2: ' + reason, 0);
}

/** Validated zero-copy view of a deserialized ROS message. */
export class PointCloud2Layout {
  private readonly view: DataView;
  private readonly byName = new Map<string, PointCloud2Field>();
  readonly pointCount: number;

  constructor(readonly message: PointCloud2Message) {
    const { header, width, height, point_step, row_step, data, fields, is_bigendian, is_dense } = message;
    if (typeof header?.frame_id !== 'string' || !Number.isInteger(header.stamp?.sec) ||
        header.stamp.sec < -0x80000000 || header.stamp.sec > 0x7fffffff ||
        !uint32(header.stamp.nanosec) || header.stamp.nanosec >= 1_000_000_000) {
      invalid('invalid header or stamp');
    }
    if (!uint32(width) || !uint32(height) || !uint32(point_step) || !uint32(row_step) ||
        typeof is_bigendian !== 'boolean' || typeof is_dense !== 'boolean' || !(data instanceof Uint8Array)) {
      invalid('invalid dimensions, flags or data');
    }
    this.pointCount = width * height;
    const needed = row_step * height;
    if ((this.pointCount > 0 && point_step === 0) || width * point_step > row_step ||
        !Number.isSafeInteger(this.pointCount) || !Number.isSafeInteger(needed) || needed !== data.byteLength) {
      invalid('inconsistent point_step, row_step or data size');
    }
    if (!Array.isArray(fields)) invalid('missing fields');
    for (const field of fields) {
      const bytes = fieldBytes[field?.datatype] ?? 0;
      if (typeof field?.name !== 'string' || field.name === '' || this.byName.has(field.name) ||
          !uint32(field.offset) || !uint32(field.count) || field.count === 0 ||
          !uint32(field.datatype) || bytes === 0 || field.offset + field.count * bytes > point_step) {
        invalid('invalid field ' + (field?.name ?? ''));
      }
      this.byName.set(field.name, field);
    }
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  field(name: string): PointCloud2Field | undefined {
    return this.byName.get(name);
  }

  /** Index is in logical row-major order, excluding row padding. */
  byteOffset(index: number): number {
    const { width, point_step, row_step } = this.message;
    if (row_step === width * point_step) return index * point_step;
    const row = Math.floor(index / width);
    return row * row_step + (index - row * width) * point_step;
  }

  scalar(name: string): ReadField | undefined {
    const field = this.field(name);
    if (field?.count !== 1) return undefined;
    const { offset, datatype } = field;
    const littleEndian = !this.message.is_bigendian;
    if (datatype === DT.FLOAT32) return (base) => this.view.getFloat32(base + offset, littleEndian);
    return (base) => readPointFieldValue(this.view, base + offset, datatype, littleEndian);
  }

  /** Returns a normalized packed 0xAARRGGBB value, with opaque alpha for rgb. */
  color(): ReadColor | undefined {
    for (const name of ['rgba', 'rgb']) {
      const field = this.field(name);
      if (!field) continue;
      const { count, datatype, offset } = field;
      const littleEndian = !this.message.is_bigendian;
      const alpha = name === 'rgba';
      if (count === 1 && (datatype === DT.FLOAT32 || datatype === DT.UINT32 || datatype === DT.INT32)) {
        return alpha ? (base) => this.view.getUint32(base + offset, littleEndian)
          : (base) => this.view.getUint32(base + offset, littleEndian) | 0xff000000;
      }
      if (datatype === DT.UINT8 && count === (alpha ? 4 : 3)) {
        return (base) => {
          const byte = base + offset;
          return ((alpha ? this.view.getUint8(byte + 3) : 255) << 24) |
            (this.view.getUint8(byte) << 16) | (this.view.getUint8(byte + 1) << 8) | this.view.getUint8(byte + 2);
        };
      }
    }
    return undefined;
  }
}

export function parsePointCloud2(value: unknown): PointCloud2Layout {
  if (typeof value !== 'object' || value === null) invalid('expected a ROS message');
  return new PointCloud2Layout(value as PointCloud2Message);
}
