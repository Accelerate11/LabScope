import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseMsgDefinitionText } from '../src/msgdef.ts';
import { decodeMessage } from '../src/decode.ts';
import { decodePointCloud2 } from '../src/pointcloud.ts';
import { rosTimeToSeconds } from '../src/types.ts';
import { CdrWriter } from './helpers/cdr-writer.ts';

const readFixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Build a 3-point x/y/z float32 PointCloud2 payload. */
function buildPointCloudPayload(): { payload: Uint8Array; points: number[][] } {
  const points = [
    [1, 2, 3],
    [-4, 5.5, -6],
    [0.25, 0.5, 0.75],
  ];
  const pointStep = 16;
  const data = new Uint8Array(points.length * pointStep);
  const view = new DataView(data.buffer);
  points.forEach((p, i) => {
    view.setFloat32(i * pointStep + 0, p[0] as number, true);
    view.setFloat32(i * pointStep + 4, p[1] as number, true);
    view.setFloat32(i * pointStep + 8, p[2] as number, true);
    view.setFloat32(i * pointStep + 12, 100 + i, true);
  });

  const writer = new CdrWriter()
    .encapsulationLittleEndian()
    .i32(1_700_000_100)
    .u32(500)
    .string('livox_frame')
    .u32(1) // height
    .u32(points.length) // width
    // fields
    .u32(4);
  const fieldDefs: [string, number, number][] = [
    ['x', 0, 7],
    ['y', 4, 7],
    ['z', 8, 7],
    ['intensity', 12, 7],
  ];
  for (const [name, offset, datatype] of fieldDefs) {
    writer.string(name).u32(offset).u8(datatype).u32(1);
  }
  writer
    .u8(0) // is_bigendian
    .u32(pointStep) // point_step
    .u32(pointStep * points.length) // row_step
    .bytes(data)
    .u8(1); // is_dense

  return { payload: writer.toUint8Array(), points };
}

describe('decodePointCloud2', () => {
  const schema = parseMsgDefinitionText(
    'sensor_msgs/msg/PointCloud2',
    readFixture('pointcloud2.ros2msg.txt'),
  );

  it('decodes header, layout and point positions', () => {
    const { payload, points } = buildPointCloudPayload();
    const cloud = decodePointCloud2(schema, payload);

    expect(cloud.frameId).toBe('livox_frame');
    expect(rosTimeToSeconds(cloud.stamp)).toBeCloseTo(1_700_000_100.000_000_5, 3);
    expect(cloud.width).toBe(3);
    expect(cloud.height).toBe(1);
    expect(cloud.pointCount).toBe(3);
    expect(cloud.pointStep).toBe(16);
    expect(cloud.rowStep).toBe(48);
    expect(cloud.isDense).toBe(true);
    expect(cloud.fields.map((f) => f.name)).toEqual(['x', 'y', 'z', 'intensity']);
    expect(cloud.data.byteLength).toBe(48);

    const positions = cloud.positions();
    expect(positions).not.toBeNull();
    points.forEach((p, i) => {
      expect(positions?.[i * 3]).toBeCloseTo(p[0] as number, 5);
      expect(positions?.[i * 3 + 1]).toBeCloseTo(p[1] as number, 5);
      expect(positions?.[i * 3 + 2]).toBeCloseTo(p[2] as number, 5);
    });

    const intensity = cloud.fieldValues('intensity');
    expect(intensity?.[0]).toBeCloseTo(100, 5);
    expect(cloud.fieldValues('missing')).toBeNull();
  });

  it('rejects a payload whose data length does not match the layout', () => {
    const { payload } = buildPointCloudPayload();
    const truncated = payload.slice(0, payload.byteLength - 20);
    expect(() => decodePointCloud2(schema, truncated)).toThrow();
  });
});

describe('decodeMessage for sensor_msgs/msg/Image', () => {
  it('decodes rgb8 image metadata and exposes the pixel buffer as a view', () => {
    const schema = parseMsgDefinitionText(
      'sensor_msgs/msg/Image',
      [
        '# synthetic image schema (same field order as the real one)',
        'std_msgs/Header header',
        'uint32 height',
        'uint32 width',
        'string encoding',
        'uint8 is_bigendian',
        'uint32 step',
        'uint8[] data',
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

    const pixels = new Uint8Array(2 * 2 * 3).fill(200);
    const payload = new CdrWriter()
      .encapsulationLittleEndian()
      .i32(10)
      .u32(20)
      .string('camera_optical_frame')
      .u32(2)
      .u32(2)
      .string('rgb8')
      .u8(0)
      .u32(6)
      .bytes(pixels)
      .toUint8Array();

    const { value } = decodeMessage(schema, 'sensor_msgs/msg/Image', payload);
    expect(value).toMatchObject({ height: 2, width: 2, encoding: 'rgb8', is_bigendian: 0, step: 6 });
    expect((value['data'] as Uint8Array).byteLength).toBe(12);
    expect(value['header']).toEqual({
      stamp: { sec: 10, nanosec: 20 },
      frame_id: 'camera_optical_frame',
    });
  });
});
