/**
 * Data worker: owns the ROS 2 WebSocket connection, everything that touches
 * encoded bytes, and all per-topic counters.
 *
 * Why a worker thread: a 10 Hz / 20k-point cloud plus a camera stream is several
 * MB/s of CDR payloads. Running that in the main process would compete with
 * window and IPC handling; running it in the renderer would fight the UI for the
 * same event loop. Throttled previews and panel-requested PointCloud2 samples
 * cross the thread boundary.
 */

import { parentPort } from 'node:worker_threads';

import { FoxgloveClient, type Channel, type MessageDataEvent } from '@labscope/ros-protocol';
import { decodeMessage, parsePointCloud2, type PointCloud2Layout, type MsgSchema } from '@labscope/ros-schema';

import type { RecordingWorkerRequest, WorkerEvent, WorkerRequest } from '../shared/api';
import { spatialSchemaNames, spatialSchemas } from '../shared/spatial-schemas';
import type {
  ChannelSummary,
  LogEntry,
  SessionState,
  SessionStatus,
  TelemetryPayload,
  TopicTelemetry,
  RecordingChannelEvent,
} from '../shared/types';

const TELEMETRY_INTERVAL_MS = 300;
const SAMPLE_DECODE_INTERVAL_MS = 250;
const RATE_WINDOW_MS = 2_000;
const VISUAL_FRAME_MAX_BYTES = 2 * 1024 * 1024;
const VISUAL_BATCH_MAX_BYTES = 8 * 1024 * 1024;

interface TopicRuntime {
  channelId: number;
  schemaName: string;
  encoding: string;
  count: number;
  bytes: number;
  lastLogTimeNs: bigint | null;
  lastReceiveAt: number | null;
  lastSampleAt: number;
  sample?: unknown;
  sampleSequence?: number;
  sampleLogTimeNs?: string;
  pointCloud?: PointCloud2Layout['message'];
  publishedCloudSequence?: number;
  spatialFrames?: (NonNullable<TopicTelemetry['spatialFrames']>[number] & { bytes: number })[];
  spatialBytes?: number;
  decodeErrors: number;
  window: { at: number; count: number }[];
}

const port = parentPort;
if (port === null) throw new Error('data worker must run as a worker thread');

let client: FoxgloveClient | null = null;
let status: SessionStatus = emptyStatus();
let startedAt = Date.now();
let telemetryTimer: ReturnType<typeof setInterval> | null = null;

const topics = new Map<string, TopicRuntime>();
const schemas = new Map<number, MsgSchema | null>();
const subscribed = new Set<string>();
const manualTopics = new Set<string>();
let panelTopics: string[] = [];
let recordingTopics = new Set<string>();
let recordingSchemaSent = new Set<number>();
let sampleSequence = 0;
let connectAttempt = 0;
let reconnects = 0;
/** Serializes worker commands: connect/disconnect must never interleave. */
let commandQueue: Promise<void> = Promise.resolve();

function emptyStatus(): SessionStatus {
  return { state: 'idle', channels: [], subscribed: [], connectAttempt: 0, reconnects: 0 };
}

function post(event: WorkerEvent): void {
  port!.postMessage(event);
}

function announceRecordingChannels(): void {
  if (!recordingTopics.size || !client) return;
  for (const channel of client.channels) {
    if (!recordingTopics.has(channel.topic) || recordingSchemaSent.has(channel.id)) continue;
    recordingSchemaSent.add(channel.id);
    const entry: RecordingChannelEvent = { topic: channel.topic, schemaName: channel.schemaName, schema: channel.schema, channelId: channel.id };
    post({ type: 'recording-channel', channel: entry });
  }
}

function log(level: LogEntry['level'], message: string): void {
  post({ type: 'log', entry: { level, message, at: Date.now() } });
}

function publishStatus(patch: Partial<SessionStatus> = {}): void {
  status = { ...status, ...patch, subscribed: [...subscribed] };
  post({ type: 'status', status });
}

function setState(state: SessionState, error?: string): void {
  publishStatus({ state, ...(error === undefined ? {} : { error }) });
}

function summarizeChannels(channels: readonly Channel[]): ChannelSummary[] {
  return channels
    .map((channel) => ({
      id: channel.id,
      topic: channel.topic,
      schemaName: channel.schemaName,
      encoding: channel.encoding,
      schemaEncoding: channel.schemaEncoding,
      schemaBytes: channel.schema.length,
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

/**
 * Convert a decoded message into a bounded, JSON-safe preview. Image and point
 * cloud payloads are represented by their byte length, never by their contents.
 */
function summarize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '…';
  if (value === null || value === undefined) return value;
  if (value instanceof Uint8Array) return { __bytes: value.byteLength };
  if (Array.isArray(value)) {
    const preview = value.slice(0, 12).map((item) => summarize(item, depth + 1));
    if (value.length > preview.length) {
      return { __array: value.length, preview, truncated: value.length - preview.length };
    }
    return preview;
  }
  switch (typeof value) {
    case 'bigint':
      return value.toString();
    case 'number':
      return Number.isInteger(value) ? value : Math.round(value * 1e6) / 1e6;
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = summarize(item, depth + 1);
      }
      return out;
    }
    default:
      return value;
  }
}

function summarizePointCloud(cloud: PointCloud2Layout): unknown {
  const { header, width, height, point_step, is_dense, fields, data } = cloud.message;
  const x = cloud.scalar('x'), y = cloud.scalar('y'), z = cloud.scalar('z');
  const firstPoints = x && y && z ? [] as number[] : null;
  if (firstPoints && x && y && z) {
    for (let index = 0; index < Math.min(cloud.pointCount, 2); index++) {
      const base = cloud.byteOffset(index);
      firstPoints.push(...[x(base), y(base), z(base)].map((value) => Math.round(value * 1e4) / 1e4));
    }
  }
  return {
    ...header, width, height, point_step, is_dense,
    fields: fields.map((field) => field.name),
    data: { __bytes: data.byteLength },
    first_points: firstPoints,
  };
}

function getSchema(channelId: number): MsgSchema | null {
  if (schemas.has(channelId)) return schemas.get(channelId) ?? null;
  const parsed = client?.getSchema(channelId) ?? null;
  schemas.set(channelId, parsed);
  return parsed;
}

function handleMessage(message: MessageDataEvent): void {
  const runtime = topics.get(message.topic);
  if (runtime === undefined) return;
  if (recordingTopics.has(message.topic)) {
    post({ type: 'recording-message', message: {
      topic: message.topic, schemaName: message.schemaName, logTimeNs: message.logTime.toString(),
      sequence: runtime.count, payload: new Uint8Array(message.payload),
    } });
  }

  runtime.count += 1;
  runtime.bytes += message.payload.byteLength;
  runtime.lastLogTimeNs = message.logTime;
  runtime.lastReceiveAt = Date.now();
  runtime.window.push({ at: runtime.lastReceiveAt, count: runtime.count });
  const cutoff = runtime.lastReceiveAt - RATE_WINDOW_MS;
  while (runtime.window.length > 2 && (runtime.window[0] as { at: number }).at < cutoff) {
    runtime.window.shift();
  }

  const wantsPanel = panelTopics.includes(message.topic);
  const spatial = wantsPanel && spatialSchemaNames.has(message.schemaName);
  const preserveEvents = spatial && (message.schemaName === spatialSchemas.tf ||
    message.schemaName === spatialSchemas.marker || message.schemaName === spatialSchemas.markers);
  const refreshPreview = runtime.lastReceiveAt - runtime.lastSampleAt >= SAMPLE_DECODE_INTERVAL_MS;
  if (!refreshPreview && !preserveEvents) return;
  if (refreshPreview) runtime.lastSampleAt = runtime.lastReceiveAt;
  try {
    const schema = getSchema(message.channelId);
    if (schema !== null) {
      if (message.schemaName === 'sensor_msgs/msg/PointCloud2') {
        const cloud = parsePointCloud2(decodeMessage(schema, message.schemaName, message.payload, { byteArrays: 'view' }).value);
        runtime.sample = summarizePointCloud(cloud);
        runtime.pointCloud = wantsPanel
          // Own exactly the cloud byte region before it crosses a structured-clone boundary.
          ? { ...cloud.message, data: new Uint8Array(cloud.message.data) } : undefined;
      } else {
        if (spatial && message.payload.byteLength > VISUAL_FRAME_MAX_BYTES) throw new Error('空间消息超出 2 MiB 显示上限');
        const { value } = decodeMessage(schema, message.schemaName, message.payload);
        if (spatial) {
          const events = runtime.spatialFrames ??= [];
          let bytes = runtime.spatialBytes ?? 0;
          let overflow = false;
          while (events.length >= 64 || bytes + message.payload.length > VISUAL_BATCH_MAX_BYTES) {
            bytes -= events.shift()!.bytes;
            overflow = true;
          }
          if (overflow) log('warn', '空间显示队列溢出 · ' + message.topic);
          events.push({ value, sequence: ++sampleSequence, logTimeNs: message.logTime.toString(), bytes: message.payload.length });
          runtime.spatialBytes = bytes + message.payload.length;
        }
        if (refreshPreview) runtime.sample = summarize(value);
      }
      if (refreshPreview) {
        runtime.sampleSequence = ++sampleSequence;
        runtime.sampleLogTimeNs = message.logTime.toString();
      }
    }
  } catch (error) {
    runtime.decodeErrors += 1;
    log(
      'warn',
      `decode failed on ${message.topic}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function rateOf(runtime: TopicRuntime): number {
  if (runtime.window.length < 2) return 0;
  const first = runtime.window[0] as { at: number; count: number };
  const last = runtime.window[runtime.window.length - 1] as { at: number; count: number };
  const seconds = (last.at - first.at) / 1000;
  if (seconds <= 0) return 0;
  return Math.max(0, (last.count - first.count) / seconds);
}

function buildTelemetry(): TelemetryPayload {
  const entries: TopicTelemetry[] = [...topics.entries()]
    .filter(([topic]) => subscribed.has(topic))
    .map(([topic, runtime]) => {
      const pointCloud = runtime.publishedCloudSequence !== runtime.sampleSequence && panelTopics.includes(topic)
        ? runtime.pointCloud : undefined;
      if (pointCloud) runtime.publishedCloudSequence = runtime.sampleSequence;
      const spatialFrames = runtime.spatialFrames;
      runtime.spatialFrames = undefined;
      runtime.spatialBytes = 0;
      return {
        topic,
        channelId: runtime.channelId,
        schemaName: runtime.schemaName,
        encoding: runtime.encoding,
        count: runtime.count,
        bytes: runtime.bytes,
        rateHz: Math.round(rateOf(runtime) * 100) / 100,
        lastLogTimeNs: runtime.lastLogTimeNs === null ? null : runtime.lastLogTimeNs.toString(),
        lastReceiveAt: runtime.lastReceiveAt,
        decodeErrors: runtime.decodeErrors,
        ...(runtime.sample === undefined ? {} : {
          sample: runtime.sample,
          sampleSequence: runtime.sampleSequence,
          sampleLogTimeNs: runtime.sampleLogTimeNs,
        }),
        ...(pointCloud ? { pointCloud } : {}),
        ...(spatialFrames?.length && panelTopics.includes(topic) ? {
          spatialFrames: spatialFrames.map(({ value, sequence, logTimeNs }) => ({ value, sequence, logTimeNs })),
        } : {}),
      };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));

  return {
    topics: entries,
    totalMessages: entries.reduce((sum, entry) => sum + entry.count, 0),
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    uptimeMs: Date.now() - startedAt,
    timestamp: Date.now(),
  };
}

function ensureTelemetryLoop(): void {
  if (telemetryTimer !== null) return;
  telemetryTimer = setInterval(() => post({ type: 'telemetry', payload: buildTelemetry() }), TELEMETRY_INTERVAL_MS);
}

/** Refresh channel ids/names after (re)advertisement; ids change across reconnects. */
function syncTopicRuntimes(): void {
  if (client === null) return;
  for (const channel of client.channels) {
    if (!subscribed.has(channel.topic)) continue;
    const runtime = topics.get(channel.topic);
    if (runtime === undefined) {
      topics.set(channel.topic, {
        channelId: channel.id,
        schemaName: channel.schemaName,
        encoding: channel.encoding,
        count: 0,
        bytes: 0,
        lastLogTimeNs: null,
        lastReceiveAt: null,
        lastSampleAt: 0,
        decodeErrors: 0,
        window: [],
      });
    } else {
      runtime.channelId = channel.id;
      runtime.schemaName = channel.schemaName;
      runtime.encoding = channel.encoding;
    }
  }
}

async function teardown(): Promise<void> {
  if (telemetryTimer !== null) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
  const previous = client;
  client = null;
  if (previous !== null) {
    previous.close('session closed');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function handleConnect(url: string): Promise<void> {
  await teardown();

  startedAt = Date.now();
  topics.clear();
  schemas.clear();
  subscribed.clear();
  manualTopics.clear();
  connectAttempt = 0;
  reconnects = 0;
  status = { ...emptyStatus(), state: 'connecting', url };

  const next = new FoxgloveClient({
    url,
    reconnect: { initialDelayMs: 500, maxDelayMs: 5_000, jitterMs: 250, maxAttempts: 30 },
  });
  client = next;
  reconcileSubscriptions();

  next.on('stateChange', ({ state, reason }) => {
    if (state === 'reconnecting') {
      connectAttempt += 1;
      schemas.clear();
      for (const runtime of topics.values()) {
        runtime.sample = undefined;
        runtime.sampleSequence = undefined;
        runtime.sampleLogTimeNs = undefined;
        runtime.lastSampleAt = 0;
      }
      publishStatus({ state, connectAttempt, error: reason ?? '连接断开，正在重连' });
      return;
    }
    if (state === 'connected') {
      if (connectAttempt > 0) reconnects += 1;
      // Channel ids are connection-scoped: drop cached schemas on reconnect.
      schemas.clear();
      publishStatus({ state, subprotocol: next.subprotocol ?? undefined, error: undefined });
      return;
    }
    setState(state, state === 'disconnected' ? (reason ?? '连接断开') : undefined);
  });
  next.on('serverInfo', (info) => {
    publishStatus({
      serverInfo: {
        ...(info.name === undefined ? {} : { name: info.name }),
        capabilities: info.capabilities ?? [],
        supportedEncodings: info.supportedEncodings ?? [],
        ...(info.metadata === undefined ? {} : { metadata: info.metadata }),
        ...(info.sessionId === undefined ? {} : { sessionId: info.sessionId }),
      },
    });
  });
  next.on('advertise', () => {
    syncTopicRuntimes();
    publishStatus({ channels: summarizeChannels(next.channels), reconnects });
    announceRecordingChannels();
  });
  next.on('unadvertise', (removedIds) => {
    const removed = new Set(removedIds);
    for (const id of removed) schemas.delete(id);
    for (const [topic, runtime] of topics) {
      if (removed.has(runtime.channelId)) topics.delete(topic);
    }
    publishStatus({ channels: summarizeChannels(next.channels) });
  });
  next.on('message', handleMessage);
  next.on('error', (error) => log('warn', error.message));

  try {
    await next.connect();
    publishStatus({ subprotocol: next.subprotocol ?? undefined, url });
    const channels = await next.waitForChannels(10_000);
    syncTopicRuntimes();
    publishStatus({ channels: summarizeChannels(channels), reconnects });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState('error', message);
    log('error', `connect failed: ${message}`);
    return;
  }

  ensureTelemetryLoop();
}

function reconcileSubscriptions(): void {
  if (client === null) return;
  const desired = new Set([...manualTopics, ...panelTopics]);
  for (const topic of subscribed) {
    if (desired.has(topic)) continue;
    client.unsubscribe(topic);
    subscribed.delete(topic);
    topics.delete(topic);
  }
  for (const topic of desired) {
    if (subscribed.has(topic)) continue;
    subscribed.add(topic);
    client.subscribe(topic);
  }
  syncTopicRuntimes();
  publishStatus();
}

async function handleDisconnect(): Promise<void> {
  await teardown();
  topics.clear();
  schemas.clear();
  subscribed.clear();
  manualTopics.clear();
  status = { ...emptyStatus(), state: 'disconnected' };
  publishStatus();
}

function enqueue(task: () => Promise<void>): void {
  commandQueue = commandQueue.then(task).catch((error: unknown) => {
    log('error', error instanceof Error ? error.message : String(error));
  });
}

port.on('message', (event: WorkerRequest | RecordingWorkerRequest) => {
  switch (event.type) {
    case 'connect':
      enqueue(() => handleConnect(event.url));
      return;
    case 'disconnect':
      enqueue(() => handleDisconnect());
      return;
    case 'subscribe':
      for (const topic of event.topics) manualTopics.add(topic);
      reconcileSubscriptions();
      return;
    case 'panel-topics':
      for (const topic of panelTopics) {
        const runtime = topics.get(topic);
        if (runtime && !event.topics.includes(topic)) {
          runtime.pointCloud = undefined;
          runtime.spatialFrames = undefined;
          runtime.spatialBytes = 0;
        }
      }
      panelTopics = event.topics;
      reconcileSubscriptions();
      return;
    case 'status':
      publishStatus();
      return;
    case 'recording-start':
      recordingTopics = new Set(event.topics);
      recordingSchemaSent.clear();
      announceRecordingChannels();
      return;
    case 'recording-stop':
      recordingTopics.clear();
      recordingSchemaSent.clear();
      return;
    default:
      return;
  }
});

publishStatus();

export {};
