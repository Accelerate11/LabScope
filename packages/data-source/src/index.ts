export type SourceId = 'live' | 'playback' | 'simulation';

export interface TopicDescriptor {
  topic: string;
  schemaName: string;
}

export interface MessageEnvelope {
  source: SourceId;
  topic: string;
  schemaName: string;
  /** Decimal nanoseconds or null when unavailable from the producer. */
  logTimeNs: string | null;
  sequence: number;
  payload: { kind: 'preview' | 'decoded'; value: unknown } | { kind: 'binary'; value: Uint8Array };
}

/** Transport-neutral producer port implemented by the existing renderer bus. */
export interface DataSourceSink {
  setChannels(source: SourceId, channels: readonly TopicDescriptor[]): void;
  publish(message: MessageEnvelope): void;
  reset(source: SourceId): void;
  hasSubscribers?(source: SourceId, topic: string): boolean;
}

export interface DataSource {
  readonly id: SourceId;
  start(): void;
  stop(): void;
  reset(): void;
}
