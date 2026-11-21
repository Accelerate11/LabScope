import { McapWriter, type McapWriterOptions } from '@mcap/core';
import { parseMsgDefinitionText, type FieldType } from '@labscope/ros-schema';
import { SimulationDataSource } from '@labscope/simulation-engine';
import type { MessageEnvelope } from '@labscope/data-source';
import { CdrWriter } from '../../../packages/ros-schema/test/helpers/cdr-writer';
import cloud from '../../../docs/m0/artifacts/schemas/livox_lidar.sensor_msgs_msg_PointCloud2.ros2msg.txt?raw';
import tf from '../../../docs/m0/artifacts/schemas/tf.tf2_msgs_msg_TFMessage.ros2msg.txt?raw';
import odom from '../../../docs/m0/artifacts/schemas/odom.nav_msgs_msg_Odometry.ros2msg.txt?raw';
import imu from '../../../docs/m0/artifacts/schemas/imu_data.sensor_msgs_msg_Imu.ros2msg.txt?raw';

const sep = '================================================================================\n';
const header = sep + imu.split(sep).filter((entry) => /^MSG: (std_msgs\/Header|builtin_interfaces\/Time)\s/m.test(entry)).join(sep);
const pose = odom.split(sep).filter((entry) => /^MSG: geometry_msgs\/(Pose|Point|Quaternion)\s/m.test(entry)).join(sep);
const poseStamped = 'std_msgs/Header header\nPose pose\n';
const marker = 'std_msgs/Header header\nstring ns\nint32 id\nint32 type\nint32 action\ngeometry_msgs/Pose pose\n' +
  'geometry_msgs/Vector3 scale\nstd_msgs/ColorRGBA color\nbuiltin_interfaces/Duration lifetime\nbool frame_locked\n' +
  'geometry_msgs/Point[] points\nstd_msgs/ColorRGBA[] colors\nstring text\nstring mesh_resource\nbool mesh_use_embedded_materials\n';
const markerArray = 'Marker[] markers\n' + sep + 'MSG: visualization_msgs/Marker\n' + marker + sep + pose + header +
  sep + 'MSG: geometry_msgs/Vector3\nfloat64 x\nfloat64 y\nfloat64 z\n' +
  sep + 'MSG: std_msgs/ColorRGBA\nfloat32 r\nfloat32 g\nfloat32 b\nfloat32 a\n' +
  sep + 'MSG: builtin_interfaces/Duration\nint32 sec\nuint32 nanosec\n';

const text: Record<string, string> = {
  'sensor_msgs/msg/PointCloud2': cloud,
  'tf2_msgs/msg/TFMessage': tf,
  'nav_msgs/msg/Odometry': odom,
  'geometry_msgs/msg/PoseStamped': poseStamped + sep + pose + header,
  'nav_msgs/msg/Path': 'std_msgs/Header header\ngeometry_msgs/PoseStamped[] poses\n' + sep +
    'MSG: geometry_msgs/PoseStamped\n' + poseStamped + sep + pose + header,
  'visualization_msgs/msg/MarkerArray': markerArray,
};

function encode(name: string, value: unknown, schema: ReturnType<typeof parseMsgDefinitionText>): Uint8Array {
  const w = new CdrWriter().encapsulationLittleEndian();
  function field(type: FieldType, value: unknown): void {
    if (type.kind === 'message') return structure(type.name, value);
    const numeric = value as number;
    switch (type.name) {
      case 'bool': w.u8(value ? 1 : 0); break;
      case 'string': w.string(value as string); break;
      case 'uint8': w.u8(numeric); break;
      case 'uint32': w.u32(numeric); break;
      case 'int32': w.i32(numeric); break;
      case 'float32': w.f32(numeric); break;
      case 'float64': w.f64(numeric); break;
      default: throw new Error('fixture field ' + type.name);
    }
  }
  function structure(name: string, value: unknown): void {
    const description = schema.definitions.get(name);
    if (!description || !value) throw new Error('fixture missing ' + name);
    const record = value as Record<string, unknown>;
    for (const entry of description.fields) {
      if (entry.isConstant) continue;
      if (!entry.isArray) { field(entry.type, record[entry.name]); continue; }
      const values = record[entry.name] as unknown[] | Uint8Array;
      if (entry.arrayLength === null) w.u32(values.length);
      if (values instanceof Uint8Array) {
        for (let i = 0; i < values.length; i += 8192) w.raw(values.subarray(i, i + 8192));
      } else {
        for (const item of values) field(entry.type, item);
      }
    }
  }
  structure(name, value);
  return w.toUint8Array();
}

export async function makeVisualizationMcap(compressChunk?: McapWriterOptions['compressChunk']): Promise<Blob> {
  const chunks: BlobPart[] = [];
  let position = 0n;
  const writer = new McapWriter({ useChunks: true, chunkSize: 512 * 1024, compressChunk,
    writable: { position: () => position, async write(buffer) {
      position += BigInt(buffer.length);
      chunks.push(new Uint8Array(buffer));
    } } });
  await writer.start({ library: 'LabScope synthetic fixture', profile: 'ros2' });
  const frames: MessageEnvelope[] = [];
  const source = new SimulationDataSource({
    setChannels() {}, reset() {}, hasSubscribers(_source, topic) { return !topic.startsWith('/camera') && topic !== '/imu/data'; },
    publish(frame) { frames.push(frame); },
  }, { scenario: 'moving-robot', seed: 42, markers: true });
  source.start();
  source.advance(1000);
  const definitions = new Map<string, ReturnType<typeof parseMsgDefinitionText>>();
  const topics = new Map<string, number>();
  for (const { topic, schemaName, sequence, logTimeNs, payload } of frames) {
    let channel = topics.get(topic);
    let definition = definitions.get(schemaName);
    if (!definition) {
      definition = parseMsgDefinitionText(schemaName, text[schemaName]!);
      definitions.set(schemaName, definition);
    }
    if (channel === undefined) {
      const schemaId = await writer.registerSchema({ name: schemaName, encoding: 'ros2msg', data: new TextEncoder().encode(text[schemaName]!) });
      channel = await writer.registerChannel({ topic, schemaId, metadata: new Map(), messageEncoding: 'cdr' });
      topics.set(topic, channel);
    }
    const time = BigInt(logTimeNs!);
    await writer.addMessage({ channelId: channel, sequence, logTime: time, publishTime: time,
      data: encode(schemaName, payload.value, definition) });
  }
  await writer.end();
  return new Blob(chunks);
}
