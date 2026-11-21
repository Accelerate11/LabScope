import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { MessageEnvelope } from '../../data-source/src/index';
import { decodeMessage, decodePointCloud2, parseMsgDefinitionText, type FieldType } from '../../ros-schema/src/index';
import { CdrWriter } from '../../ros-schema/test/helpers/cdr-writer';
import { SimulationDataSource } from '../src/index';

const captured = (name: string) => readFileSync(new URL('../../../docs/m0/artifacts/schemas/' + name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const separator = '================================================================================\n';
const imu = captured('imu_data.sensor_msgs_msg_Imu.ros2msg.txt');
const odom = captured('odom.nav_msgs_msg_Odometry.ros2msg.txt');
const withHeader = separator + imu.split(separator).filter((section) => /^MSG: (std_msgs\/Header|builtin_interfaces\/Time)\s/m.test(section)).join(separator);
const poseParts = odom.split(separator).filter((section) => /^MSG: geometry_msgs\/(Pose|Point|Quaternion)\s/m.test(section));
const poseStamped = 'std_msgs/Header header\nPose pose\n';
// Field declarations from ROS 2 Humble common_interfaces. Header and pose definitions come from M0 captures.
const info = [
  'std_msgs/Header header', 'uint32 height', 'uint32 width', 'string distortion_model',
  'float64[] d', 'float64[9] k', 'float64[9] r', 'float64[12] p', 'uint32 binning_x', 'uint32 binning_y',
  'RegionOfInterest roi', '', separator.trimEnd(), 'MSG: sensor_msgs/RegionOfInterest',
  'uint32 x_offset', 'uint32 y_offset', 'uint32 height', 'uint32 width', 'bool do_rectify', '',
].join('\n') + withHeader;
const schemas: Record<string, string> = {
  'sensor_msgs/msg/Imu': imu,
  'sensor_msgs/msg/PointCloud2': captured('livox_lidar.sensor_msgs_msg_PointCloud2.ros2msg.txt'),
  'sensor_msgs/msg/Image': captured('camera_color_image_raw.sensor_msgs_msg_Image.ros2msg.txt'),
  'sensor_msgs/msg/CameraInfo': info,
  'tf2_msgs/msg/TFMessage': captured('tf.tf2_msgs_msg_TFMessage.ros2msg.txt'),
  'nav_msgs/msg/Odometry': odom,
  'geometry_msgs/msg/PoseStamped': poseStamped + separator + poseParts.join(separator) + withHeader,
  'nav_msgs/msg/Path': 'std_msgs/Header header\ngeometry_msgs/PoseStamped[] poses\n' + separator +
    'MSG: geometry_msgs/PoseStamped\n' + poseStamped + separator + poseParts.join(separator) + withHeader,
};

function encode(typeName: string, message: unknown, schema: ReturnType<typeof parseMsgDefinitionText>): Uint8Array {
  const writer = new CdrWriter().encapsulationLittleEndian();
  function field(type: FieldType, value: unknown): void {
    if (type.kind === 'message') {
      struct(type.name, value);
      return;
    }
    switch (type.name) {
      case 'bool': expect(typeof value).toBe('boolean'); writer.u8(value ? 1 : 0); return;
      case 'string': expect(typeof value).toBe('string'); writer.string(value as string); return;
      case 'uint8': writer.u8(value as number); return;
      case 'uint32': writer.u32(value as number); return;
      case 'int32': writer.i32(value as number); return;
      case 'float64': writer.f64(value as number); return;
      default: throw new Error('test writer: unsupported ' + type.name);
    }
  }
  function struct(name: string, input: unknown): void {
    const definition = schema.definitions.get(name);
    expect(definition, name).toBeDefined();
    const record = input as Record<string, unknown>;
    const fields = definition!.fields.filter(({ isConstant }) => !isConstant);
    expect(Object.keys(record).sort()).toEqual(fields.map(({ name: key }) => key).sort());
    for (const entry of fields) {
      const value = record[entry.name];
      if (!entry.isArray) {
        field(entry.type, value);
        continue;
      }
      expect(Array.isArray(value) || value instanceof Uint8Array).toBe(true);
      const sequence = value as unknown[] | Uint8Array;
      if (entry.arrayLength === null) writer.u32(sequence.length);
      else expect(sequence.length).toBe(entry.arrayLength);
      if (sequence instanceof Uint8Array) {
        for (let i = 0; i < sequence.length; i += 8192) writer.raw(sequence.subarray(i, i + 8192));
      } else {
        for (const entryValue of sequence) field(entry.type, entryValue);
      }
    }
  }
  struct(typeName, message);
  return writer.toUint8Array();
}

it('round-trips all ten simulated topics through Humble layouts and the existing CDR decoder', () => {
  const frames = new Map<string, MessageEnvelope>();
  const source = new SimulationDataSource({
    setChannels() {}, reset() {},
    publish(frame) { frames.set(frame.topic, frame); },
  }, { cameraWidth: 48, cameraHeight: 32, scenario: 'obstacle-scene' });
  source.start();
  source.advance(200);
  expect(frames.size).toBe(10);
  for (const { schemaName, payload } of frames.values()) {
    const schema = parseMsgDefinitionText(schemaName, schemas[schemaName]!);
    const encoded = encode(schemaName, payload.value, schema);
    const decoded = decodeMessage(schema, schemaName, encoded);
    expect(decoded.value, schemaName).toEqual(payload.value);
    expect(decoded.bytesRead).toBe(encoded.length);
    if (schemaName === 'sensor_msgs/msg/PointCloud2') {
      const cloud = decodePointCloud2(schema, encoded);
      expect(cloud.positions()).toHaveLength(30_000);
      expect(cloud.fields.map(({ name }) => name)).toEqual(['x', 'y', 'z', 'intensity', 'rgb', 'ring']);
    }
  }
});
