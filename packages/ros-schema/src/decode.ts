/**
 * Schema-driven CDR decoder: turns a raw ROS 2 message payload plus its
 * advertised `.msg` definition into a plain JavaScript object.
 *
 * The decoder is intentionally generic (no hand-written per-message code), so
 * any ROS 2 message type the bridge advertises decodes without a code change.
 */

import { CdrReader, detectEncapsulation } from './cdr.ts';
import {
  CdrDecodeError,
  MissingDefinitionError,
  type MsgDefinition,
  type MsgField,
  type MsgSchema,
  type PrimitiveType,
  type RosTime,
} from './types.ts';

export type MessageObject = Record<string, unknown>;

export interface DecodeOptions {
  /**
   * `'auto'` (default) strips an OMG CDR header when present, `'cdr'`
   * requires one, `'none'` treats the payload as a bare body.
   */
  encapsulation?: 'auto' | 'cdr' | 'none';
  /**
   * How `uint8[]`/`byte[]` fields are surfaced. `'view'` (default) returns a
   * zero-copy subarray, which is what high-rate image/point-cloud payloads
   * need; `'copy'` returns an independent copy.
   */
  byteArrays?: 'view' | 'copy';
}

export interface DecodeResult {
  value: MessageObject;
  /** Bytes consumed, including any skipped encapsulation header. */
  bytesRead: number;
  /** True when an OMG CDR encapsulation header was present. */
  hadEncapsulationHeader: boolean;
}

const FLOAT32 = 4;
const FLOAT64 = 8;
const INT8 = 1;
const UINT8 = 2;
const INT16 = 3;
const UINT16 = 4;
const INT32 = 5;
const UINT32 = 6;

/** `sensor_msgs/msg/PointCloud2.PointField.datatype` values, reused for field access. */
export const POINT_FIELD_DATATYPE = {
  INT8: 1,
  UINT8: 2,
  INT16: 3,
  UINT16: 4,
  INT32: 5,
  UINT32: 6,
  FLOAT32: 7,
  FLOAT64: 8,
} as const;

export type PointFieldDatatype =
  (typeof POINT_FIELD_DATATYPE)[keyof typeof POINT_FIELD_DATATYPE];

function isBytePrimitive(type: PrimitiveType): boolean {
  return type === 'uint8' || type === 'byte' || type === 'char';
}

function decodePrimitive(reader: CdrReader, type: PrimitiveType): unknown {
  switch (type) {
    case 'bool':
      return reader.bool();
    case 'byte':
    case 'uint8':
    case 'char':
      return reader.u8();
    case 'int8':
      return reader.i8();
    case 'uint16':
      return reader.u16();
    case 'int16':
      return reader.i16();
    case 'uint32':
      return reader.u32();
    case 'int32':
      return reader.i32();
    case 'uint64':
      return reader.u64();
    case 'int64':
      return reader.i64();
    case 'float32':
      return reader.f32();
    case 'float64':
      return reader.f64();
    case 'string':
      return reader.string();
    case 'wstring':
      return reader.wstring();
    case 'time':
    case 'duration': {
      const sec = reader.i32();
      const nanosec = reader.u32();
      return { sec, nanosec } satisfies RosTime;
    }
    default: {
      const never: never = type;
      throw new CdrDecodeError(`unsupported primitive type "${String(never)}"`, reader.offset);
    }
  }
}

function decodeFieldValue(
  reader: CdrReader,
  field: MsgField,
  definition: MsgDefinition,
  schema: MsgSchema,
  options: Required<DecodeOptions>,
): unknown {
  const { type } = field;

  if (!field.isArray) {
    if (type.kind === 'primitive') return decodePrimitive(reader, type.name);
    return decodeStruct(reader, type.name, definition.name, schema, options);
  }

  const count = field.arrayLength ?? reader.u32();
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new CdrDecodeError(`invalid sequence length ${count} for ${field.name}`, reader.offset);
  }
  // Cheap sanity guard against schema/payload mismatch: every element needs at
  // least one byte on the wire.
  if (count > reader.remaining + 1) {
    throw new CdrDecodeError(
      `sequence length ${count} for ${field.name} exceeds remaining payload (${reader.remaining} bytes)`,
      reader.offset,
    );
  }

  if (type.kind === 'primitive' && isBytePrimitive(type.name)) {
    const width = count;
    if (options.byteArrays === 'copy') return reader.copyBytes(width);
    return reader.bytesView(width);
  }

  const out = new Array<unknown>(count);
  for (let i = 0; i < count; i += 1) {
    out[i] =
      type.kind === 'primitive'
        ? decodePrimitive(reader, type.name)
        : decodeStruct(reader, type.name, definition.name, schema, options);
  }
  return out;
}

function decodeStruct(
  reader: CdrReader,
  typeName: string,
  referencedBy: string,
  schema: MsgSchema,
  options: Required<DecodeOptions>,
): MessageObject {
  const definition = schema.definitions.get(typeName);
  if (definition === undefined) throw new MissingDefinitionError(typeName, referencedBy);

  const out: MessageObject = {};
  for (const field of definition.fields) {
    if (field.isConstant) continue;
    out[field.name] = decodeFieldValue(reader, field, definition, schema, options);
  }
  return out;
}

/**
 * Decode a single ROS 2 message payload.
 *
 * @throws {CdrDecodeError} when the payload is truncated or inconsistent with the schema.
 * @throws {MissingDefinitionError} when the schema lacks a transitive definition.
 */
export function decodeMessage(
  schema: MsgSchema,
  typeName: string,
  payload: Uint8Array,
  options: DecodeOptions = {},
): DecodeResult {
  const resolved: Required<DecodeOptions> = {
    encapsulation: options.encapsulation ?? 'auto',
    byteArrays: options.byteArrays ?? 'view',
  };

  let skip = 0;
  let littleEndian = true;
  let hadHeader = false;

  if (resolved.encapsulation === 'none') {
    skip = 0;
  } else {
    const detected = detectEncapsulation(payload);
    if (resolved.encapsulation === 'cdr') {
      if (detected.kind !== 'cdr') {
        throw new CdrDecodeError('expected an OMG CDR encapsulation header but found none', 0);
      }
      skip = detected.skip;
      littleEndian = detected.littleEndian;
      hadHeader = true;
    } else if (detected.kind === 'cdr') {
      skip = detected.skip;
      littleEndian = detected.littleEndian;
      hadHeader = true;
    }
  }

  const reader = new CdrReader(payload, { base: skip, littleEndian });
  const value = decodeStruct(reader, typeName, typeName, schema, resolved);
  return { value, bytesRead: reader.absoluteOffset, hadEncapsulationHeader: hadHeader };
}

/**
 * Read a small numeric point field from a PointCloud2 data buffer.
 * Kept here so both the generic decoder and the fast path agree on datatypes.
 */
export function readPointFieldValue(
  view: DataView,
  offset: number,
  datatype: number,
  littleEndian: boolean,
): number {
  switch (datatype) {
    case POINT_FIELD_DATATYPE.INT8:
      return view.getInt8(offset);
    case POINT_FIELD_DATATYPE.UINT8:
      return view.getUint8(offset);
    case POINT_FIELD_DATATYPE.INT16:
      return view.getInt16(offset, littleEndian);
    case POINT_FIELD_DATATYPE.UINT16:
      return view.getUint16(offset, littleEndian);
    case POINT_FIELD_DATATYPE.INT32:
      return view.getInt32(offset, littleEndian);
    case POINT_FIELD_DATATYPE.UINT32:
      return view.getUint32(offset, littleEndian);
    case POINT_FIELD_DATATYPE.FLOAT32:
      return view.getFloat32(offset, littleEndian);
    case POINT_FIELD_DATATYPE.FLOAT64:
      return view.getFloat64(offset, littleEndian);
    default:
      throw new CdrDecodeError(`unknown PointField datatype ${datatype}`, offset);
  }
}

export { FLOAT32, FLOAT64, INT8, UINT8, INT16, UINT16, INT32, UINT32 };
