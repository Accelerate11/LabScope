import { McapIndexedReader, type Message } from '@mcap/core';
import { readFile, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { decompress } from 'fzstd';
import { decodeMessage, parseMsgDefinitionText, parsePointCloud2, type MsgSchema } from '@labscope/ros-schema';
import { ToolRegistry, parseLogText, type ExperimentAnalysis, type LogAnalysis, type SensorAnalysis, type TopicAnalysis } from '@labscope/analysis-engine';
import type { ExperimentManifest } from '../shared/recording-types';
import { listExperiments } from './recording-manager';

type IndexedMessage = Message & { type: 'Message' };
const MAX_CHUNK = 128n * 1024n * 1024n;
interface TopicState { topic: string; schemaName: string; count: number; first: bigint | null; last: bigint | null; intervals: number[]; maxGap: number; }
interface SensorState { topic: string; samples: number; sum: number; sumSq: number; max: number; maxAt: string | null; }

const magnitude = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>; const x = Number(item.x), y = Number(item.y), z = Number(item.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? Math.sqrt(x * x + y * y + z * z) : null;
};

function topicStats(state: TopicState): TopicAnalysis {
  const durationMs = state.first !== null && state.last !== null ? Number(state.last - state.first) / 1e6 : 0;
  const mean = state.intervals.length ? state.intervals.reduce((sum, value) => sum + value, 0) / state.intervals.length : null;
  const variance = state.intervals.length > 1 && mean !== null ? state.intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / state.intervals.length : 0;
  return { topic: state.topic, schemaName: state.schemaName, messageCount: state.count, firstNs: state.first?.toString() ?? null,
    lastNs: state.last?.toString() ?? null, frequencyHz: durationMs > 0 ? (state.count - 1) / (durationMs / 1000) : null,
    meanIntervalMs: mean, maxGapMs: state.maxGap || null, timestampJitterMs: variance ? Math.sqrt(variance) : null };
}

export interface AnalysisRunResult { analysis: ExperimentAnalysis; logs?: LogAnalysis; }
export class ExperimentAnalysisService {
  readonly tools = new ToolRegistry();
  constructor(private readonly root = 'D:/LabScope/data/experiments') {
    this.tools.register({ id: 'get_experiment_info', name: 'Experiment information', description: 'Read experiment metadata and file integrity.', permission: 'read', execute: (input) => this.getExperimentInfo(String((input as { experimentId?: string })?.experimentId ?? '')) });
    this.tools.register({ id: 'get_topic_statistics', name: 'Topic statistics', description: 'Compute message counts, frequency, gaps, and timestamp jitter.', permission: 'read', execute: (input) => this.run(input) });
    this.tools.register({ id: 'analyze_imu', name: 'IMU analysis', description: 'Compute acceleration and angular velocity magnitude statistics.', permission: 'read', execute: (input) => this.run(input) });
    this.tools.register({ id: 'analyze_pointcloud', name: 'PointCloud analysis', description: 'Compute point count and invalid point statistics.', permission: 'read', execute: (input) => this.run(input) });
    this.tools.register({ id: 'analyze_log', name: 'Log analysis', description: 'Parse selected text logs locally before model interpretation.', permission: 'read', execute: (input) => parseLogText(String((input as { text?: string })?.text ?? ''), String((input as { source?: string })?.source ?? 'memory')) });
  }
  listTools() { return this.tools.list(); }
  async getExperimentInfo(experimentId: string): Promise<ExperimentManifest> { const item = (await listExperiments(this.root)).find((experiment) => experiment.experimentId === experimentId); if (!item) throw new Error('实验不存在: ' + experimentId); return item; }
  async run(input: unknown): Promise<ExperimentAnalysis> { const experimentId = String((input as { experimentId?: string })?.experimentId ?? ''); return this.analyze(experimentId); }
  async analyze(experimentId: string): Promise<ExperimentAnalysis> {
    const manifest = await this.getExperimentInfo(experimentId); const experimentDir = join(this.root, manifest.project, manifest.experimentId);
    const topics = new Map<string, TopicState>(); const imu = new Map<string, SensorState>(); const clouds = new Map<string, { samples: number; total: number; min: number; max: number; invalid: number }>(); const warnings: string[] = [];
    for (const segment of manifest.segments) {
      if (segment.status !== 'complete') { warnings.push(`segment ${segment.file} is ${segment.status}`); continue; }
      const path = join(experimentDir, segment.file); let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        const info = await stat(path); handle = await open(path); const reader = await McapIndexedReader.Initialize({ readable: { size: async () => BigInt(info.size), read: async (offset, size) => { if (size > MAX_CHUNK) throw new Error('MCAP chunk exceeds limit'); const buffer = Buffer.alloc(Number(size)); await handle!.read(buffer, 0, Number(size), Number(offset)); return new Uint8Array(buffer); } }, decompressHandlers: { zstd: (bytes, size) => { if (size > MAX_CHUNK) throw new Error('MCAP zstd chunk exceeds limit'); return decompress(bytes, new Uint8Array(Number(size))); } } });
        const schemas = new Map<number, MsgSchema>(); const schemaText = new TextDecoder();
        for await (const message of reader.readMessages() as AsyncGenerator<IndexedMessage>) {
          const channel = reader.channelsById.get(message.channelId); const description = channel ? reader.schemasById.get(channel.schemaId) : undefined; if (!channel || !description) continue;
          const state = topics.get(channel.topic) ?? { topic: channel.topic, schemaName: description.name, count: 0, first: null, last: null, intervals: [], maxGap: 0 }; state.count += 1;
          if (state.last !== null) { const interval = Number(message.logTime - state.last) / 1e6; if (interval >= 0 && interval < 60_000) { state.intervals.push(interval); state.maxGap = Math.max(state.maxGap, interval); } }
          state.first ??= message.logTime; state.last = message.logTime; topics.set(channel.topic, state);
          if (description.encoding !== 'ros2msg' || channel.messageEncoding !== 'cdr') continue;
          let schema = schemas.get(description.id); if (!schema) { schema = parseMsgDefinitionText(description.name, schemaText.decode(description.data)); schemas.set(description.id, schema); }
          let value: unknown; try { value = decodeMessage(schema, description.name, message.data, { byteArrays: 'view' }).value; } catch { continue; }
          if (description.name === 'sensor_msgs/msg/Imu') {
            const imuValue = value as { linear_acceleration?: unknown; angular_velocity?: unknown }; for (const [label, vector] of [['linear_acceleration', imuValue.linear_acceleration], ['angular_velocity', imuValue.angular_velocity]] as const) { const key = channel.topic + ':' + label; const item = imu.get(key) ?? { topic: key, samples: 0, sum: 0, sumSq: 0, max: -Infinity, maxAt: null }; const size = magnitude(vector); if (size === null) continue; item.samples += 1; item.sum += size; item.sumSq += size * size; if (size > item.max) { item.max = size; item.maxAt = message.logTime.toString(); } imu.set(key, item); }
          }
          if (description.name === 'sensor_msgs/msg/PointCloud2') { try { const cloud = parsePointCloud2(value); const item = clouds.get(channel.topic) ?? { samples: 0, total: 0, min: Infinity, max: 0, invalid: 0 }; item.samples += 1; item.total += cloud.pointCount; item.min = Math.min(item.min, cloud.pointCount); item.max = Math.max(item.max, cloud.pointCount); const positions = ['x', 'y', 'z'].map((name) => cloud.scalar(name)); for (let index = 0; index < cloud.pointCount && positions.every(Boolean); index += 1) { const base = cloud.byteOffset(index); if (positions.some((read) => !Number.isFinite(read!(base)))) item.invalid += 1; } clouds.set(channel.topic, item); } catch { warnings.push(`invalid PointCloud2 schema on ${channel.topic}`); } }
        }
      } catch (error) { warnings.push(`${segment.file}: ${error instanceof Error ? error.message : String(error)}`); } finally { await handle?.close().catch(() => {}); }
    }
    const sensor: SensorAnalysis[] = [...imu.values()].map((item) => ({ topic: item.topic, samples: item.samples, maxMagnitude: Number.isFinite(item.max) ? item.max : null, meanMagnitude: item.samples ? item.sum / item.samples : null, stddevMagnitude: item.samples ? Math.sqrt(Math.max(0, item.sumSq / item.samples - (item.sum / item.samples) ** 2)) : null, maxAtNs: item.maxAt }));
    return { experimentId: manifest.experimentId, experimentName: manifest.name, generatedAt: new Date().toISOString(), topics: [...topics.values()].map(topicStats), imu: sensor, pointCloud: [...clouds].map(([topic, item]) => ({ topic, samples: item.samples, meanPoints: item.samples ? item.total / item.samples : null, minPoints: Number.isFinite(item.min) ? item.min : null, maxPoints: item.max || null, invalidPoints: item.invalid })), events: manifest.events, evidence: [{ sourceFiles: manifest.segments.map((segment) => segment.file), topics: [...topics.keys()], startNs: manifest.startLogTimeNs, endNs: manifest.endLogTimeNs, messageCount: [...topics.values()].reduce((sum, item) => sum + item.count, 0), details: 'Indexed MCAP segments and manifest' }], warnings };
  }
}
