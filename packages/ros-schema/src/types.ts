/**
 * Shared types for ROS 2 message schema handling.
 *
 * A "schema" here is what a Foxglove-protocol server advertises per channel:
 * a message type name (e.g. `sensor_msgs/msg/Imu`) plus the ROS 2 `.msg`
 * definition text, with dependent definitions concatenated after separator
 * lines (`====`), each introduced by a `MSG: <type>` header.
 */

/** ROS 2 `.msg` primitive field types. */
export type PrimitiveType =
  | 'bool'
  | 'byte'
  | 'char'
  | 'float32'
  | 'float64'
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'int64'
  | 'uint64'
  | 'string'
  | 'wstring'
  | 'time'
  | 'duration';

export const PRIMITIVE_TYPES: ReadonlySet<string> = new Set<PrimitiveType>([
  'bool',
  'byte',
  'char',
  'float32',
  'float64',
  'int8',
  'uint8',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'string',
  'wstring',
  'time',
  'duration',
]);

export type FieldType =
  | { kind: 'primitive'; name: PrimitiveType }
  | { kind: 'message'; name: string };

/** One field of a message definition. */
export interface MsgField {
  readonly name: string;
  readonly type: FieldType;
  /** True for `T[]` / `T[N]`, false for a scalar. */
  readonly isArray: boolean;
  /** Fixed length for `T[N]`; `null` for unbounded sequences; for bounded sequences it is `null` and `upperBound` is set. */
  readonly arrayLength: number | null;
  /** Upper bound for `T<=N` / `T[<=N]`; informational only, decoding still reads a sequence length prefix. */
  readonly upperBound: number | null;
  /** `true` for `TYPE NAME=value` constant declarations (no wire representation). */
  readonly isConstant: boolean;
  /** Raw text of the constant value, if any. */
  readonly constantValue?: string;
  /**
   * Default value text. `foxglove_bridge` emits IDL-style defaults in
   * dependent definitions (e.g. `float64 x 0`); defaults never affect the wire
   * format, so they are parsed and kept for display only.
   */
  readonly defaultValue?: string;
}

export interface MsgDefinition {
  /** Fully qualified `package/msg/Type` name. */
  readonly name: string;
  readonly fields: readonly MsgField[];
}

/** A message type plus every definition it transitively references. */
export interface MsgSchema {
  /** Fully qualified root type name, e.g. `sensor_msgs/msg/Imu`. */
  readonly rootType: string;
  readonly definitions: ReadonlyMap<string, MsgDefinition>;
}

/** Error thrown when a schema definition text cannot be parsed. */
export class SchemaParseError extends Error {
  override readonly name = 'SchemaParseError';
}

/** Error thrown when a payload cannot be decoded with the given schema. */
export class CdrDecodeError extends Error {
  override readonly name = 'CdrDecodeError';
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at CDR offset ${offset})`);
    this.offset = offset;
  }
}

/** Error thrown for reference types whose wire format is not implemented. */
export class UnsupportedTypeError extends Error {
  override readonly name = 'UnsupportedTypeError';
}

/** Error thrown when a nested message definition is missing from the schema. */
export class MissingDefinitionError extends Error {
  override readonly name = 'MissingDefinitionError';
  constructor(readonly typeName: string, readonly referencedBy: string) {
    super(`message definition for "${typeName}" (referenced by "${referencedBy}") is missing`);
  }
}

/** A `{sec, nanosec}` pair as used by `builtin_interfaces/msg/Time|Duration`. */
export interface RosTime {
  sec: number;
  nanosec: number;
}

/** Convenience: convert a `RosTime` into fractional seconds. */
export function rosTimeToSeconds(t: RosTime): number {
  return t.sec + t.nanosec / 1e9;
}
