import type { DataSourceSink, MessageEnvelope, SourceId, TopicDescriptor } from '@labscope/data-source';
import type { TelemetryPayload } from '../../../shared/types';
import { timelineClock } from '../timeline/timeline-clock';

export type { MessageEnvelope, SourceId, TopicDescriptor } from '@labscope/data-source';

type Listener = () => void;

interface SourceState {
  channels: readonly TopicDescriptor[];
  catalogListeners: Set<Listener>;
  resetListeners: Set<Listener>;
  clockListeners: Set<Listener>;
  clock?: bigint;
  topics: Map<string, { latest?: MessageEnvelope; listeners: Set<{ notify: Listener }> }>;
}

function sourceState(): SourceState {
  return { channels: [], catalogListeners: new Set(), resetListeners: new Set(), clockListeners: new Set(), topics: new Map() };
}

/** One renderer bus for live, replay and simulation. Retains only current samples for consumers. */
export class MessageBus implements DataSourceSink {
  private readonly sources: Record<SourceId, SourceState> = {
    live: sourceState(), playback: sourceState(), simulation: sourceState(),
  };
  private liveTopicsQueued = false;

  constructor(
    private readonly setLiveTopics: (topics: string[]) => void,
    private readonly onError: (error: unknown) => void = console.error,
  ) {}

  private notify(listener: Listener): void {
    try {
      listener();
    } catch (error) {
      this.onError(error);
    }
  }

  getChannels(source: SourceId): readonly TopicDescriptor[] {
    return this.sources[source].channels;
  }

  setChannels(source: SourceId, channels: readonly TopicDescriptor[]): void {
    const state = this.sources[source];
    if (state.channels === channels) return;
    state.channels = channels;
    const advertised = new Set(channels.map(({ topic }) => topic));
    for (const [topic, binding] of state.topics) {
      if (advertised.has(topic) || !binding.latest) continue;
      binding.latest = undefined;
      for (const { notify } of [...binding.listeners]) this.notify(notify);
    }
    for (const listener of [...state.catalogListeners]) this.notify(listener);
  }

  subscribeChannels(source: SourceId, listener: Listener): () => void {
    const listeners = this.sources[source].catalogListeners;
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  getLatest(source: SourceId, topic: string): MessageEnvelope | undefined {
    return this.sources[source].topics.get(topic)?.latest;
  }

  subscribeReset(source: SourceId, listener: Listener): () => void {
    const listeners = this.sources[source].resetListeners;
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  subscribeClock(source: SourceId, listener: Listener): () => void {
    const listeners = this.sources[source].clockListeners;
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  getClock(source: SourceId): bigint | undefined { return this.sources[source].clock; }

  setClock(source: SourceId, stamp: bigint): void {
    const state = this.sources[source];
    if (state.clock !== undefined && state.clock >= stamp) return;
    state.clock = stamp;
    for (const listener of state.clockListeners) this.notify(listener);
  }

  hasSubscribers(source: SourceId, topic: string): boolean {
    return this.sources[source].topics.has(topic);
  }

  subscribe(source: SourceId, topic: string, notify: Listener): () => void {
    const topics = this.sources[source].topics;
    let binding = topics.get(topic);
    if (binding === undefined) {
      binding = { listeners: new Set() };
      topics.set(topic, binding);
      if (source === 'live') this.queueLiveTopics();
    }
    const consumer = { notify };
    binding.listeners.add(consumer);
    return () => {
      if (!binding.listeners.delete(consumer) || binding.listeners.size > 0) return;
      topics.delete(topic);
      if (source === 'live') this.queueLiveTopics();
    };
  }

  private queueLiveTopics(): void {
    if (this.liveTopicsQueued) return;
    this.liveTopicsQueued = true;
    queueMicrotask(() => {
      this.liveTopicsQueued = false;
      try {
        this.setLiveTopics([...this.sources.live.topics.keys()].sort());
      } catch (error) {
        this.onError(error);
      }
    });
  }

  publish(message: MessageEnvelope, advanceClock = true): void {
    if (advanceClock && message.logTimeNs !== null && /^-?\d{1,22}$/.test(message.logTimeNs)) {
      const stamp = BigInt(message.logTimeNs);
      this.setClock(message.source, stamp);
      if (message.source === 'live' || message.source === 'simulation') timelineClock.observe(message.source, stamp);
    }
    const binding = this.sources[message.source].topics.get(message.topic);
    if (!binding || binding.latest?.sequence === message.sequence) return;
    binding.latest = message;
    for (const { notify } of [...binding.listeners]) this.notify(notify);
  }

  publishLive(payload: TelemetryPayload): void {
    for (const topic of payload.topics) {
      if (topic.spatialFrames?.length) {
        for (const frame of topic.spatialFrames) this.publish({
          source: 'live', topic: topic.topic, schemaName: topic.schemaName, logTimeNs: frame.logTimeNs,
          sequence: frame.sequence, payload: { kind: 'decoded', value: frame.value },
        });
        continue;
      }
      if (topic.sampleSequence === undefined || topic.sample === undefined) continue;
      if (topic.pointCloud === undefined && this.getLatest('live', topic.topic)?.payload.kind === 'decoded') continue;
      this.publish({
        source: 'live',
        topic: topic.topic,
        schemaName: topic.schemaName,
        logTimeNs: topic.sampleLogTimeNs ?? null,
        sequence: topic.sampleSequence,
        payload: topic.pointCloud === undefined ? { kind: 'preview', value: topic.sample }
          : { kind: 'decoded', value: topic.pointCloud },
      });
    }
  }

  /** Clear retained frames after disconnect, source replacement or a playback seek. */
  reset(source: SourceId): void {
    const state = this.sources[source];
    state.clock = undefined;
    for (const listener of state.resetListeners) this.notify(listener);
    for (const binding of state.topics.values()) {
      if (binding.latest === undefined) continue;
      binding.latest = undefined;
      for (const { notify } of [...binding.listeners]) this.notify(notify);
    }
  }
}

export const messageBus = new MessageBus((topics) => {
  void window.labscope?.setPanelTopics(topics).catch((error) => {
    console.error('无法更新面板话题订阅', error);
  });
});
