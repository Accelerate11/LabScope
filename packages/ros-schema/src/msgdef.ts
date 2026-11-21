/**
 * Parser for the ROS 2 `.msg` definition text that a Foxglove-protocol server
 * sends in each channel's `schema` field.
 *
 * Wire shape observed from `foxglove_bridge` 3.6.3 (ROS 2 Humble):
 *
 *   # comment lines
 *   std_msgs/Header header
 *   geometry_msgs/Quaternion orientation
 *   float64[9] orientation_covariance
 *   ================================================================================
 *   MSG: std_msgs/Header
 *   builtin_interfaces/Time stamp
 *   string frame_id
 *   ================================================================================
 *   MSG: geometry_msgs/Quaternion
 *   float64 x
 *   ...
 *
 * Field syntax handled: `type name`, `type[] name`, `type[N] name`,
 * `type<=N name`, `type[<=N] name`, and `type NAME=value` constants.
 */

import {
  PRIMITIVE_TYPES,
  SchemaParseError,
  type FieldType,
  type MsgDefinition,
  type MsgField,
  type MsgSchema,
  type PrimitiveType,
} from './types.ts';

const SECTION_SEPARATOR = /^=+\s*$/;
const MSG_HEADER = /^MSG:\s*(\S+)\s*$/;

/**
 * Field declaration, with an optional `= constant` or ` default` tail.
 *
 * Group 1: type token (possibly bounded, e.g. `string<=16`)
 * Group 2: array specifier (`[]`, `[9]`, `[<=9]`)
 * Group 3: field name
 * Group 4: constant value text (after `=`)
 * Group 5: default value text (no `=`; `foxglove_bridge` emits these for
 *          dependent definitions, e.g. `float64 x 0`)
 */
const TYPE_TOKEN =
  '[A-Za-z_][A-Za-z0-9_]*(?:\\/(?:msg\\/)?[A-Za-z_][A-Za-z0-9_]*)?(?:<=\\d+)?';
const FIELD_LINE = new RegExp(
  `^(${TYPE_TOKEN})(\\[[^\\]]*\\])?\\s+([A-Za-z_][A-Za-z0-9_]*)(?:\\s*=\\s*(.*)|\\s+(.+))?$`,
);

/**
 * IDL default values are literals. Validating them keeps the parser strict:
 * without this, any three-token line (`this is not a field`) would silently
 * parse as "field `is` with default `not a field`".
 */
const DEFAULT_LITERAL =
  /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/;

/** Normalize `pkg/Type`, `pkg/msg/Type`, or a bare `Type` into `pkg/msg/Type`. */
export function normalizeMessageType(raw: string, currentPackage: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new SchemaParseError('empty message type name');
  const parts = trimmed.split('/').filter((p) => p.length > 0);
  if (parts.length === 1) return `${currentPackage}/msg/${parts[0]}`;
  if (parts.length === 2) return `${parts[0]}/msg/${parts[1]}`;
  if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
  throw new SchemaParseError(`unrecognized message type name "${raw}"`);
}

/** `package/msg/Type` -> `package`. */
export function packageOf(typeName: string): string {
  const slash = typeName.indexOf('/');
  if (slash <= 0) throw new SchemaParseError(`type name "${typeName}" has no package`);
  return typeName.slice(0, slash);
}

interface ArraySpec {
  isArray: boolean;
  length: number | null;
  upperBound: number | null;
}

function parseArraySpec(spec: string | undefined): ArraySpec {
  if (spec === undefined) return { isArray: false, length: null, upperBound: null };
  const inner = spec.slice(1, -1).trim();
  if (inner.length === 0) return { isArray: true, length: null, upperBound: null };
  const bounded = /^<=(\d+)$/.exec(inner);
  if (bounded) {
    return { isArray: true, length: null, upperBound: Number(bounded[1]) };
  }
  if (!/^\d+$/.test(inner)) {
    throw new SchemaParseError(`invalid array specifier "${spec}"`);
  }
  return { isArray: true, length: Number(inner), upperBound: null };
}

function parseTypeToken(
  token: string,
  currentPackage: string,
): { type: FieldType; upperBound: number | null } {
  // Bounded strings: `string<=16`
  let base = token;
  let upperBound: number | null = null;
  const bounded = /^([A-Za-z_][A-Za-z0-9_]*(?:\/(?:msg\/)?[A-Za-z_][A-Za-z0-9_]*)?)<=(\d+)$/.exec(
    token,
  );
  if (bounded) {
    base = bounded[1] as string;
    upperBound = Number(bounded[2]);
  }

  if (PRIMITIVE_TYPES.has(base)) {
    return { type: { kind: 'primitive', name: base as PrimitiveType }, upperBound };
  }
  if (base.includes('/') || /^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) {
    return { type: { kind: 'message', name: normalizeMessageType(base, currentPackage) }, upperBound };
  }
  throw new SchemaParseError(`unrecognized field type "${token}"`);
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return (hash === -1 ? line : line.slice(0, hash)).trim();
}

/** Parse one message body (no `MSG:` header, no separators). */
export function parseMsgDefinitionBody(typeName: string, body: string): MsgDefinition {
  const currentPackage = packageOf(typeName);
  const fields: MsgField[] = [];
  const seen = new Set<string>();

  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (line.length === 0) continue;

    const match = FIELD_LINE.exec(line);
    if (match === null) {
      throw new SchemaParseError(`cannot parse field declaration "${rawLine}" in ${typeName}`);
    }
    const [, rawType, arraySpec, name, constantValue, defaultValue] = match;
    if (defaultValue !== undefined && !DEFAULT_LITERAL.test(defaultValue.trim())) {
      throw new SchemaParseError(
        `cannot parse field declaration "${rawLine}" in ${typeName}: ` +
          `unexpected trailing text ${JSON.stringify(defaultValue.trim())}`,
      );
    }
    const { type, upperBound } = parseTypeToken(rawType as string, currentPackage);
    const arr = parseArraySpec(arraySpec);

    if (seen.has(name as string)) {
      throw new SchemaParseError(`duplicate field "${name}" in ${typeName}`);
    }
    seen.add(name as string);

    // Constants are declared with `=`. Bare trailing tokens are IDL-style
    // defaults (no wire effect) and must not be mistaken for constants.
    const isConstant = constantValue !== undefined;
    const field: MsgField = {
      name: name as string,
      type,
      isArray: arr.isArray,
      arrayLength: arr.length,
      upperBound: arr.upperBound ?? upperBound,
      isConstant,
      ...(constantValue !== undefined && constantValue.length > 0
        ? { constantValue: constantValue.trim() }
        : {}),
      ...(defaultValue !== undefined && defaultValue.length > 0
        ? { defaultValue: defaultValue.trim() }
        : {}),
    };
    fields.push(field);
  }

  return { name: typeName, fields };
}

/**
 * Parse a full Foxglove/ROS 2 schema document (root definition followed by
 * `MSG:`-headed dependent definitions separated by `===` lines).
 *
 * The root type name is supplied by the channel's `schemaName`; the parser
 * trusts it rather than the first section header.
 */
export function parseMsgDefinitionText(rootType: string, text: string): MsgSchema {
  const sections: { typeName: string | null; lines: string[] }[] = [];
  let current: { typeName: string | null; lines: string[] } = { typeName: null, lines: [] };

  for (const line of text.split(/\r?\n/)) {
    if (SECTION_SEPARATOR.test(line.trim())) {
      sections.push(current);
      current = { typeName: null, lines: [] };
      continue;
    }
    const header = MSG_HEADER.exec(line.trim());
    if (header) {
      // A header starts a new definition; flush anything accumulated so far.
      if (current.lines.some((l) => l.trim().length > 0) || current.typeName !== null) {
        sections.push(current);
        current = { typeName: null, lines: [] };
      }
      current.typeName = normalizeMessageType(header[1] as string, packageOf(rootType));
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);

  const definitions = new Map<string, MsgDefinition>();
  let isFirst = true;
  for (const section of sections) {
    const body = section.lines.join('\n').trim();
    if (body.length === 0) {
      if (isFirst) {
        throw new SchemaParseError(`schema text for ${rootType} has no fields`);
      }
      continue;
    }
    const typeName = isFirst
      ? rootType
      : (section.typeName ?? (() => {
          throw new SchemaParseError(
            `dependent schema section in ${rootType} is missing a "MSG:" header`,
          );
        })());
    isFirst = false;
    definitions.set(typeName, parseMsgDefinitionBody(typeName, body));
  }

  if (!definitions.has(rootType)) {
    definitions.set(rootType, parseMsgDefinitionBody(rootType, text));
  }

  return { rootType, definitions };
}
