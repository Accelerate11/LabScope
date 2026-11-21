import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  normalizeMessageType,
  parseMsgDefinitionBody,
  parseMsgDefinitionText,
  SchemaParseError,
} from '../src/msgdef.ts';

const readFixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseMsgDefinitionText (real foxglove_bridge schemas)', () => {
  it('parses the advertised sensor_msgs/msg/Imu schema', () => {
    const schema = parseMsgDefinitionText('sensor_msgs/msg/Imu', readFixture('imu.ros2msg.txt'));

    expect(schema.rootType).toBe('sensor_msgs/msg/Imu');
    expect([...schema.definitions.keys()].sort()).toEqual([
      'builtin_interfaces/msg/Time',
      'geometry_msgs/msg/Quaternion',
      'geometry_msgs/msg/Vector3',
      'sensor_msgs/msg/Imu',
      'std_msgs/msg/Header',
    ]);

    const imu = schema.definitions.get('sensor_msgs/msg/Imu');
    expect(imu?.fields.map((f) => f.name)).toEqual([
      'header',
      'orientation',
      'orientation_covariance',
      'angular_velocity',
      'angular_velocity_covariance',
      'linear_acceleration',
      'linear_acceleration_covariance',
    ]);

    const covariance = imu?.fields.find((f) => f.name === 'orientation_covariance');
    expect(covariance?.isArray).toBe(true);
    expect(covariance?.arrayLength).toBe(9);
    expect(covariance?.type).toEqual({ kind: 'primitive', name: 'float64' });

    const orientation = imu?.fields.find((f) => f.name === 'orientation');
    expect(orientation?.type).toEqual({ kind: 'message', name: 'geometry_msgs/msg/Quaternion' });
  });

  it('keeps IDL-style defaults separate from constants', () => {
    const schema = parseMsgDefinitionText('sensor_msgs/msg/Imu', readFixture('imu.ros2msg.txt'));
    const quaternion = schema.definitions.get('geometry_msgs/msg/Quaternion');

    expect(quaternion?.fields.map((f) => [f.name, f.defaultValue, f.isConstant])).toEqual([
      ['x', '0', false],
      ['y', '0', false],
      ['z', '0', false],
      ['w', '1', false],
    ]);
  });

  it('parses the advertised PointCloud2 schema including nested PointField[]', () => {
    const schema = parseMsgDefinitionText(
      'sensor_msgs/msg/PointCloud2',
      readFixture('pointcloud2.ros2msg.txt'),
    );
    const cloud = schema.definitions.get('sensor_msgs/msg/PointCloud2');
    expect(cloud?.fields.find((f) => f.name === 'data')).toMatchObject({
      isArray: true,
      arrayLength: null,
      type: { kind: 'primitive', name: 'uint8' },
    });
    const fields = cloud?.fields.find((f) => f.name === 'fields');
    expect(fields?.isArray).toBe(true);
    expect(fields?.type).toEqual({ kind: 'message', name: 'sensor_msgs/msg/PointField' });

    const pointField = schema.definitions.get('sensor_msgs/msg/PointField');
    expect(pointField?.fields.filter((f) => !f.isConstant).map((f) => f.name)).toEqual([
      'name',
      'offset',
      'datatype',
      'count',
    ]);
    // The real schema also declares the datatype enum as constants.
    expect(pointField?.fields.filter((f) => f.isConstant).map((f) => f.name)).toContain('FLOAT32');
  });

  it('parses nested fixed arrays in Odometry covariance fields', () => {
    const schema = parseMsgDefinitionText('nav_msgs/msg/Odometry', readFixture('odometry.ros2msg.txt'));
    const odom = schema.definitions.get('nav_msgs/msg/Odometry');
    expect(odom?.fields.find((f) => f.name === 'pose')?.type).toEqual({
      kind: 'message',
      name: 'geometry_msgs/msg/PoseWithCovariance',
    });
    const poseWithCovariance = schema.definitions.get('geometry_msgs/msg/PoseWithCovariance');
    expect(poseWithCovariance?.fields.find((f) => f.name === 'covariance')?.arrayLength).toBe(36);
  });
});

describe('parseMsgDefinitionBody', () => {
  it('handles constants, bounded and unbounded arrays, and package-relative types', () => {
    const definition = parseMsgDefinitionBody(
      'example_msgs/msg/Demo',
      [
        '# comment',
        'uint8 STATUS_OK=0',
        'string NAME = hello world',
        'float64[] unbounded',
        'float32[3] fixed',
        'string<=16 bounded_string',
        'float64[<=5] bounded_array',
        'Header local_header',
        'geometry_msgs/Point[2] points',
      ].join('\n'),
    );

    expect(definition.fields.map((f) => f.name)).toEqual([
      'STATUS_OK',
      'NAME',
      'unbounded',
      'fixed',
      'bounded_string',
      'bounded_array',
      'local_header',
      'points',
    ]);

    const byName = new Map(definition.fields.map((f) => [f.name, f]));
    expect(byName.get('STATUS_OK')).toMatchObject({ isConstant: true, constantValue: '0' });
    expect(byName.get('NAME')).toMatchObject({ isConstant: true, constantValue: 'hello world' });
    expect(byName.get('unbounded')).toMatchObject({ isArray: true, arrayLength: null });
    expect(byName.get('fixed')).toMatchObject({ isArray: true, arrayLength: 3 });
    expect(byName.get('bounded_string')).toMatchObject({
      isArray: false,
      upperBound: 16,
      type: { kind: 'primitive', name: 'string' },
    });
    expect(byName.get('bounded_array')).toMatchObject({
      isArray: true,
      arrayLength: null,
      upperBound: 5,
    });
    expect(byName.get('local_header')?.type).toEqual({
      kind: 'message',
      name: 'example_msgs/msg/Header',
    });
    expect(byName.get('points')?.type).toEqual({ kind: 'message', name: 'geometry_msgs/msg/Point' });
  });

  it('rejects duplicate fields', () => {
    expect(() => parseMsgDefinitionBody('a/msg/B', 'int32 x\nint32 x')).toThrow(SchemaParseError);
  });

  it('rejects unparsable declarations', () => {
    expect(() => parseMsgDefinitionBody('a/msg/B', 'int32 x\nthis is not a field !!')).toThrow(
      SchemaParseError,
    );
  });
});

describe('normalizeMessageType', () => {
  it('resolves bare, two-part and three-part names', () => {
    expect(normalizeMessageType('Header', 'std_msgs')).toBe('std_msgs/msg/Header');
    expect(normalizeMessageType('std_msgs/Header', 'x')).toBe('std_msgs/msg/Header');
    expect(normalizeMessageType('std_msgs/msg/Header', 'x')).toBe('std_msgs/msg/Header');
  });
});
