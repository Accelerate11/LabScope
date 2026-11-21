import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseMsgDefinitionText } from '../src/msgdef.ts';
import { decodeMessage } from '../src/decode.ts';
import { decodePointCloud2 } from '../src/pointcloud.ts';

/**
 * Regression tests against payloads captured from a real `foxglove_bridge`
 * 3.6.3 / ROS 2 Humble session (see docs/m0/REPORT.md). These fixtures pin the
 * exact wire behaviour — encapsulation header, alignment, string NUL handling —
 * that a hand-built buffer could get wrong.
 */

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const readFixtureText = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('real captured Imu payload', () => {
  const fixture = 'imu_data.payload.bin';

  it('decodes a 324-byte CDR payload into the published values', () => {
    if (!existsSync(fixturePath(fixture))) {
      throw new Error(`missing fixture ${fixture}: re-run tools/m0-probe with --out to regenerate`);
    }
    const schema = parseMsgDefinitionText('sensor_msgs/msg/Imu', readFixtureText('imu.ros2msg.txt'));
    const payload = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url));
    expect(payload.byteLength).toBe(324);

    const { value, hadEncapsulationHeader, bytesRead } = decodeMessage(
      schema,
      'sensor_msgs/msg/Imu',
      new Uint8Array(payload),
    );

    // The 4-byte OMG CDR header must be detected, not decoded as data.
    expect(hadEncapsulationHeader).toBe(true);
    expect(bytesRead).toBe(324);

    const header = value['header'] as { stamp: { sec: number; nanosec: number }; frame_id: string };
    expect(header.frame_id).toBe('imu_link');
    expect(header.stamp.sec).toBeGreaterThan(1_700_000_000);
    expect(header.stamp.nanosec).toBeLessThan(1_000_000_000);

    const q = value['orientation'] as { x: number; y: number; z: number; w: number };
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBeCloseTo(-0.9829203910343837, 12);
    expect(q.w).toBeCloseTo(0.1840312606293132, 12);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);

    const av = value['angular_velocity'] as { x: number; y: number; z: number };
    expect(av.z).toBe(0.5);
    expect(Math.abs(av.x)).toBeLessThan(0.02);
    expect(Math.abs(av.y)).toBeLessThan(0.02);

    const la = value['linear_acceleration'] as { x: number; y: number; z: number };
    expect(la.z).toBe(9.80665);

    for (const key of [
      'orientation_covariance',
      'angular_velocity_covariance',
      'linear_acceleration_covariance',
    ]) {
      const covariance = value[key] as number[];
      expect(covariance).toHaveLength(9);
      expect(covariance[0]).toBeGreaterThan(0);
    }
  });
});

describe('real captured PointCloud2 payload', () => {
  const fixture = 'livox_lidar.payload.bin';

  it('decodes 20000 points with the expected geometry', () => {
    if (!existsSync(fixturePath(fixture))) {
      throw new Error(`missing fixture ${fixture}: re-run tools/m0-probe with --out to regenerate`);
    }
    const schema = parseMsgDefinitionText(
      'sensor_msgs/msg/PointCloud2',
      readFixtureText('pointcloud2.ros2msg.txt'),
    );
    const payload = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url));

    const cloud = decodePointCloud2(schema, new Uint8Array(payload));
    expect(cloud.frameId).toBe('livox_frame');
    expect(cloud.width).toBe(20_000);
    expect(cloud.height).toBe(1);
    expect(cloud.pointStep).toBe(16);
    expect(cloud.rowStep).toBe(320_000);
    expect(cloud.pointCount).toBe(20_000);
    expect(cloud.data.byteLength).toBe(320_000);
    expect(cloud.fields.map((f) => f.name)).toEqual(['x', 'y', 'z', 'intensity']);

    const positions = cloud.positions();
    expect(positions).not.toBeNull();
    expect(positions?.length).toBe(60_000);

    let minRadius = Number.POSITIVE_INFINITY;
    let maxRadius = 0;
    for (let i = 0; i < cloud.pointCount; i += 1) {
      const r = Math.hypot(
        positions?.[i * 3] as number,
        positions?.[i * 3 + 1] as number,
        positions?.[i * 3 + 2] as number,
      );
      if (r < minRadius) minRadius = r;
      if (r > maxRadius) maxRadius = r;
    }
    // The publisher emits a hemispherical shell between 8 m and 10 m.
    expect(minRadius).toBeGreaterThanOrEqual(8 - 1e-3);
    expect(maxRadius).toBeLessThanOrEqual(10 + 1e-3);

    const intensity = cloud.fieldValues('intensity');
    expect(intensity?.length).toBe(20_000);
    expect(Math.min(...(intensity as Float32Array))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...(intensity as Float32Array))).toBeLessThanOrEqual(200);
  });

  it('decodes the generic struct (header + layout) consistently with the fast path', () => {
    const schema = parseMsgDefinitionText(
      'sensor_msgs/msg/PointCloud2',
      readFixtureText('pointcloud2.ros2msg.txt'),
    );
    const payload = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url));
    const { value, hadEncapsulationHeader, bytesRead } = decodeMessage(
      schema,
      'sensor_msgs/msg/PointCloud2',
      new Uint8Array(payload),
    );

    expect(hadEncapsulationHeader).toBe(true);
    expect(bytesRead).toBe(payload.byteLength);
    expect(value['width']).toBe(20_000);
    expect(value['point_step']).toBe(16);
    expect(value['is_dense']).toBe(true);
    expect(value['is_bigendian']).toBe(false);
    const header = value['header'] as { frame_id: string; stamp: { sec: number; nanosec: number } };
    expect(header.frame_id).toBe('livox_frame');
    expect(header.stamp.sec).toBeGreaterThan(1_700_000_000);
    expect(header.stamp.nanosec).toBeGreaterThanOrEqual(0);
    expect(header.stamp.nanosec).toBeLessThan(1_000_000_000);
    // PointField[] is a nested message array: check one entry end to end.
    const fields = value['fields'] as { name: string; offset: number; datatype: number }[];
    expect(fields).toHaveLength(4);
    expect(fields[3]).toMatchObject({ name: 'intensity', offset: 12, datatype: 7 });
  });
});
