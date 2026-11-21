import { afterEach, describe, expect, it, vi } from 'vitest';

import { FoxgloveClient, FoxgloveProtocolError, validateConnectionUrl } from '../src/client.ts';
import { MESSAGE_DATA_HEADER_BYTES } from '../src/framing.ts';
import type { Channel, MessageDataEvent } from '../src/types.ts';

/**
 * Scriptable stand-in for a WebSocket. The protocol client treats it exactly
 * like a browser/Node WebSocket; tests drive the server side of the protocol.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];
  protocol = '';
  binaryType = 'string';
  readonly sent: (string | Uint8Array)[] = [];
  closed = false;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  send(data: string | Uint8Array): void {
    if (this.closed) throw new Error('socket is closed');
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', { code, reason });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  // -- test-side server behavior -----------------------------------------
  serverOpen(protocol = 'foxglove.sdk.v1'): void {
    this.protocol = protocol;
    this.emit('open', {});
  }

  serverJson(message: unknown): void {
    this.emit('message', { data: JSON.stringify(message) });
  }

  serverMessageData(subscriptionId: number, logTime: bigint, payload: Uint8Array): void {
    const frame = new Uint8Array(MESSAGE_DATA_HEADER_BYTES + payload.byteLength);
    const view = new DataView(frame.buffer);
    frame[0] = 0x01;
    view.setUint32(1, subscriptionId, true);
    view.setBigUint64(5, logTime, true);
    frame.set(payload, MESSAGE_DATA_HEADER_BYTES);
    this.emit('message', { data: frame.buffer });
  }

  serverClose(code = 1006): void {
    this.closed = true;
    this.emit('close', { code, reason: '' });
  }

  serverError(): void {
    this.emit('error', {});
  }

  sentJson(): unknown[] {
    return this.sent
      .filter((item): item is string => typeof item === 'string')
      .map((item) => JSON.parse(item) as unknown);
  }
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 8,
    topic: '/imu/data',
    encoding: 'cdr',
    schemaName: 'sensor_msgs/msg/Imu',
    schemaEncoding: 'ros2msg',
    schema: 'uint32 sec\nuint32 nanosec',
    ...overrides,
  };
}

function createClient(overrides: { reconnectDelayMs?: number } = {}): FoxgloveClient {
  return new FoxgloveClient({
    url: 'ws://127.0.0.1:8765',
    reconnect: {
      initialDelayMs: overrides.reconnectDelayMs ?? 100,
      maxDelayMs: 400,
      factor: 2,
      jitterMs: 0,
      maxAttempts: 5,
    },
    connectTimeoutMs: 5_000,
    webSocketFactory: (url, protocols) => new FakeSocket(url, protocols) as never,
    now: () => 1_700_000_000_000,
  });
}

async function openAndAdvertise(client: FoxgloveClient, channels: Channel[] = [makeChannel()]): Promise<FakeSocket> {
  const connectPromise = client.connect();
  const socket = FakeSocket.instances.at(-1) as FakeSocket;
  socket.serverOpen();
  await connectPromise;
  socket.serverJson({ op: 'serverInfo', name: 'foxglove_bridge', capabilities: ['services'] });
  socket.serverJson({ op: 'advertise', channels });
  await Promise.resolve();
  return socket;
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
});

describe('validateConnectionUrl', () => {
  it('accepts ws and wss URLs', () => {
    expect(validateConnectionUrl('ws://127.0.0.1:8765').hostname).toBe('127.0.0.1');
    expect(validateConnectionUrl('wss://robot.local:8765').protocol).toBe('wss:');
  });

  it('rejects http(s), embedded credentials and garbage', () => {
    expect(() => validateConnectionUrl('http://127.0.0.1:8765')).toThrow(FoxgloveProtocolError);
    expect(() => validateConnectionUrl('ws://user:pass@127.0.0.1:8765')).toThrow(
      FoxgloveProtocolError,
    );
    expect(() => validateConnectionUrl('not a url')).toThrow(FoxgloveProtocolError);
  });
});

describe('FoxgloveClient handshake and discovery', () => {
  it('negotiates the SDK subprotocol and records serverInfo', async () => {
    const client = createClient();
    const socket = await openAndAdvertise(client);

    expect(client.state).toBe('connected');
    expect(client.subprotocol).toBe('foxglove.sdk.v1');
    expect(client.serverInfo?.name).toBe('foxglove_bridge');
    expect(socket.protocols).toEqual(['foxglove.sdk.v1', 'foxglove.websocket.v1']);
    expect(client.channels.map((c) => c.topic)).toEqual(['/imu/data']);
    expect(client.topics[0]?.schemaName).toBe('sensor_msgs/msg/Imu');
    client.close();
  });

  it('fails when the server does not negotiate a known subprotocol', async () => {
    const client = createClient();
    const connectPromise = client.connect();
    const socket = FakeSocket.instances.at(-1) as FakeSocket;
    socket.serverOpen('');
    await expect(connectPromise).rejects.toThrow(/subprotocol/);
  });

  it('emits an error for channels advertised without an inline schema', async () => {
    const client = createClient();
    const errors: Error[] = [];
    client.on('error', (error) => errors.push(error));
    await openAndAdvertise(client, [{ ...makeChannel(), schema: '' } as Channel]);

    expect(errors.at(-1)?.message).toMatch(/without an inline schema/);
    expect(client.channels).toEqual([]);
    client.close();
  });
});

describe('FoxgloveClient subscriptions', () => {
  it('subscribes by topic once the channel is advertised', async () => {
    const client = createClient();
    const socket = await openAndAdvertise(client);

    client.subscribe('/imu/data');
    const subscribeMessage = socket.sentJson().find((m) => (m as { op: string }).op === 'subscribe');
    expect(subscribeMessage).toEqual({ op: 'subscribe', subscriptions: [{ id: 1, channelId: 8 }] });

    // A second call must not duplicate the subscription.
    client.subscribe('/imu/data');
    expect(socket.sentJson().filter((m) => (m as { op: string }).op === 'subscribe')).toHaveLength(1);
    client.close();
  });

  it('routes message-data frames to the topic they belong to', async () => {
    const client = createClient();
    const socket = await openAndAdvertise(client);
    const received: MessageDataEvent[] = [];
    client.on('message', (message) => received.push(message));

    client.subscribe('/imu/data');
    socket.serverMessageData(1, 1_795_172_384_589_622_939n, new Uint8Array([0, 1, 0, 0, 42]));

    expect(received).toHaveLength(1);
    const message = received[0] as MessageDataEvent;
    expect(message.topic).toBe('/imu/data');
    expect(message.channelId).toBe(8);
    expect(message.encoding).toBe('cdr');
    expect(message.logTime).toBe(1_795_172_384_589_622_939n);
    expect(message.receiveTime).toBe(1_700_000_000_000_000_000n);
    expect(Array.from(message.payload)).toEqual([0, 1, 0, 0, 42]);
    expect(client.stats.messagesReceived).toBe(1);
    expect(client.stats.bytesReceived).toBe(5);
    client.close();
  });

  it('sends unsubscribe and stops routing messages', async () => {
    const client = createClient();
    const socket = await openAndAdvertise(client);
    const received: MessageDataEvent[] = [];
    client.on('message', (message) => received.push(message));

    client.subscribe('/imu/data');
    client.unsubscribe('/imu/data');
    socket.serverMessageData(1, 0n, new Uint8Array([1]));
    const unsubscribe = socket.sentJson().find((m) => (m as { op: string }).op === 'unsubscribe');
    expect(unsubscribe).toEqual({ op: 'unsubscribe', subscriptionIds: [1] });
    expect(received).toEqual([]);
    client.close();
  });

  it('drops subscriptions when a channel is unadvertised', async () => {
    const client = createClient();
    const socket = await openAndAdvertise(client);
    client.subscribe('/imu/data');
    socket.serverJson({ op: 'unadvertise', channelIds: [8] });
    await Promise.resolve();

    expect(client.channels).toEqual([]);
    // Re-advertised later: the stored topic intent triggers a fresh subscription.
    socket.serverJson({ op: 'advertise', channels: [makeChannel({ id: 12 })] });
    await Promise.resolve();
    const subscribes = socket.sentJson().filter((m) => (m as { op: string }).op === 'subscribe');
    expect(subscribes).toHaveLength(2);
    expect(subscribes[1]).toEqual({ op: 'subscribe', subscriptions: [{ id: 2, channelId: 12 }] });
    client.close();
  });
});

describe('FoxgloveClient reconnect', () => {
  it('reconnects with backoff and restores subscriptions on a new channel id', async () => {
    vi.useFakeTimers();
    const client = createClient({ reconnectDelayMs: 100 });
    const states: string[] = [];
    client.on('stateChange', ({ state }) => states.push(state));

    const socket = await openAndAdvertise(client);
    client.subscribe('/imu/data');
    const firstSubscription = socket.sentJson()[0];
    expect(firstSubscription).toBeDefined();

    socket.serverClose(1006);
    // The client reports the drop and immediately schedules a reconnect.
    expect(states).toContain('disconnected');
    expect(client.state).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(150);
    expect(client.state).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(400);
    const second = FakeSocket.instances.at(-1) as FakeSocket;
    expect(second).not.toBe(socket);
    second.serverOpen();
    second.serverJson({ op: 'serverInfo', name: 'foxglove_bridge' });
    second.serverJson({ op: 'advertise', channels: [makeChannel({ id: 21 })] });
    await vi.advanceTimersByTimeAsync(0);

    expect(client.state).toBe('connected');
    expect(states).toContain('reconnecting');
    const resubscribe = second
      .sentJson()
      .find((m) => (m as { op: string }).op === 'subscribe') as {
      subscriptions: { id: number; channelId: number }[];
    };
    expect(resubscribe.subscriptions[0]?.channelId).toBe(21);
    expect(client.stats.reconnects).toBe(1);
    expect(client.subscribedTopics).toEqual(['/imu/data']);
    client.close();
  });

  it('does not reconnect after an explicit close', async () => {
    vi.useFakeTimers();
    const client = createClient({ reconnectDelayMs: 50 });
    await openAndAdvertise(client);
    const socketCount = FakeSocket.instances.length;
    client.close();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeSocket.instances).toHaveLength(socketCount);
    expect(client.state).toBe('closed');
  });

  it('gives up after maxAttempts', async () => {
    vi.useFakeTimers();
    const client = createClient({ reconnectDelayMs: 10 });
    await openAndAdvertise(client);
    client.close('reset');
    FakeSocket.instances = [];

    const client2 = createClient({ reconnectDelayMs: 10 });
    const connectPromise = client2.connect();
    const socket = FakeSocket.instances.at(-1) as FakeSocket;
    socket.serverOpen();
    await connectPromise;
    socket.serverJson({ op: 'serverInfo' });
    socket.serverJson({ op: 'advertise', channels: [makeChannel()] });

    // Every reconnect attempt fails immediately at the transport level.
    for (let i = 0; i < 12; i += 1) {
      const current = FakeSocket.instances.at(-1) as FakeSocket | undefined;
      current?.serverClose(1006);
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(client2.state).toBe('closed');
  });
});
