/**
 * PointCloud2 fast path.
 *
 * The generic decoder already returns a correct PointCloud2 object, but it
 * would copy the point buffer field-by-field. Point clouds are the highest
 * bandwidth product in LabScope (a Livox Mid-360 at 10 Hz is ~3.2 MB/s), so
 * this module keeps the payload as a view and exposes typed-array accessors.
 */

import { decodeMessage, POINT_FIELD_DATATYPE, type DecodeOptions } from './decode.ts';
import { parsePointCloud2, type PointCloud2Field } from './pointcloud-layout.ts';
import type { MsgSchema, RosTime } from './types.ts';

export * from './pointcloud-layout.ts';

export interface DecodedPointCloud2 {
  readonly stamp: RosTime;
  readonly frameId: string;
  readonly width: number;
  readonly height: number;
  readonly pointStep: number;
  readonly rowStep: number;
  readonly isBigEndian: boolean;
  readonly isDense: boolean;
  readonly fields: readonly PointCloud2Field[];
  /** Zero-copy view of the raw point data. */
  readonly data: Uint8Array;
  readonly pointCount: number;
  /**
   * Interleaved `[x0,y0,z0, x1,y1,z1, ...]` positions, or `null` when the cloud
   * does not carry float `x`/`y`/`z` fields.
   */
  positions(): Float32Array | null;
  /** Values of a single float/int field (e.g. `intensity`), or `null` when absent. */
  fieldValues(name: string): Float32Array | null;
}

export function decodePointCloud2(
  schema: MsgSchema,
  payload: Uint8Array,
  options: DecodeOptions = { byteArrays: 'view' },
): DecodedPointCloud2 {
  const { value } = decodeMessage(schema, 'sensor_msgs/msg/PointCloud2', payload, {
    ...options,
    byteArrays: 'view',
  });

  const layout = parsePointCloud2(value);
  const { pointCount } = layout;
  const { header, width, height, point_step, row_step, is_bigendian, is_dense, fields, data } = layout.message;

  return {
    stamp: header.stamp,
    frameId: header.frame_id,
    width,
    height,
    pointStep: point_step,
    rowStep: row_step,
    isBigEndian: is_bigendian,
    isDense: is_dense,
    fields,
    data,
    pointCount,
    positions(): Float32Array | null {
      const supported = new Set<number>([
        POINT_FIELD_DATATYPE.FLOAT32,
        POINT_FIELD_DATATYPE.FLOAT64,
      ]);
      if (!['x', 'y', 'z'].every((name) => supported.has(layout.field(name)?.datatype ?? 0))) {
        return null;
      }
      const x = layout.scalar('x'), y = layout.scalar('y'), z = layout.scalar('z');
      if (!x || !y || !z) return null;
      const out = new Float32Array(pointCount * 3);
      for (let i = 0; i < pointCount; i += 1) {
        const base = layout.byteOffset(i);
        out[i * 3] = x(base);
        out[i * 3 + 1] = y(base);
        out[i * 3 + 2] = z(base);
      }
      return out;
    },
    fieldValues(name: string): Float32Array | null {
      const read = layout.scalar(name);
      if (!read) return null;
      const out = new Float32Array(pointCount);
      for (let i = 0; i < pointCount; i += 1) {
        out[i] = read(layout.byteOffset(i));
      }
      return out;
    },
  };
}
