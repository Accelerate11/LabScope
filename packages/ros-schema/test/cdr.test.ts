import { describe, expect, it } from 'vitest';

import { CdrReader, detectEncapsulation } from '../src/cdr.ts';
import { parseMsgDefinitionText } from '../src/msgdef.ts';
import { decodeMessage } from '../src/decode.ts';
import { CdrDecodeError, UnsupportedTypeError } from '../src/types.ts';
import { CdrWriter } from './helpers/cdr-writer.ts';

const schemaFor = (type: string, body: string) => parseMsgDefinitionText(type, body);

describe('detectEncapsulation', () => {
  it('detects little-endian CDR header', () => {
    expect(detectEncapsulation(new Uint8Array([0, 1, 0, 0, 9, 9]))).toEqual({
      skip: 4,
      littleEndian: true,
      kind: 'cdr',
    });
  });

  it('detects big-endian CDR header', () => {
    expect(detectEncapsulation(new Uint8Array([0, 0, 0, 0]))).toEqual({
      skip: 4,
      littleEndian: false,
      kind: 'cdr',
    });
  });

  it('falls back to raw payload when no header is present', () => {
    expect(detectEncapsulation(new Uint8Array([0x20, 0x28, 0x00, 0x6b]))).toEqual({
      skip: 0,
      littleEndian: true,
      kind: 'none',
    });
  });
});

describe('CdrReader alignment and primitives', () => {
  it('aligns f64 to 8 bytes measured from the body start', () => {
    // Body: u8 (1 byte) + 7 padding + f64.
    const body = new CdrWriter().u8(7).f64(1.25).toUint8Array();
    expect(body.byteLength).toBe(16);

    const reader = new CdrReader(body);
    expect(reader.u8()).toBe(7);
    expect(reader.f64()).toBe(1.25);
    expect(reader.remaining).toBe(0);
  });

  it('decodes ROS 2 strings with a trailing NUL inside the counted length', () => {
    const body = new CdrWriter().string('imu_link').toUint8Array();
    expect(body.byteLength).toBe(4 + 9);
    const reader = new CdrReader(body);
    expect(reader.string()).toBe('imu_link');
  });

  it('throws CdrDecodeError on truncated payloads', () => {
    const reader = new CdrReader(new Uint8Array([1, 2]));
    reader.u16();
    expect(() => reader.f64()).toThrow(CdrDecodeError);
  });

  it('rejects wstring explicitly instead of silently mis-decoding', () => {
    expect(() => new CdrReader(new Uint8Array(8)).wstring()).toThrow(UnsupportedTypeError);
  });
});

describe('decodeMessage', () => {
  it('decodes a struct with nested message, string and fixed array', () => {
    const schema = schemaFor(
      'test_msgs/msg/Outer',
      [
        'std_msgs/Header header',
        'float64[3] values',
        'uint8[] blob',
        'string label',
        '====',
        'MSG: std_msgs/Header',
        'builtin_interfaces/Time stamp',
        'string frame_id',
        '====',
        'MSG: builtin_interfaces/Time',
        'int32 sec',
        'uint32 nanosec',
      ].join('\n'),
    );

    const blob = new Uint8Array([9, 8, 7]);
    const payload = new CdrWriter()
      .encapsulationLittleEndian()
      .i32(1_700_000_000)
      .u32(250)
      .string('base_link')
      .f64(1.5)
      .f64(-2.0)
      .f64(3.25)
      .bytes(blob)
      .string('hello')
      .toUint8Array();

    const { value, hadEncapsulationHeader } = decodeMessage(schema, 'test_msgs/msg/Outer', payload);
    expect(hadEncapsulationHeader).toBe(true);
    expect(value).toEqual({
      header: { stamp: { sec: 1_700_000_000, nanosec: 250 }, frame_id: 'base_link' },
      values: [1.5, -2.0, 3.25],
      blob,
      label: 'hello',
    });
    // `blob` is a zero-copy view by default.
    expect(value['blob']).toBeInstanceOf(Uint8Array);
  });

  it('returns an independent copy when byteArrays is "copy"', () => {
    const schema = schemaFor('test_msgs/msg/Bytes', 'uint8[] data');
    const payload = new CdrWriter().encapsulationLittleEndian().bytes(new Uint8Array([1, 2, 3])).toUint8Array();
    const { value } = decodeMessage(schema, 'test_msgs/msg/Bytes', payload, { byteArrays: 'copy' });
    expect(Array.from(value['data'] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('can skip a payload without an encapsulation header', () => {
    const schema = schemaFor('test_msgs/msg/Small', 'uint32 a\nfloat32 b');
    const payload = new CdrWriter().u32(42).f32(0.5).toUint8Array();
    const { value, hadEncapsulationHeader } = decodeMessage(schema, 'test_msgs/msg/Small', payload);
    expect(value).toEqual({ a: 42, b: 0.5 });
    expect(hadEncapsulationHeader).toBe(false);
  });

  it('rejects a truncated payload instead of returning garbage', () => {
    const schema = schemaFor('test_msgs/msg/Small', 'uint32 a\nfloat32 b');
    const payload = new CdrWriter().encapsulationLittleEndian().u32(42).toUint8Array();
    expect(() => decodeMessage(schema, 'test_msgs/msg/Small', payload)).toThrow(CdrDecodeError);
  });

  it('rejects absurd sequence lengths', () => {
    const schema = schemaFor('test_msgs/msg/List', 'float64[] values');
    const payload = new CdrWriter().encapsulationLittleEndian().u32(1_000_000).toUint8Array();
    expect(() => decodeMessage(schema, 'test_msgs/msg/List', payload)).toThrow(CdrDecodeError);
  });
});
