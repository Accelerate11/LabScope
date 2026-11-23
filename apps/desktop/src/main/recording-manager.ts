import { McapWriter } from '@mcap/core';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Compression, ExperimentManifest, RawRecordingChannel, RawRecordingMessage, RecordingOptions, RecordingState, RecordingStatus } from '../shared/recording-types';

export type { Compression, ExperimentManifest, RawRecordingChannel, RawRecordingMessage, RecordingOptions, RecordingState, RecordingStatus } from '../shared/recording-types';
const safeName = (value: string, fallback: string) => {
  const clean = value.trim().replace(/[<>:"/\\\\|?*]/g, "_").replace(/[\x00-\x1f]/g, "").replace(/\.+$/g, "");
  return clean.slice(0, 96) || fallback;
};
export class RecordingManager {
  private status: RecordingStatus = this.blank();
  private options!: RecordingOptions;
  private manifest!: ExperimentManifest;
  private queue: RawRecordingMessage[] = [];
  private writer: McapWriter | null = null;
  private fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  private position = 0n;
  private channels = new Map<string, RawRecordingChannel>();
  private channelIds = new Map<string, number>();
  private pumping = false;
  private stopping: Promise<void> | null = null;
  private pausedAt = 0;
  private pauseAccumulated = 0;
  private segmentBytes = 0;
  private segmentStartedAt = 0;
  constructor(private readonly baseDir: string) {}
  get snapshot(): RecordingStatus { return { ...this.status }; }
  private blank(): RecordingStatus { return { state: 'idle', experimentId: null, experimentDir: null, segment: 0, startedAt: null,
    pausedMs: 0, messageCount: 0, byteCount: 0, queueDepth: 0, queueCapacity: 0, queueHighWater: 0,
    droppedMessages: 0, pendingBytes: 0, compression: 'none', error: null }; }
  async start(options: RecordingOptions, channels: RawRecordingChannel[] = []): Promise<RecordingStatus> {
    if (this.status.state !== 'idle' && this.status.state !== 'error') throw new Error('已有录制正在运行');
    this.options = { queueCapacity: 512, maxSegmentBytes: 1024 * 1024 * 1024, maxSegmentMs: 30 * 60_000, compression: 'none', ...options };
    if (this.options.compression !== 'none') throw new Error('当前构建的 MCAP Writer 仅启用无压缩，Zstd/LZ4 录制待接入压缩编码器');
    const experimentId = 'EXP_' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '_' + randomUUID().slice(0, 8);
    const dir = resolve(this.options.outputDir || this.baseDir, safeName(this.options.project, 'Project'), experimentId);
    await mkdir(dir, { recursive: true });
    this.manifest = { schemaVersion: 1, experimentId, name: safeName(this.options.name, 'Experiment'),
      project: safeName(this.options.project, 'Project'), operator: this.options.operator, notes: this.options.notes,
      tags: this.options.tags || [], createdAt: new Date().toISOString(), startLogTimeNs: null, endLogTimeNs: null,
      compression: 'none', segments: [], events: [], pauses: [], integrity: {} };
    this.status = { ...this.blank(), state: 'recording', experimentId, experimentDir: dir, segment: 0,
      startedAt: Date.now(), queueCapacity: this.options.queueCapacity!, compression: 'none' };
    channels.forEach((channel) => this.addChannel(channel));
    await this.openSegment();
    await this.persistManifest();
    return this.snapshot;
  }
  private addChannel(channel: RawRecordingChannel): void { this.channels.set(channel.topic, channel); }
  addChannels(channels: RawRecordingChannel[]): void { channels.forEach((channel) => this.addChannel(channel)); }
  enqueue(message: RawRecordingMessage): void {
    if (this.status.state !== 'recording' || !this.channels.has(message.topic)) return;
    if (!this.manifest.startLogTimeNs) this.manifest.startLogTimeNs = message.logTimeNs;
    if (this.queue.length >= this.options.queueCapacity!) {
      this.status = { ...this.status, droppedMessages: this.status.droppedMessages + 1, error: '录制队列溢出，消息未写入' };
      return;
    }
    this.queue.push(message);
    const pendingBytes = this.queue.reduce((sum, item) => sum + item.payload.byteLength, 0);
    this.status = { ...this.status, queueDepth: this.queue.length, pendingBytes, queueHighWater: Math.max(this.status.queueHighWater, this.queue.length) };
    void this.pump();
  }
  pause(): RecordingStatus {
    if (this.status.state !== 'recording') return this.snapshot;
    this.pausedAt = Date.now(); this.manifest.pauses.push({ startedAt: new Date(this.pausedAt).toISOString() });
    this.status = { ...this.status, state: 'paused' }; return this.snapshot;
  }
  resume(): RecordingStatus {
    if (this.status.state !== 'paused') return this.snapshot;
    this.pauseAccumulated += Date.now() - this.pausedAt;
    const pause = this.manifest.pauses.at(-1); if (pause) pause.endedAt = new Date().toISOString();
    this.status = { ...this.status, state: 'recording', pausedMs: this.pauseAccumulated }; void this.pump(); return this.snapshot;
  }
  addEvent(event: Omit<ExperimentManifest['events'][number], 'id'>): void {
    if (!this.manifest) throw new Error('没有活动实验');
    this.manifest.events.push({ ...event, id: randomUUID() }); void this.persistManifest();
  }
  async stop(): Promise<RecordingStatus> {
    if (this.stopping) { await this.stopping; return this.snapshot; }
    if (this.status.state === 'idle') return this.snapshot;
    this.status = { ...this.status, state: 'stopping' };
    this.stopping = (async () => {
      while (this.pumping) await new Promise((resolve) => setTimeout(resolve, 1));
      await this.pump(true);
      while (this.pumping) await new Promise((resolve) => setTimeout(resolve, 1));
      await this.closeSegment('complete');
      this.manifest.endLogTimeNs ||= this.manifest.startLogTimeNs;
      await this.persistManifest();
    })()
      .catch((error) => { this.status = { ...this.status, state: 'error', error: error instanceof Error ? error.message : String(error) }; })
      .finally(() => { this.stopping = null; });
    await this.stopping;
    if (this.status.state !== 'error') this.status = { ...this.status, state: 'idle', queueDepth: 0, pendingBytes: 0 };
    return this.snapshot;
  }
  cancel(): Promise<RecordingStatus> { this.queue.length = 0; return this.stop(); }
  private async pump(force = false): Promise<void> {
    if (this.pumping || !this.writer) return;
    this.pumping = true;
    try {
      while (this.queue.length && (force || this.status.state === 'recording')) {
        if (this.status.state === 'paused') break;
        const message = this.queue.shift()!;
        const channel = this.channels.get(message.topic) || { topic: message.topic, schemaName: message.schemaName, schema: message.schema || '' };
        if (!channel.schema) throw new Error('录制消息缺少 ROS 2 Schema: ' + message.topic);
        let channelId = this.channelIds.get(channel.topic);
        if (channelId === undefined) {
          const schemaId = await this.writer.registerSchema({ name: channel.schemaName, encoding: 'ros2msg', data: new TextEncoder().encode(channel.schema) });
          channelId = await this.writer.registerChannel({ topic: channel.topic, schemaId, metadata: new Map(), messageEncoding: 'cdr' });
          this.channelIds.set(channel.topic, channelId);
        }
        const writer = this.writer;
        if (!writer) { this.queue.unshift(message); break; }
        await writer.addMessage({ channelId, sequence: message.sequence, logTime: BigInt(message.logTimeNs),
          publishTime: BigInt(message.logTimeNs), data: new Uint8Array(message.payload) });
        this.segmentBytes += message.payload.byteLength; this.segmentStartedAt = this.segmentStartedAt || Date.now();
        this.status = { ...this.status, messageCount: this.status.messageCount + 1, byteCount: this.status.byteCount + message.payload.byteLength,
          queueDepth: this.queue.length, pendingBytes: this.queue.reduce((sum, item) => sum + item.payload.byteLength, 0) };
        this.manifest.endLogTimeNs = message.logTimeNs;
        if (this.segmentBytes >= this.options.maxSegmentBytes! || Date.now() - this.segmentStartedAt >= this.options.maxSegmentMs!) {
          await this.closeSegment('complete'); await this.openSegment();
        }
      }
    } finally { this.pumping = false; }
  }
  private async openSegment(): Promise<void> {
    const index = this.status.segment;
    const file = 'segment-' + String(index).padStart(4, '0') + '.mcap';
    const path = join(this.status.experimentDir!, file);
    this.fileHandle = await open(path, 'wx+'); this.position = 0n;
    this.writer = new McapWriter({ writable: { position: () => this.position, write: async (buffer) => {
      const result = await this.fileHandle!.write(buffer); this.position += BigInt(result.bytesWritten); return result;
    } }, useChunks: true, useChunkIndex: true, useMessageIndex: true, chunkSize: 1024 * 1024 });
    await this.writer.start({ library: 'LabScope', profile: 'ros2' });
    this.segmentBytes = 0; this.segmentStartedAt = Date.now();
    this.manifest.segments.push({ file, index, messageCount: 0, byteCount: 0, status: 'partial' });
    this.status = { ...this.status, segment: index + 1 };
  }
  private async closeSegment(status: 'complete'|'partial'|'corrupt'): Promise<void> {
    if (!this.writer || !this.fileHandle) return;
    const writer = this.writer, handle = this.fileHandle;
    this.writer = null;
    await writer.end(); await handle.sync(); await handle.close();
    this.fileHandle = null;
    const segment = this.manifest.segments.at(-1); if (segment) {
      segment.status = status; segment.messageCount = this.status.messageCount;
      segment.byteCount = this.segmentBytes; const bytes = await readFile(join(this.status.experimentDir!, segment.file));
      segment.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
  }
  private async persistManifest(): Promise<void> {
    const file = join(this.status.experimentDir!, 'manifest.json');
    const temp = file + '.tmp'; const body = JSON.stringify(this.manifest, null, 2) + '\n';
    await writeFile(temp, body, { flag: 'w' }); await rename(temp, file);
  }
}
export async function listExperiments(root: string): Promise<ExperimentManifest[]> {
  const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
  const output: ExperimentManifest[] = [];
  for (const project of projects) if (project.isDirectory()) {
    const experiments = await readdir(join(root, project.name), { withFileTypes: true }).catch(() => []);
    for (const experiment of experiments) if (experiment.isDirectory()) {
      try { output.push(JSON.parse(await readFile(join(root, project.name, experiment.name, 'manifest.json'), 'utf8'))); } catch { }
    }
  }
  return output.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
