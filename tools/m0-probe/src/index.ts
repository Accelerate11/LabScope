#!/usr/bin/env node
/**
 * LabScope M0 probe.
 *
 * Connects to a real `foxglove_bridge` over the Foxglove WebSocket protocol,
 * discovers topics from the live advertisement, subscribes, decodes the CDR
 * payloads with the advertised ROS 2 schemas, and validates the decoded values
 * against properties the publishing nodes guarantee (unit quaternion, known
 * angular velocity, known point-cloud geometry).
 *
 * This is deliberately *not* a mock: it talks to whatever bridge `--url`
 * points at and fails loudly if a single payload cannot be decoded.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FoxgloveClient, type Channel, type MessageDataEvent } from '@labscope/ros-protocol';
import {
  decodeMessage,
  decodePointCloud2,
  rosTimeToSeconds,
  type DecodedPointCloud2,
  type MsgSchema,
  type RosTime,
} from '@labscope/ros-schema';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  url: string;
  topics: string[] | null;
  seconds: number;
  outDir: string | null;
  reconnectWatch: boolean;
  label: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: 'ws://127.0.0.1:8765',
    topics: null,
    seconds: 15,
    outDir: null,
    reconnectWatch: false,
    label: 'probe',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--url':
        options.url = next();
        break;
      case '--topics':
        options.topics = next()
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        break;
      case '--seconds':
        options.seconds = Number(next());
        break;
      case '--out':
        options.outDir = next();
        break;
      case '--reconnect-watch':
        options.reconnectWatch = true;
        break;
      case '--label':
        options.label = next();
        break;
      case '--help':
        console.log(
          'usage: m0-probe [--url ws://host:8765] [--topics a,b] [--seconds N] [--out DIR] [--reconnect-watch] [--label NAME]',
        );
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Reporting types
// ---------------------------------------------------------------------------

interface Assertion {
  name: string;
  ok: boolean;
  detail: string;
}

interface TopicStats {
  topic: string;
  channelId: number;
  schemaName: string;
  encoding: string;
  schemaEncoding: string;
  count: number;
  bytes: number;
  decodeErrors: number;
  decodeErrorSamples: string[];
  firstLogTimeNs: string | null;
  lastLogTimeNs: string | null;
  rateHz: number | null;
  meanDecodeUs: number | null;
  maxDecodeUs: number | null;
  sample: Record<string, unknown> | null;
  assertions: Assertion[];
}

interface TimelineEntry {
  at: string;
  kind: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round = (value: number, digits = 6): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function summarizeHeader(value: Record<string, unknown>): { stamp?: RosTime; frameId?: string } {
  const header = value['header'] as { stamp?: RosTime; frame_id?: string } | undefined;
  if (header === undefined) return {};
  return {
    ...(header.stamp === undefined ? {} : { stamp: header.stamp }),
    ...(header.frame_id === undefined ? {} : { frameId: header.frame_id }),
  };
}

// ---------------------------------------------------------------------------
// Per-message-type validation
// ---------------------------------------------------------------------------

interface ImuSample {
  stamp: number;
  yaw: number;
}

function checkImu(
  value: Record<string, unknown>,
  state: { previous: ImuSample | null; yawRates: number[] },
  assertions: Assertion[],
): Record<string, unknown> {
  const header = summarizeHeader(value);
  const q = value['orientation'] as { x: number; y: number; z: number; w: number };
  const av = value['angular_velocity'] as { x: number; y: number; z: number };
  const la = value['linear_acceleration'] as { x: number; y: number; z: number };
  const cov = value['orientation_covariance'] as number[];

  const norm = Math.hypot(q.x, q.y, q.z, q.w);
  const yaw = 2 * Math.atan2(q.z, q.w);
  const stamp = header.stamp === undefined ? 0 : rosTimeToSeconds(header.stamp);

  // Yaw rate continuity: the publisher spins at a constant 0.5 rad/s.
  if (state.previous !== null) {
    let dYaw = yaw - state.previous.yaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    const dt = stamp - state.previous.stamp;
    if (dt > 1e-4 && dt < 1) state.yawRates.push(dYaw / dt);
  }
  state.previous = { stamp, yaw };

  if (assertions.length === 0) {
    assertions.push({
      name: 'imu.frame_id == "imu_link"',
      ok: header.frameId === 'imu_link',
      detail: `frame_id=${JSON.stringify(header.frameId)}`,
    });
    assertions.push({
      name: 'imu.orientation is unit length (|q|-1 < 1e-6)',
      ok: Math.abs(norm - 1) < 1e-6,
      detail: `|q|-1 = ${round(norm - 1, 12)}`,
    });
    assertions.push({
      name: 'imu.angular_velocity.z == 0.5 rad/s',
      ok: Math.abs(av.z - 0.5) < 1e-9,
      detail: `z = ${av.z}`,
    });
    assertions.push({
      name: 'imu.linear_acceleration.z == 9.80665 m/s^2',
      ok: Math.abs(la.z - 9.80665) < 1e-9,
      detail: `z = ${la.z}`,
    });
    assertions.push({
      name: 'imu.orientation_covariance is float64[9]',
      ok: Array.isArray(cov) && cov.length === 9 && typeof cov[0] === 'number',
      detail: `length=${Array.isArray(cov) ? cov.length : 'n/a'}`,
    });
  }

  return {
    frameId: header.frameId,
    stamp,
    orientation: { x: q.x, y: q.y, z: q.z, w: q.w },
    norm: round(norm, 9),
    angularVelocity: { x: round(av.x, 6), y: round(av.y, 6), z: av.z },
    linearAcceleration: { x: la.x, y: la.y, z: la.z },
  };
}

function checkPointCloud(
  cloud: DecodedPointCloud2,
  assertions: Assertion[],
): Record<string, unknown> {
  const positions = cloud.positions();
  let radiusMin = Number.POSITIVE_INFINITY;
  let radiusMax = Number.NEGATIVE_INFINITY;
  if (positions !== null) {
    for (let i = 0; i < cloud.pointCount; i += 1) {
      const x = positions[i * 3] as number;
      const y = positions[i * 3 + 1] as number;
      const z = positions[i * 3 + 2] as number;
      const r = Math.hypot(x, y, z);
      if (r < radiusMin) radiusMin = r;
      if (r > radiusMax) radiusMax = r;
    }
  }
  const intensity = cloud.fieldValues('intensity');

  if (assertions.length === 0) {
    assertions.push({
      name: 'pointcloud.frame_id == "livox_frame"',
      ok: cloud.frameId === 'livox_frame',
      detail: `frame_id=${JSON.stringify(cloud.frameId)}`,
    });
    assertions.push({
      name: 'pointcloud.point_count == 20000',
      ok: cloud.pointCount === 20000,
      detail: `width=${cloud.width} height=${cloud.height} pointStep=${cloud.pointStep}`,
    });
    assertions.push({
      name: 'pointcloud.positions decoded to Float32Array',
      ok: positions !== null && positions.length === cloud.pointCount * 3,
      detail: positions === null ? 'positions() returned null' : `floats=${positions.length}`,
    });
    assertions.push({
      name: 'pointcloud radius within [8, 10] m',
      ok: radiusMin >= 8 && radiusMax <= 10,
      detail: `min=${round(radiusMin, 4)} max=${round(radiusMax, 4)}`,
    });
    assertions.push({
      name: 'pointcloud.intensity field decodable',
      ok: intensity !== null && intensity.length === cloud.pointCount,
      detail: intensity === null ? 'no intensity field' : `values=${intensity.length}`,
    });
  }

  return {
    frameId: cloud.frameId,
    stamp: rosTimeToSeconds(cloud.stamp),
    width: cloud.width,
    height: cloud.height,
    pointCount: cloud.pointCount,
    pointStep: cloud.pointStep,
    rowStep: cloud.rowStep,
    isDense: cloud.isDense,
    fields: cloud.fields,
    dataBytes: cloud.data.byteLength,
    radiusMin: round(radiusMin, 4),
    radiusMax: round(radiusMax, 4),
    firstPoints:
      positions === null
        ? null
        : Array.from({ length: Math.min(3, cloud.pointCount) }, (_, i) => [
            round(positions[i * 3] as number, 4),
            round(positions[i * 3 + 1] as number, 4),
            round(positions[i * 3 + 2] as number, 4),
          ]),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const timeline: TimelineEntry[] = [];
  const startedAt = new Date();
  const record = (kind: string, detail: string): void => {
    timeline.push({ at: new Date().toISOString(), kind, detail });
    console.log(`[${kind}] ${detail}`);
  };

  const client = new FoxgloveClient({
    url: options.url,
    reconnect: { initialDelayMs: 300, maxDelayMs: 3_000, jitterMs: 100 },
  });

  const statsByTopic = new Map<string, TopicStats>();
  const schemaByChannel = new Map<number, MsgSchema>();
  const imuState = new Map<string, { previous: ImuSample | null; yawRates: number[] }>();
  const assertionsByTopic = new Map<string, Assertion[]>();
  const samplesSaved = new Map<string, Record<string, unknown>>();

  client.on('stateChange', ({ state, reason }) => {
    record('state', `${state}${reason === undefined ? '' : ` (${reason})`}`);
  });
  client.on('error', (error) => {
    record('clientError', error.message);
  });
  client.on('status', (status) => {
    record('serverStatus', `level=${status.level} ${status.message}`);
  });

  client.on('message', (message: MessageDataEvent) => {
    let stats = statsByTopic.get(message.topic);
    if (stats === undefined) {
      const channel = client.channels.find((c) => c.id === message.channelId);
      stats = {
        topic: message.topic,
        channelId: message.channelId,
        schemaName: message.schemaName,
        encoding: channel?.encoding ?? 'unknown',
        schemaEncoding: channel?.schemaEncoding ?? 'unknown',
        count: 0,
        bytes: 0,
        decodeErrors: 0,
        decodeErrorSamples: [],
        firstLogTimeNs: null,
        lastLogTimeNs: null,
        rateHz: null,
        meanDecodeUs: null,
        maxDecodeUs: null,
        sample: null,
        assertions: [],
      };
      statsByTopic.set(message.topic, stats);
    }

    stats.count += 1;
    stats.bytes += message.payload.byteLength;
    stats.firstLogTimeNs ??= message.logTime.toString();
    stats.lastLogTimeNs = message.logTime.toString();

    const assertions = assertionsByTopic.get(message.topic) ?? [];
    assertionsByTopic.set(message.topic, assertions);

    const decodeStart = performance.now();
    try {
      let schema = schemaByChannel.get(message.channelId);
      if (schema === undefined) {
        const parsed = client.getSchema(message.channelId);
        if (parsed === null) {
          throw new Error(`no parsable ros2msg schema for channel ${message.channelId}`);
        }
        schema = parsed;
        schemaByChannel.set(message.channelId, schema);
      }

      if (message.schemaName === 'sensor_msgs/msg/PointCloud2') {
        const cloud = decodePointCloud2(schema, message.payload);
        if (stats.sample === null) {
          stats.sample = checkPointCloud(cloud, assertions);
          samplesSaved.set(message.topic, {
            encoding: message.encoding,
            schemaEncoding: message.schemaEncoding,
            schemaName: message.schemaName,
            payloadBase64: Buffer.from(message.payload).toString('base64'),
          });
        }
      } else {
        const { value, hadEncapsulationHeader } = decodeMessage(schema, message.schemaName, message.payload, {
          encapsulation: 'auto',
        });
        if (stats.sample === null) {
          if (message.schemaName === 'sensor_msgs/msg/Imu') {
            let state = imuState.get(message.topic);
            if (state === undefined) {
              state = { previous: null, yawRates: [] };
              imuState.set(message.topic, state);
            }
            stats.sample = {
              ...checkImu(value, state, assertions),
              hadEncapsulationHeader,
              payloadBytes: message.payload.byteLength,
            };
            samplesSaved.set(message.topic, {
              encoding: message.encoding,
              schemaEncoding: message.schemaEncoding,
              schemaName: message.schemaName,
              payloadBase64: Buffer.from(message.payload).toString('base64'),
            });
          } else {
            const header = summarizeHeader(value);
            stats.sample = {
              schemaName: message.schemaName,
              frameId: header.frameId,
              stamp: header.stamp === undefined ? undefined : rosTimeToSeconds(header.stamp),
              topLevelFields: Object.keys(value),
              payloadBytes: message.payload.byteLength,
            };
          }
        } else if (message.schemaName === 'sensor_msgs/msg/Imu') {
          // Keep feeding the yaw-rate estimator after the first sample.
          const state = imuState.get(message.topic);
          if (state !== undefined) checkImu(value, state, assertions);
        }
      }
    } catch (error) {
      stats.decodeErrors += 1;
      if (stats.decodeErrorSamples.length < 3) {
        stats.decodeErrorSamples.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    } finally {
      const elapsedUs = (performance.now() - decodeStart) * 1000;
      stats.meanDecodeUs = stats.meanDecodeUs === null ? elapsedUs : stats.meanDecodeUs + elapsedUs;
      stats.maxDecodeUs = stats.maxDecodeUs === null ? elapsedUs : Math.max(stats.maxDecodeUs, elapsedUs);
    }
  });

  const connectStart = performance.now();
  await client.connect();
  await client.waitForServerInfo(5_000);
  const connectMs = performance.now() - connectStart;
  const channelList: Channel[] = await client.waitForChannels(5_000);
  // Give the bridge a moment to flush the rest of the advertisements.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const channels = client.channels;
  record('connected', `subprotocol=${client.subprotocol} channels=${channels.length} connectMs=${Math.round(connectMs)}`);

  const subscribeTopics =
    options.topics ?? channels.filter((c) => !c.topic.includes('sysinfo')).map((c) => c.topic);
  for (const topic of subscribeTopics) {
    client.subscribe(topic);
  }
  record('subscribed', subscribeTopics.join(', '));

  await new Promise((resolve) => setTimeout(resolve, options.seconds * 1000));

  const elapsedSeconds = options.seconds;
  client.close('probe finished');

  // ---- finalize stats -----------------------------------------------------
  const topicStats: TopicStats[] = [];
  for (const [topic, stats] of statsByTopic) {
    const first = stats.firstLogTimeNs === null ? null : Number(stats.firstLogTimeNs) / 1e9;
    const last = stats.lastLogTimeNs === null ? null : Number(stats.lastLogTimeNs) / 1e9;
    if (first !== null && last !== null && last > first) {
      stats.rateHz = round((stats.count - 1) / (last - first), 3);
    } else {
      stats.rateHz = round(stats.count / elapsedSeconds, 3);
    }
    if (stats.meanDecodeUs !== null) {
      stats.meanDecodeUs = round(stats.meanDecodeUs / Math.max(1, stats.count), 2);
    }
    if (stats.maxDecodeUs !== null) stats.maxDecodeUs = round(stats.maxDecodeUs, 2);
    stats.assertions = assertionsByTopic.get(topic) ?? [];
    topicStats.push(stats);
  }
  topicStats.sort((a, b) => a.topic.localeCompare(b.topic));

  // Yaw-rate continuity is only meaningful with enough samples.
  for (const [topic, state] of imuState) {
    const stats = topicStats.find((s) => s.topic === topic);
    if (stats === undefined) continue;
    const rates = state.yawRates;
    if (rates.length > 10) {
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      const maxDeviation = Math.max(...rates.map((r) => Math.abs(r - mean)));
      stats.assertions.push({
        name: 'imu yaw rate from quaternion ~= 0.5 rad/s',
        ok: Math.abs(mean - 0.5) < 0.01,
        detail: `samples=${rates.length} mean=${round(mean, 6)} rad/s maxDeviation=${round(maxDeviation, 6)}`,
      });
    }
  }

  const requiredTopics = ['/imu/data', '/livox/lidar'];
  const missingRequired = requiredTopics.filter((t) => !topicStats.some((s) => s.topic === t));
  const allAssertions = topicStats.flatMap((s) => s.assertions);
  const failedAssertions = allAssertions.filter((a) => !a.ok);
  const totalDecodeErrors = topicStats.reduce((sum, s) => sum + s.decodeErrors, 0);
  const passed =
    missingRequired.length === 0 &&
    failedAssertions.length === 0 &&
    totalDecodeErrors === 0 &&
    allAssertions.length > 0;

  const result = {
    label: options.label,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    url: options.url,
    subprotocol: client.subprotocol,
    serverInfo: client.serverInfo,
    connectMs: round(connectMs, 2),
    durationSeconds: elapsedSeconds,
    channelCount: channels.length,
    channels: channels.map((c) => ({
      id: c.id,
      topic: c.topic,
      encoding: c.encoding,
      schemaEncoding: c.schemaEncoding,
      schemaName: c.schemaName,
      schemaBytes: c.schema.length,
    })),
    subscribedTopics: subscribeTopics,
    clientStats: { ...client.stats },
    topicStats,
    timeline,
    missingRequiredTopics: missingRequired,
    failedAssertions,
    passed,
  };

  if (options.outDir !== null) {
    mkdirSync(options.outDir, { recursive: true });
    const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
    const jsonPath = join(options.outDir, `${options.label}-${stamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\nwrote ${jsonPath}`);
    if (samplesSaved.size > 0) {
      const samplesDir = join(options.outDir, 'samples');
      mkdirSync(samplesDir, { recursive: true });
      writeFileSync(
        join(samplesDir, 'manifest.json'),
        JSON.stringify(Object.fromEntries(samplesSaved), null, 2),
        'utf8',
      );
      console.log(`wrote ${join(samplesDir, 'manifest.json')} (${samplesSaved.size} raw payloads)`);
    }
  }

  // ---- console summary ----------------------------------------------------
  console.log('\n=== channels ===');
  for (const channel of channels) {
    console.log(
      `  ${String(channel.id).padStart(2)} ${channel.topic.padEnd(28)} ${channel.encoding.padEnd(5)} ${channel.schemaName}`,
    );
  }
  console.log('\n=== decoded traffic ===');
  for (const stats of topicStats) {
    console.log(
      `  ${stats.topic.padEnd(28)} n=${String(stats.count).padStart(6)} ` +
        `rate=${String(stats.rateHz).padStart(8)}Hz bytes=${String(stats.bytes).padStart(10)} ` +
        `meanDecode=${String(stats.meanDecodeUs).padStart(8)}us errors=${stats.decodeErrors}`,
    );
  }
  console.log('\n=== assertions ===');
  for (const stats of topicStats) {
    for (const assertion of stats.assertions) {
      console.log(`  [${assertion.ok ? 'PASS' : 'FAIL'}] ${stats.topic} :: ${assertion.name} — ${assertion.detail}`);
    }
  }
  console.log(`\nM0 probe ${passed ? 'PASSED' : 'FAILED'}`);
  if (missingRequired.length > 0) console.log(`  missing required topics: ${missingRequired.join(', ')}`);
  return passed ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('[fatal]', error);
    process.exitCode = 2;
  });
