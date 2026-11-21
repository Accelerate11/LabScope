import { describe, expect, it } from 'vitest';
import { parsePointCloud2, type PointCloud2Message } from '@labscope/ros-schema';
import { decodeDisplayCloud, PointCloudProcessor, POINT_CLOUD_SCHEMA } from '../src/renderer/src/pointcloud/processor';
import type { MessageEnvelope } from '../src/renderer/src/workspace/message-bus';

function fixture(bigEndian = false, color: 'packed-rgba' | 'packed-rgb' | 'vector' | 'none' = 'packed-rgba') {
  const data = new Uint8Array(new ArrayBuffer(106), 2, 104);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const little = !bigEndian;
  for (let index = 0; index < 4; index++) {
    const base = Math.floor(index / 2) * 52 + (index % 2) * 24;
    view.setInt16(base, index + 20, little);
    view.setFloat64(base + 2, index - 2, little);
    view.setFloat32(base + 10, index + 0.25, little);
    view.setUint8(base + 14, index + 2);
    view.setUint8(base + 15, 10 * index);
    if (color === 'vector') data.set([132, 33, 7, 91], base + 16);
    else view.setUint32(base + 16, 0xff842107 - index * 0x1000000, little);
    view.setUint32(base + 20, 100 + index, little);
  }
  const fields = [
    { name: 'ring', offset: 14, datatype: 2, count: 1 },
    { name: 'z', offset: 0, datatype: 3, count: 1 },
    { name: 't', offset: 20, datatype: 6, count: 1 },
    { name: 'x', offset: 2, datatype: 8, count: 1 },
    { name: 'intensity', offset: 15, datatype: 2, count: 1 },
    { name: 'y', offset: 10, datatype: 7, count: 1 },
  ];
  if (color !== 'none') fields.push({
    name: color === 'packed-rgb' ? 'rgb' : 'rgba', offset: 16,
    datatype: color === 'vector' ? 2 : color === 'packed-rgb' ? 7 : 6,
    count: color === 'vector' ? 4 : 1,
  });
  return {
    header: { stamp: { sec: 42, nanosec: 123 }, frame_id: 'test_lidar' },
    width: 2, height: 2, point_step: 24, row_step: 52, is_dense: false, is_bigendian: bigEndian,
    fields, data,
  } satisfies PointCloud2Message;
}

describe('PointCloud2 layout and display processing', () => {
  it('reads all eight ROS numeric PointField datatypes', () => {
    const buffer = new ArrayBuffer(26);
    const view = new DataView(buffer);
    view.setInt8(0, -8);
    view.setUint8(1, 240);
    view.setInt16(2, -2048, true);
    view.setUint16(4, 50000, true);
    view.setInt32(6, -123456, true);
    view.setUint32(10, 3_000_000_000, true);
    view.setFloat32(14, 0.75, true);
    view.setFloat64(18, -0.25, true);
    const raw = fixture();
    const cloud = parsePointCloud2({ ...raw, width: 1, height: 1, point_step: 26, row_step: 26,
      data: new Uint8Array(buffer), fields: [0, 1, 2, 4, 6, 10, 14, 18].map((offset, index) =>
        ({ offset, name: String(index), datatype: index + 1, count: 1 })) });
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((index) => cloud.scalar(String(index))?.(0)))
      .toEqual([-8, 240, -2048, 50000, -123456, 3_000_000_000, 0.75, -0.25]);
  });
  it.each([false, true])('reads shuffled mixed types and padded rows (big endian %s)', (big) => {
    const raw = fixture(big);
    const cloud = parsePointCloud2(raw);
    expect(cloud.message.data).toBe(raw.data);
    expect(cloud.byteOffset(2)).toBe(52);
    expect(cloud.scalar('ring')?.(cloud.byteOffset(3))).toBe(5);
    expect(cloud.scalar('t')?.(cloud.byteOffset(3))).toBe(103);
    const processor = new PointCloudProcessor();
    const result = processor.process(cloud, { colorMode: 'rgb', sampling: 'uniform', maxPoints: 4 });
    expect(result).toMatchObject({ frameId: 'test_lidar', stamp: raw.header.stamp, drawnPoints: 4, hasAlpha: true });
    expect([...processor.positions.subarray(0, 12)]).toEqual([-2, 0.25, 20, -1, 1.25, 21, 0, 2.25, 22, 1, 3.25, 23]);
    expect([...processor.colors.subarray(4, 8)]).toEqual([132, 33, 7, 254]);
  });

  it.each(['packed-rgb', 'vector'] as const)('reads %s and survives FLOAT32 color bit patterns', (mode) => {
    const layout = parsePointCloud2(fixture(false, mode));
    const p = new PointCloudProcessor();
    p.process(layout, { colorMode: 'rgb', sampling: 'first', maxPoints: 1 });
    expect([...p.colors.subarray(0, 4)]).toEqual([132, 33, 7, mode === 'vector' ? 91 : 255]);
  });

  it.each(['intensity', 'height', 'distance'] as const)('normalizes %s over displayed finite values', (colorMode) => {
    const p = new PointCloudProcessor();
    p.process(parsePointCloud2(fixture()), { colorMode, sampling: 'first', maxPoints: 4 });
    expect([...p.colors.subarray(0, 4)]).toEqual([32, 91, 243, 255]);
    expect([...p.colors.subarray(12, 16)]).toEqual([247, 198, 70, 255]);
  });

  it('keeps stable sampling and buffers, falls back for absent color and preserves source data', () => {
    const raw = fixture(false, 'none');
    const before = raw.data.slice();
    const p = new PointCloudProcessor();
    const cloud = parsePointCloud2(raw);
    const options = { colorMode: 'rgb', sampling: 'uniform', maxPoints: 2 } as const;
    expect(p.process(cloud, options).effectiveColor).toBe('xyz');
    const { positions, colors } = p;
    expect([...positions]).toEqual([-2, 0.25, 20, 0, 2.25, 22]);
    p.process(cloud, options);
    expect(p.positions).toBe(positions);
    expect(p.colors).toBe(colors);
    p.process(cloud, { ...options, sampling: 'first' });
    expect([...positions]).toEqual([-2, 0.25, 20, -1, 1.25, 21]);
    expect(raw.data).toEqual(before);
  });

  it('clamps fixed intensity/height ranges and reports all valid points before sampling', () => {
    const raw = fixture();
    const bytes = new DataView(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength);
    // The invalid sample is outside the chosen index range.
    bytes.setFloat64(52 + 24 + 2, NaN, true);
    const p = new PointCloudProcessor();
    const layout = parsePointCloud2(raw);
    const height = p.process(layout, { colorMode: 'height', sampling: 'first', maxPoints: 2, heightRange: [20, 30] });
    expect(height).toMatchObject({ sourcePoints: 4, sampledPoints: 2, validPoints: 3, drawnPoints: 2, invalidPoints: 1 });
    expect(p.colors[4]).toBe(54);
    p.process(layout, { colorMode: 'intensity', sampling: 'first', maxPoints: 2, intensityRange: [-20, 0] });
    expect(p.colors[0]).toBe(247);
    p.process(layout, { colorMode: 'xyz', sampling: 'first', maxPoints: 1, fixedColor: '#123456' });
    expect([...p.colors.subarray(0, 4)]).toEqual([18, 52, 86, 255]);
  });

  it('skips NaN, Infinity and samples outside Float32, even with is_dense set', () => {
    const raw = fixture();
    const data = new DataView(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength);
    data.setFloat64(2, NaN, true);
    data.setFloat32(24 + 10, Infinity, true);
    data.setFloat64(52 + 2, 1e120, true);
    const p = new PointCloudProcessor();
    const result = p.process(parsePointCloud2({ ...raw, is_dense: true }), { colorMode: 'xyz', sampling: 'uniform', maxPoints: 4 });
    expect(result).toMatchObject({ drawnPoints: 1, invalidPoints: 3 });
    expect([...p.positions.subarray(0, 3)]).toEqual([1, 3.25, 23]);
  });

  it('rejects malformed schema and missing XYZ and supports the time alias', () => {
    const raw = fixture();
    expect(() => parsePointCloud2({ ...raw, row_step: 40 })).toThrow(/row_step/);
    expect(() => parsePointCloud2({ ...raw, data: raw.data.subarray(1) })).toThrow(/data size/);
    expect(() => parsePointCloud2({ ...raw, fields: [{ name: 'x', offset: 23, count: 1, datatype: 8 }] })).toThrow(/invalid field/);
    expect(() => parsePointCloud2({ ...raw, fields: [...raw.fields, raw.fields[0]] })).toThrow(/invalid field/);
    expect(() => parsePointCloud2({ ...raw, fields: [{ name: 'x', offset: 0, count: 0, datatype: 8 }] })).toThrow(/invalid field/);
    const cloud = parsePointCloud2({ ...raw, fields: raw.fields.filter((field) => field.name !== 'x')
      .map((field) => field.name === 't' ? { ...field, name: 'time' } : field) });
    expect(cloud.scalar('time')?.(cloud.byteOffset(3))).toBe(103);
    expect(() => new PointCloudProcessor().process(cloud,
      { colorMode: 'xyz', sampling: 'first', maxPoints: 4 })).toThrow(/x、y 或 z/);
  });

  it('uses one full-message contract for live, playback and simulation', () => {
    const raw = fixture();
    const frame: MessageEnvelope = { source: 'simulation', schemaName: POINT_CLOUD_SCHEMA, topic: '/points',
      payload: { kind: 'decoded', value: raw }, logTimeNs: '42000000123', sequence: 1 };
    for (const source of ['live', 'playback', 'simulation'] as const) {
      expect(decodeDisplayCloud({ ...frame, source }).message).toBe(raw);
    }
    expect(() => decodeDisplayCloud({ ...frame, payload: { kind: 'preview', value: {} } })).toThrow(/完整/);
  });
});
