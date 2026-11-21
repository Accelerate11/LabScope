/**
 * Types shared by the main process, the data worker, the preload bridge and the
 * renderer. Keeping them in one place is what makes the IPC contract
 * reviewable: every channel below carries one of these shapes and nothing else.
 */

export type SessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'closed'
  | 'error';

/** A topic as advertised by the robot bridge (schema text stays in the worker). */
export interface ChannelSummary {
  id: number;
  topic: string;
  schemaName: string;
  encoding: string;
  schemaEncoding: string;
  schemaBytes: number;
}

export interface ServerInfoSummary {
  name?: string;
  capabilities: string[];
  supportedEncodings: string[];
  metadata?: Record<string, string>;
  sessionId?: string;
}

export interface SessionStatus {
  state: SessionState;
  /** Negotiated WebSocket subprotocol, e.g. `foxglove.sdk.v1`. */
  subprotocol?: string;
  url?: string;
  error?: string;
  /** Populated once the handshake completed. */
  serverInfo?: ServerInfoSummary;
  channels: ChannelSummary[];
  subscribed: string[];
  connectAttempt: number;
  /** Set when a reconnect has succeeded at least once. */
  reconnects: number;
}

export interface TopicTelemetry {
  topic: string;
  channelId: number;
  schemaName: string;
  encoding: string;
  /** Messages received since the subscription started. */
  count: number;
  bytes: number;
  /** Sliding-window message rate in Hz. */
  rateHz: number;
  lastLogTimeNs: string | null;
  lastReceiveAt: number | null;
  decodeErrors: number;
  /** Trimmed JSON-safe preview of the most recent decoded message. */
  sample?: unknown;
  sampleSequence?: number;
  sampleLogTimeNs?: string;
  /** Full cloud for panel subscriptions. The JSON preview remains independently available. */
  pointCloud?: unknown;
  /** Decoded spatial events accumulated during the telemetry interval. */
  spatialFrames?: { value: unknown; sequence: number; logTimeNs: string }[];
}

export interface TelemetryPayload {
  topics: TopicTelemetry[];
  totalMessages: number;
  totalBytes: number;
  uptimeMs: number;
  timestamp: number;
}

export interface BigIntStats {
  messagesReceived: number;
  bytesReceived: number;
  framesReceived: number;
  decodeErrors: number;
  connects: number;
  reconnects: number;
}

export interface AppInfo {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
}

export interface DesktopConfig {
  /** Last successfully used bridge URL, restored on next launch. */
  lastUrl: string;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  at: number;
}

export interface RecordingChannelEvent { topic: string; schemaName: string; schema: string; channelId: number; }
export interface RecordingMessageEvent {
  topic: string; schemaName: string; logTimeNs: string; sequence: number; payload: Uint8Array;
}

/** Renderer -> main requests. */
export interface ConnectRequest {
  url: string;
}
