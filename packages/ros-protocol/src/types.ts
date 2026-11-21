/**
 * Protocol data model for the Foxglove WebSocket protocol, as implemented by
 * SDK-based `foxglove_bridge` (3.x) and the older ws-protocol-based bridge.
 *
 * Verified against foxglove_bridge 3.6.3 / foxglove-sdk-cpp 0.30.2 on ROS 2
 * Humble. See docs/m0/REPORT.md for the captured evidence.
 */

/** Subprotocols this client can speak, newest first. */
export const SUPPORTED_SUBPROTOCOLS = ['foxglove.sdk.v1', 'foxglove.websocket.v1'] as const;
export type Subprotocol = (typeof SUPPORTED_SUBPROTOCOLS)[number];

export type ServerCapability =
  | 'clientPublish'
  | 'parameters'
  | 'parametersSubscribe'
  | 'services'
  | 'connectionGraph'
  | 'assets'
  | 'time'
  | 'playbackControl'
  | (string & {});

export interface ServerInfo {
  op: 'serverInfo';
  name?: string;
  capabilities?: ServerCapability[];
  supportedEncodings?: string[];
  metadata?: Record<string, string>;
  sessionId?: string;
}

export interface ChannelAdvertisement {
  id: number;
  topic: string;
  /** Payload encoding, e.g. `cdr` (ROS 2) or `json`. */
  encoding: string;
  /** Message type, e.g. `sensor_msgs/msg/Imu`. */
  schemaName: string;
  /** Schema format, e.g. `ros2msg`. */
  schemaEncoding?: string;
  /** Inline schema text (SDK protocol v1 advertises schemas inline). */
  schema?: string;
  metadata?: Record<string, string>;
}

/** A channel with its schema guaranteed present. */
export interface Channel extends ChannelAdvertisement {
  schema: string;
  schemaEncoding: string;
}

export interface AdvertiseMessage {
  op: 'advertise';
  channels: ChannelAdvertisement[];
}

export interface UnadvertiseMessage {
  op: 'unadvertise';
  channelIds: number[];
}

export interface StatusMessage {
  op: 'status';
  level: 0 | 1 | 2;
  message: string;
  id?: string;
}

export interface RemoveStatusMessage {
  op: 'removeStatus';
  statusIds: string[];
}

export interface AdvertiseServicesMessage {
  op: 'advertiseServices';
  services: unknown[];
}

export interface ServiceCallFailureMessage {
  op: 'serviceCallFailure';
  serviceId: number;
  callId: number;
  message: string;
}

export type ServerJsonMessage =
  | ServerInfo
  | AdvertiseMessage
  | UnadvertiseMessage
  | StatusMessage
  | RemoveStatusMessage
  | AdvertiseServicesMessage
  | ServiceCallFailureMessage
  | { op: string; [key: string]: unknown };

export interface SubscribeMessage {
  op: 'subscribe';
  subscriptions: { id: number; channelId: number }[];
}

export interface UnsubscribeMessage {
  op: 'unsubscribe';
  subscriptionIds: number[];
}

/** A decoded binary message-data frame (opcode 0x01). */
export interface MessageDataEvent {
  subscriptionId: number;
  channelId: number;
  topic: string;
  schemaName: string;
  /** Payload encoding advertised for the channel, e.g. `cdr`. */
  encoding: string;
  /** Schema encoding advertised for the channel, e.g. `ros2msg`. */
  schemaEncoding: string;
  /** Server-assigned log/receive time in nanoseconds since the epoch. */
  logTime: bigint;
  /** Client wall-clock receive time in nanoseconds since the epoch. */
  receiveTime: bigint;
  /** Raw message payload exactly as framed on the wire (still CDR-encoded). */
  payload: Uint8Array;
}

export interface TimeEvent {
  timestamp: bigint;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'closed';

/** Topic metadata exposed to the UI. */
export interface TopicInfo {
  readonly name: string;
  readonly channelId: number;
  readonly schemaName: string;
  readonly encoding: string;
  readonly schemaEncoding: string;
  readonly schema: string;
  readonly metadata?: Record<string, string>;
}

export interface FoxgloveClientEvents {
  stateChange: { state: ConnectionState; reason?: string };
  serverInfo: ServerInfo;
  advertise: Channel[];
  unadvertise: number[];
  message: MessageDataEvent;
  status: StatusMessage;
  time: TimeEvent;
  error: Error;
  /** Emitted after a reconnect succeeds and stored subscriptions were restored. */
  reconnected: { attempts: number };
}

/** Summary counters useful for diagnostics and the M0 report. */
export interface ClientStats {
  messagesReceived: number;
  bytesReceived: number;
  framesReceived: number;
  decodeErrors: number;
  connects: number;
  reconnects: number;
  lastMessageAt: number | null;
}
