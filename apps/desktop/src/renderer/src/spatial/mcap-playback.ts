import { McapIndexedReader, type Message } from '@mcap/core';
import { decodeMessage, parseMsgDefinitionText, type MsgSchema } from '@labscope/ros-schema';
import { decompress } from 'fzstd';
import type { DataSource } from '@labscope/data-source';
import { timelineClock } from '../timeline/timeline-clock';
import { spatialSchemas } from '../../../shared/spatial-schemas';
import type { MessageBus, TopicDescriptor } from '../workspace/message-bus';
import { PlaybackFeed } from '../workspace/playback-feed';

type IndexedMessage = Message & { type: 'Message' };
interface Channel extends TopicDescriptor { schema: MsgSchema }
export interface PlaybackState { timeMs: number; durationMs: number; running: boolean; seeking: boolean; error: string | null; rate: number }
const NS_PER_MS = 1000000n;
const MAX_CHUNK = 128n * 1024n * 1024n;

export class McapPlaybackDataSource implements DataSource {
  readonly id = 'playback';
  readonly topics: readonly TopicDescriptor[];
  private readonly feed: PlaybackFeed;
  private readonly channels = new Map<number, Channel>();
  private iterator: AsyncGenerator<IndexedMessage> | undefined;
  private next: IndexedMessage | undefined;
  private position: bigint;
  private sequence = 0;
  private generation = 0;
  private running = false;
  private seeking = false;
  private closed = false;
  private anchor = 0;
  private anchorTime = 0n;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private error: string | null = null;
  private busy = false;

  private constructor(private readonly reader: McapIndexedReader, private readonly bus: MessageBus,
    private readonly startNs: bigint, private readonly endNs: bigint, private readonly notify: (state: PlaybackState) => void) {
    const unique = new Map<string, Channel>();
    const text = new TextDecoder();
    const schemas = new Map<number, MsgSchema>();
    for (const channel of reader.channelsById.values()) {
      const description = reader.schemasById.get(channel.schemaId);
      if (!description || description.encoding !== 'ros2msg' || channel.messageEncoding !== 'cdr') continue;
      if (unique.has(channel.topic) && unique.get(channel.topic)?.schemaName !== description.name) {
        throw new Error('MCAP 话题存在多个消息类型 · ' + channel.topic);
      }
      let schema = schemas.get(description.id);
      if (!schema) {
        schema = parseMsgDefinitionText(description.name, text.decode(description.data));
        schemas.set(description.id, schema);
      }
      const entry = { topic: channel.topic, schemaName: description.name, schema };
      unique.set(entry.topic, entry);
      this.channels.set(channel.id, entry);
    }
    if (!unique.size) throw new Error('MCAP 缺少 ROS 2 ros2msg / CDR 话题');
    this.topics = [...unique.values()].map(({ topic, schemaName }) => ({ topic, schemaName }));
    this.feed = new PlaybackFeed(bus);
    this.position = startNs;
  }

  static async open(blob: Blob, bus: MessageBus, notify: (state: PlaybackState) => void = () => {}): Promise<McapPlaybackDataSource> {
    const reader = await McapIndexedReader.Initialize({
      readable: {
        size: async () => BigInt(blob.size),
        read: async (offset, size) => {
          if (offset < 0n || size < 0n || size > MAX_CHUNK || offset + size > BigInt(blob.size)) {
            throw new Error('MCAP 请求的区间超出文件或读块上限');
          }
          return new Uint8Array(await blob.slice(Number(offset), Number(offset + size)).arrayBuffer());
        },
      },
      decompressHandlers: { zstd: (bytes, size) => {
        if (size < 0n || size > MAX_CHUNK) throw new Error('MCAP Zstd 块超出 128 MiB 上限');
        return decompress(bytes, new Uint8Array(Number(size)));
      } },
    });
    if (!reader.chunkIndexes.length) throw new Error('需要含 ChunkIndex 的 ROS 2 MCAP');
    for (const chunk of reader.chunkIndexes) {
      if (chunk.uncompressedSize > MAX_CHUNK) throw new Error('MCAP 数据块超出 128 MiB 上限');
      if (chunk.compression && chunk.compression !== 'zstd') throw new Error('不支持 MCAP 压缩格式 · ' + chunk.compression);
    }
    const first = reader.chunkIndexes[0]!;
    let start = first.messageStartTime, end = first.messageEndTime;
    for (const chunk of reader.chunkIndexes) {
      if (chunk.messageStartTime < start) start = chunk.messageStartTime;
      if (chunk.messageEndTime > end) end = chunk.messageEndTime;
    }
    if (end < start) throw new Error('MCAP 时间范围无效');
    return new McapPlaybackDataSource(reader, bus, start, end, notify);
  }

  get state(): PlaybackState {
    return { timeMs: Number(this.position - this.startNs) / 1e6, durationMs: Number(this.endNs - this.startNs) / 1e6,
      running: this.running, seeking: this.seeking, error: this.error, rate: timelineClock.value.rate };
  }

  mount(): void {
    if (this.closed) return;
    this.feed.load(this.topics);
    timelineClock.configure('playback', this.startNs, this.endNs);
    this.emit();
  }

  private emit(): void { this.notify(this.state); }

  private deliver(message: IndexedMessage, advanceClock = true): void {
    const channel = this.channels.get(message.channelId);
    if (!channel || !this.bus.hasSubscribers(this.id, channel.topic)) return;
    try {
      const { value } = decodeMessage(channel.schema, channel.schemaName, message.data, { byteArrays: 'view' });
      // A point view may share a much larger decompressed chunk. Keep only the selected byte region.
      if (value.data instanceof Uint8Array) value.data = new Uint8Array(value.data);
      this.feed.deliver({ topic: channel.topic, schemaName: channel.schemaName, sequence: ++this.sequence,
        logTimeNs: message.logTime.toString(), payload: { kind: 'decoded', value } }, advanceClock);
    } catch (error) {
      this.error = channel.topic + ' · ' + (error instanceof Error ? error.message : String(error));
    }
  }

  start(): void {
    if (this.running || this.closed || this.seeking) return;
    if (!this.iterator && this.position >= this.endNs && this.endNs !== this.startNs) {
      void this.seek(0).then(() => { if (!this.error && !this.closed) this.start(); });
      return;
    }
    this.running = true;
    timelineClock.play();
    this.anchor = performance.now();
    this.anchorTime = this.position;
    this.iterator ??= this.reader.readMessages({ startingAt: this.position });
    this.emit();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    timelineClock.pause();
    clearTimeout(this.timer);
    this.emit();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.running && !this.busy) this.timer = setTimeout(() => void this.pump(), 16);
  }

  private async pump(): Promise<void> {
    const token = this.generation;
    const iterator = this.iterator;
    this.busy = true;
    try {
      const desired = this.anchorTime + BigInt(Math.floor((performance.now() - this.anchor) * 1e6 * timelineClock.value.rate));
      for (let step = 0; step < 16 && this.running && iterator; step++) {
        if (!this.next) {
          const next = await iterator.next();
          if (token !== this.generation) return;
          if (next.done) {
            this.position = this.endNs;
            this.feed.clock(this.position);
            this.iterator = undefined;
            this.stop();
            return;
          }
          this.next = next.value;
          if (!this.running) return;
        }
        if (this.next.logTime > desired) {
          this.position = desired;
          timelineClock.setCurrent(desired);
          this.feed.clock(desired);
          break;
        }
        const message = this.next;
        this.next = undefined;
        this.position = message.logTime;
        timelineClock.setCurrent(this.position);
        this.feed.clock(this.position);
        this.deliver(message);
      }
      this.emit();
    } catch (error) {
      if (token !== this.generation) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.stop();
    } finally {
      this.busy = false;
      this.schedule();
    }
  }

  reset(): Promise<void> { return this.seek(0); }

  setPlaybackRate(rate: number): void { timelineClock.setPlaybackRate(rate); this.anchor = performance.now(); this.anchorTime = this.position; this.emit(); }

  async seek(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || this.closed) return;
    this.stop();
    const token = ++this.generation;
    const target = this.startNs + BigInt(Math.floor(Math.max(0, Math.min(ms, this.state.durationMs)) * 1e6));
    const cursor = target > this.endNs ? this.endNs : target;
    const old = this.iterator;
    this.iterator = undefined;
    this.next = undefined;
    void old?.return(undefined).catch(() => {});
    this.seeking = true;
    timelineClock.seek(cursor);
    this.error = null;
    this.position = cursor;
    this.feed.seek();
    this.emit();
    try {
      const active = this.topics.filter(({ topic }) => this.bus.hasSubscribers(this.id, topic));
      const lifetime = active.filter(({ schemaName, topic }) => schemaName === spatialSchemas.marker ||
        schemaName === spatialSchemas.markers || (schemaName === spatialSchemas.tf && topic.endsWith('/tf_static')));
      if (lifetime.length) {
        for await (const message of this.reader.readMessages({ topics: lifetime.map(({ topic }) => topic), endingAt: cursor })) {
          if (token !== this.generation) return;
          this.deliver(message);
        }
      }
      const dynamics = active.filter(({ schemaName, topic }) => schemaName === spatialSchemas.tf && !topic.endsWith('/tf_static'));
      if (dynamics.length) {
        const limit = cursor + 500_000_000n;
        const nextTf = new Set<number>();
        const earliest = cursor - this.startNs > 20_000_000_000n ? cursor - 20_000_000_000n : this.startNs;
        for await (const message of this.reader.readMessages({
          topics: dynamics.map(({ topic }) => topic), startingAt: earliest, endingAt: limit,
        })) {
          if (token !== this.generation) return;
          if (message.logTime > cursor && nextTf.has(message.channelId)) continue;
          if (message.logTime > cursor) nextTf.add(message.channelId);
          this.deliver(message, false);
        }
      }
      const latest = new Set(active.map(({ topic }) => topic));
      lifetime.forEach(({ topic }) => latest.delete(topic));
      dynamics.forEach(({ topic }) => latest.delete(topic));
      if (latest.size) {
        for await (const message of this.reader.readMessages({ topics: [...latest], endingAt: cursor, reverse: true })) {
          if (token !== this.generation) return;
          const channel = this.channels.get(message.channelId);
          if (channel && latest.delete(channel.topic)) this.deliver(message, false);
          if (!latest.size) break;
        }
      }
      if (token !== this.generation) return;
      this.feed.clock(cursor);
      timelineClock.finishSeek(cursor);
      this.iterator = this.reader.readMessages({ startingAfter: cursor });
    } catch (error) {
      if (token !== this.generation) return;
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (token === this.generation) {
        this.seeking = false;
        this.emit();
      }
    }
  }

  close(): void {
    this.stop();
    this.closed = true;
    ++this.generation;
    void this.iterator?.return(undefined).catch(() => {});
    this.iterator = undefined;
    this.next = undefined;
    this.feed.close();
    timelineClock.cancel();
  }
}
