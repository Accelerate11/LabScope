/**
 * Foxglove WebSocket protocol client.
 *
 * Implemented from the protocol specification rather than embedded from the
 * (archived) `ws-protocol` libraries, so LabScope owns its transport layer and
 * can add MCAP recording hooks, backpressure and multi-connection management
 * without fighting a framework. The client is dependency-free and works in
 * Node (>=22 global WebSocket) and in the Electron renderer.
 *
 * Responsibilities:
 *  - URL/transport validation and subprotocol negotiation
 *  - serverInfo / advertise / unadvertise bookkeeping
 *  - topic subscriptions with resubscribe-after-reconnect
 *  - binary frame decoding (message data, server time)
 *  - connection state machine with exponential backoff + jitter
 */

import { decodeBinaryFrame, encodeClientMessageData, FrameDecodeError } from './framing.ts';
import { parseMsgDefinitionText, type MsgSchema } from '@labscope/ros-schema';
import {
  SUPPORTED_SUBPROTOCOLS,
  type Channel,
  type ChannelAdvertisement,
  type ClientStats,
  type ConnectionState,
  type FoxgloveClientEvents,
  type MessageDataEvent,
  type ServerInfo,
  type StatusMessage,
  type TopicInfo,
} from './types.ts';

export interface WebSocketLike {
  readonly protocol: string;
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: MessageEvent | Event | CloseEvent) => void): void;
}

export interface ReconnectOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitterMs: number;
  maxAttempts: number;
}

export interface FoxgloveClientOptions {
  url: string;
  /** Subprotocols offered, in preference order. Defaults to SUPPORTED_SUBPROTOCOLS. */
  subprotocols?: readonly string[];
  /** Disable by passing `false`; defaults to enabled with sane delays. */
  reconnect?: false | Partial<ReconnectOptions>;
  connectTimeoutMs?: number;
  /** Injection point for tests or non-DOM transports. */
  webSocketFactory?: (url: string, protocols: string[]) => WebSocketLike;
  /** Injected clock, to keep tests deterministic. */
  now?: () => number;
}

const DEFAULT_RECONNECT: ReconnectOptions = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  factor: 2,
  jitterMs: 250,
  maxAttempts: Number.POSITIVE_INFINITY,
};

const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;

export class FoxgloveProtocolError extends Error {
  override readonly name = 'FoxgloveProtocolError';
}

/**
 * Validate a robot bridge URL before any socket is opened.
 *
 * Only `ws:`/`wss:` are accepted, credentials embedded in the URL are
 * rejected, and the host must be explicitly present. This is the first line of
 * the "no uncontrolled network resource" rule from the security plan.
 */
export function validateConnectionUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new FoxgloveProtocolError(`invalid WebSocket URL: ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new FoxgloveProtocolError(
      `unsupported URL scheme "${parsed.protocol}" (expected ws: or wss:)`,
    );
  }
  if (parsed.hostname.length === 0) {
    throw new FoxgloveProtocolError('URL must include a host');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new FoxgloveProtocolError('URL must not embed credentials');
  }
  return parsed;
}

type Listener<T> = (payload: T) => void;

class Emitter {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends keyof FoxgloveClientEvents>(
    event: K,
    listener: Listener<FoxgloveClientEvents[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  emit<K extends keyof FoxgloveClientEvents>(event: K, payload: FoxgloveClientEvents[K]): void {
    const set = this.listeners.get(event);
    if (set === undefined) return;
    for (const listener of [...set]) {
      (listener as Listener<FoxgloveClientEvents[K]>)(payload);
    }
  }
}

interface ActiveSubscription {
  subscriptionId: number;
  channelId: number;
  topic: string;
}

export class FoxgloveClient {
  readonly url: string;
  private readonly subprotocols: readonly string[];
  private readonly reconnectOptions: ReconnectOptions | null;
  private readonly connectTimeoutMs: number;
  private readonly factory: (url: string, protocols: string[]) => WebSocketLike;
  private readonly now: () => number;
  private readonly emitter = new Emitter();

  private socket: WebSocketLike | null = null;
  private currentState: ConnectionState = 'idle';
  private serverInfoValue: ServerInfo | null = null;
  private negotiatedSubprotocol: string | null = null;

  private readonly channelMap = new Map<number, Channel>();
  private readonly subscriptions = new Map<number, ActiveSubscription>();
  private readonly topicToSubscription = new Map<string, number>();
  private readonly desiredTopics = new Set<string>();
  private readonly schemaCache = new Map<number, MsgSchema>();

  private nextSubscriptionId = 1;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private channelsAdvertised = false;

  private readonly counters: ClientStats = {
    messagesReceived: 0,
    bytesReceived: 0,
    framesReceived: 0,
    decodeErrors: 0,
    connects: 0,
    reconnects: 0,
    lastMessageAt: null,
  };

  constructor(options: FoxgloveClientOptions) {
    this.url = validateConnectionUrl(options.url).toString();
    this.subprotocols = options.subprotocols ?? SUPPORTED_SUBPROTOCOLS;
    if (this.subprotocols.length === 0) {
      throw new FoxgloveProtocolError('at least one subprotocol must be offered');
    }
    const reconnect = options.reconnect ?? {};
    this.reconnectOptions =
      reconnect === false
        ? null
        : { ...DEFAULT_RECONNECT, ...reconnect };
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.factory =
      options.webSocketFactory ??
      ((url, protocols) =>
        new WebSocket(url, protocols) as unknown as WebSocketLike);
  }

  // -- observable state ---------------------------------------------------
  get state(): ConnectionState {
    return this.currentState;
  }

  get serverInfo(): ServerInfo | null {
    return this.serverInfoValue;
  }

  get subprotocol(): string | null {
    return this.negotiatedSubprotocol;
  }

  get stats(): Readonly<ClientStats> {
    return this.counters;
  }

  get channels(): Channel[] {
    return [...this.channelMap.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  }

  get topics(): TopicInfo[] {
    return this.channels.map((channel) => ({
      name: channel.topic,
      channelId: channel.id,
      schemaName: channel.schemaName,
      encoding: channel.encoding,
      schemaEncoding: channel.schemaEncoding,
      schema: channel.schema,
      ...(channel.metadata === undefined ? {} : { metadata: channel.metadata }),
    }));
  }

  get subscribedTopics(): string[] {
    return [...this.desiredTopics];
  }

  on<K extends keyof FoxgloveClientEvents>(
    event: K,
    listener: Listener<FoxgloveClientEvents[K]>,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  // -- lifecycle ---------------------------------------------------------
  /** Open the connection; resolves once the socket is open. */
  async connect(): Promise<void> {
    if (this.currentState === 'connecting' || this.currentState === 'connected') {
      throw new FoxgloveProtocolError(`connect() called while state is ${this.currentState}`);
    }
    this.closedByUser = false;
    this.setState('connecting');
    return this.openSocket();
  }

  /** Close permanently; cancels reconnects. */
  close(reason = 'client closed'): void {
    this.closedByUser = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.setState('closed', reason);
    if (socket !== null) {
      try {
        socket.close(1000, reason);
      } catch {
        /* already closed */
      }
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private setState(state: ConnectionState, reason?: string): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.emitter.emit('stateChange', { state, ...(reason === undefined ? {} : { reason }) });
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: WebSocketLike;
      try {
        socket = this.factory(this.url, [...this.subprotocols]);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      socket.binaryType = 'arraybuffer';
      this.socket = socket;

      let settled = false;
      const settleOk = (): void => {
        if (settled) return;
        settled = true;
        if (this.connectTimer !== null) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        resolve();
      };
      const settleErr = (error: Error): void => {
        if (settled) return;
        settled = true;
        if (this.connectTimer !== null) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        reject(error);
      };

      this.connectTimer = setTimeout(() => {
        settleErr(
          new FoxgloveProtocolError(
            `connection to ${this.url} timed out after ${this.connectTimeoutMs}ms`,
          ),
        );
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }, this.connectTimeoutMs);
      (this.connectTimer as { unref?: () => void }).unref?.();

      socket.addEventListener('open', () => {
        this.negotiatedSubprotocol = socket.protocol.length > 0 ? socket.protocol : null;
        if (this.negotiatedSubprotocol === null) {
          settleErr(
            new FoxgloveProtocolError(
              'server did not negotiate a supported subprotocol; check that the robot runs foxglove_bridge',
            ),
          );
          this.close('subprotocol negotiation failed');
          return;
        }
        if (!this.subprotocols.includes(this.negotiatedSubprotocol)) {
          settleErr(
            new FoxgloveProtocolError(
              `server selected unsupported subprotocol "${this.negotiatedSubprotocol}"`,
            ),
          );
          this.close('unsupported subprotocol');
          return;
        }
        this.counters.connects += 1;
        const wasReconnect = this.reconnectAttempt > 0;
        this.reconnectAttempt = 0;
        this.nextSubscriptionId = 1;
        this.subscriptions.clear();
        this.topicToSubscription.clear();
        this.channelMap.clear();
        this.schemaCache.clear();
        this.channelsAdvertised = false;
        this.setState('connected');
        if (wasReconnect) {
          this.counters.reconnects += 1;
          this.emitter.emit('reconnected', { attempts: this.counters.reconnects });
        }
        settleOk();
      });

      socket.addEventListener('message', (event) => {
        this.handleMessage(event as MessageEvent);
      });

      socket.addEventListener('error', () => {
        // The close event that follows carries the actionable information, and
        // an intentional close() is not an error condition.
        if (this.closedByUser || this.socket !== socket) return;
        this.emitter.emit('error', new Error(`WebSocket error on ${this.url}`));
      });

      socket.addEventListener('close', (event) => {
        const closeEvent = event as CloseEvent;
        if (this.socket === socket) this.socket = null;
        this.channelMap.clear();
        this.subscriptions.clear();
        this.topicToSubscription.clear();
        this.schemaCache.clear();
        const detail = `code=${closeEvent.code ?? '?'} reason=${JSON.stringify(closeEvent.reason ?? '')}`;
        if (this.closedByUser) {
          this.setState('closed', detail);
          settleErr(new FoxgloveProtocolError(`connection closed during connect (${detail})`));
          return;
        }
        this.setState('disconnected', detail);
        settleErr(new FoxgloveProtocolError(`connection closed during connect (${detail})`));
        this.scheduleReconnect(detail);
      });
    });
  }

  private scheduleReconnect(reason: string): void {
    if (this.reconnectOptions === null) return;
    if (this.reconnectAttempt >= this.reconnectOptions.maxAttempts) {
      this.setState('closed', `reconnect attempts exhausted (${reason})`);
      return;
    }
    this.reconnectAttempt += 1;
    const { initialDelayMs, maxDelayMs, factor, jitterMs } = this.reconnectOptions;
    const base = Math.min(maxDelayMs, initialDelayMs * factor ** (this.reconnectAttempt - 1));
    const delay = base + Math.random() * jitterMs;
    this.setState('reconnecting', `attempt ${this.reconnectAttempt} in ${Math.round(delay)}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closedByUser) return;
      void this.openSocket().catch((error: unknown) => {
        this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
      });
    }, delay);
    (this.reconnectTimer as { unref?: () => void }).unref?.();
  }

  // -- inbound frames ----------------------------------------------------
  private handleMessage(event: MessageEvent): void {
    this.counters.framesReceived += 1;
    const data = event.data;
    if (typeof data === 'string') {
      this.handleJson(data);
      return;
    }
    try {
      const frame = decodeBinaryFrame(data as ArrayBuffer);
      switch (frame.kind) {
        case 'messageData': {
          const subscription = this.subscriptions.get(frame.subscriptionId);
          if (subscription === undefined) {
            // Late frame for a subscription we just cancelled; harmless.
            return;
          }
          const channel = this.channelMap.get(subscription.channelId);
          if (channel === undefined) return;
          this.counters.messagesReceived += 1;
          this.counters.bytesReceived += frame.payload.byteLength;
          this.counters.lastMessageAt = this.now();
          const message: MessageDataEvent = {
            subscriptionId: frame.subscriptionId,
            channelId: subscription.channelId,
            topic: subscription.topic,
            schemaName: channel.schemaName,
            encoding: channel.encoding,
            schemaEncoding: channel.schemaEncoding,
            logTime: frame.logTime,
            receiveTime: BigInt(this.now()) * 1_000_000n,
            payload: frame.payload,
          };
          this.emitter.emit('message', message);
          return;
        }
        case 'time':
          this.emitter.emit('time', { timestamp: frame.timestamp });
          return;
        default:
          return;
      }
    } catch (error) {
      this.counters.decodeErrors += 1;
      const wrapped =
        error instanceof FrameDecodeError
          ? error
          : new Error(`failed to decode binary frame: ${String(error)}`);
      this.emitter.emit('error', wrapped);
    }
  }

  private handleJson(text: string): void {
    let message: { op?: string };
    try {
      message = JSON.parse(text) as { op?: string };
    } catch {
      this.emitter.emit('error', new FoxgloveProtocolError('server sent unparsable JSON'));
      return;
    }

    switch (message.op) {
      case 'serverInfo': {
        const info = message as ServerInfo;
        this.serverInfoValue = info;
        this.emitter.emit('serverInfo', info);
        return;
      }
      case 'advertise': {
        const { channels } = message as { channels: ChannelAdvertisement[] };
        const complete: Channel[] = [];
        for (const advertisement of channels) {
          if (typeof advertisement.schema !== 'string' || advertisement.schema.length === 0) {
            this.emitter.emit(
              'error',
              new FoxgloveProtocolError(
                `channel ${advertisement.id} (${advertisement.topic}) was advertised without an inline schema; ` +
                  'the schema-table subprotocol (foxglove.sdk.v1.1) is not implemented yet',
              ),
            );
            continue;
          }
          const channel: Channel = {
            ...advertisement,
            schema: advertisement.schema,
            schemaEncoding: advertisement.schemaEncoding ?? '',
          };
          this.channelMap.set(channel.id, channel);
          complete.push(channel);
        }
        this.channelsAdvertised = true;
        if (complete.length > 0) this.emitter.emit('advertise', complete);
        this.syncSubscriptions();
        return;
      }
      case 'unadvertise': {
        const { channelIds } = message as { channelIds: number[] };
        for (const id of channelIds) {
          this.channelMap.delete(id);
          this.schemaCache.delete(id);
        }
        for (const [subscriptionId, subscription] of this.subscriptions) {
          if (channelIds.includes(subscription.channelId)) {
            this.subscriptions.delete(subscriptionId);
            this.topicToSubscription.delete(subscription.topic);
          }
        }
        this.emitter.emit('unadvertise', channelIds);
        return;
      }
      case 'status': {
        this.emitter.emit('status', message as StatusMessage);
        return;
      }
      default: {
        // advertiseServices / connectionGraphUpdate / removeStatus are recorded
        // but do not affect the data plane yet.
        return;
      }
    }
  }

  // -- subscriptions -----------------------------------------------------
  /** Subscribe to a topic, resubscribing automatically after a reconnect. */
  subscribe(topic: string): void {
    this.desiredTopics.add(topic);
    this.syncSubscriptions();
  }

  unsubscribe(topic: string): void {
    this.desiredTopics.delete(topic);
    const subscriptionId = this.topicToSubscription.get(topic);
    if (subscriptionId === undefined) return;
    this.topicToSubscription.delete(topic);
    this.subscriptions.delete(subscriptionId);
    this.sendJson({ op: 'unsubscribe', subscriptionIds: [subscriptionId] });
  }

  private syncSubscriptions(): void {
    if (this.socket === null || this.currentState !== 'connected') return;
    for (const topic of this.desiredTopics) {
      if (this.topicToSubscription.has(topic)) continue;
      const channel = this.channels.find((c) => c.topic === topic);
      if (channel === undefined) continue;
      const subscriptionId = this.nextSubscriptionId;
      this.nextSubscriptionId += 1;
      this.subscriptions.set(subscriptionId, {
        subscriptionId,
        channelId: channel.id,
        topic,
      });
      this.topicToSubscription.set(topic, subscriptionId);
      this.sendJson({ op: 'subscribe', subscriptions: [{ id: subscriptionId, channelId: channel.id }] });
    }
  }

  private sendJson(message: unknown): void {
    if (this.socket === null) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Send a raw client message-data frame (client publish is disabled by default). */
  publish(channelId: number, payload: Uint8Array): void {
    if (this.socket === null) {
      throw new FoxgloveProtocolError('cannot publish while disconnected');
    }
    this.socket.send(encodeClientMessageData(channelId, payload));
  }

  // -- helpers -----------------------------------------------------------
  /** Parse (and cache) the `.msg` schema of a channel. */
  getSchema(channelId: number): MsgSchema | null {
    const cached = this.schemaCache.get(channelId);
    if (cached !== undefined) return cached;
    const channel = this.channelMap.get(channelId);
    if (channel === undefined) return null;
    if (channel.schemaEncoding !== 'ros2msg') return null;
    const parsed = parseMsgDefinitionText(channel.schemaName, channel.schema);
    this.schemaCache.set(channelId, parsed);
    return parsed;
  }

  getChannelByTopic(topic: string): Channel | null {
    return this.channels.find((c) => c.topic === topic) ?? null;
  }

  waitForState(state: ConnectionState, timeoutMs = 10_000): Promise<void> {
    if (this.currentState === state) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new FoxgloveProtocolError(`timed out waiting for state "${state}"`));
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();
      const off = this.on('stateChange', ({ state: next }) => {
        if (next !== state) return;
        clearTimeout(timer);
        off();
        resolve();
      });
    });
  }

  /** Resolve once the server has advertised at least one channel. */
  waitForChannels(timeoutMs = 10_000): Promise<Channel[]> {
    if (this.channelsAdvertised) return Promise.resolve(this.channels);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new FoxgloveProtocolError('timed out waiting for channel advertisements'));
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();
      const off = this.on('advertise', () => {
        clearTimeout(timer);
        off();
        resolve(this.channels);
      });
    });
  }

  waitForServerInfo(timeoutMs = 10_000): Promise<ServerInfo> {
    if (this.serverInfoValue !== null) return Promise.resolve(this.serverInfoValue);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new FoxgloveProtocolError('timed out waiting for serverInfo'));
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();
      const off = this.on('serverInfo', (info) => {
        clearTimeout(timer);
        off();
        resolve(info);
      });
    });
  }
}
