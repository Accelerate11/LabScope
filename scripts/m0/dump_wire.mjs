// Exploratory wire-protocol dump against the real foxglove_bridge.
// Uses Node 24's built-in WebSocket (no dependencies).
// Usage: node dump_wire.mjs ws://host:8765 [topic]

const url = process.argv[2] ?? 'ws://127.0.0.1:8765';
const wantTopic = process.argv[3] ?? '/imu/data';

const WS_SUBPROTOCOL = 'foxglove.websocket.v1';

const ws = new WebSocket(url, [WS_SUBPROTOCOL]);
ws.binaryType = 'arraybuffer';

let channels = new Map();
let subscribeTimer = null;
let received = 0;

const t0 = Date.now();

ws.addEventListener('open', () => {
  console.log(`[open] ${url} proto=${ws.protocol || '(none)'} in ${Date.now() - t0}ms`);
  subscribeTimer = setTimeout(() => {
    console.log('[timeout] no subscribe happened');
    ws.close();
  }, 10000);
});

ws.addEventListener('error', (e) => {
  console.log('[error]', e.message ?? e.error?.message ?? String(e));
});

ws.addEventListener('close', (e) => {
  console.log(`[close] code=${e.code} reason=${JSON.stringify(e.reason)}`);
  process.exit(0);
});

ws.addEventListener('message', (ev) => {
  if (typeof ev.data === 'string') {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      console.log('[text unparsable]', ev.data.slice(0, 200));
      return;
    }
    switch (msg.op) {
      case 'serverInfo':
        console.log('[serverInfo]', JSON.stringify(msg, null, 2));
        break;
      case 'advertise':
        for (const ch of msg.channels) channels.set(ch.id, ch);
        console.log(`[advertise] ${msg.channels.length} channel(s)`);
        for (const ch of msg.channels) {
          console.log(
            `  id=${ch.id} topic=${ch.topic} encoding=${ch.encoding} schemaEncoding=${ch.schemaEncoding} schemaName=${ch.schemaName} schemaLen=${ch.schema?.length ?? 0}`,
          );
        }
        maybeSubscribe();
        break;
      case 'status':
        console.log(`[status] level=${msg.level} ${msg.message}`);
        break;
      case 'advertiseServices':
        console.log(
          `[advertiseServices] ${msg.services.length} service(s): ${msg.services
            .slice(0, 6)
            .map((s) => s.name)
            .join(', ')}`,
        );
        break;
      case 'connectionGraphUpdate':
        console.log(
          `[connectionGraphUpdate] published=${msg.publishedTopics?.length ?? 0} subscribed=${msg.subscribedTopics?.length ?? 0}`,
        );
        break;
      default:
        console.log('[text op]', msg.op, JSON.stringify(msg).slice(0, 200));
    }
    return;
  }
  // Binary frame
  const buf = new Uint8Array(ev.data);
  const dv = new DataView(ev.data);
  const opcode = buf[0];
  if (opcode === 0x01) {
    const subId = dv.getUint32(1, true);
    const logTime = dv.getBigUint64(5, true);
    const payload = new Uint8Array(ev.data, 13);
    received++;
    if (received <= 3) {
      console.log(
        `[msgData] subId=${subId} logTime=${logTime} payloadLen=${payload.length} head=${Buffer.from(
          payload.slice(0, 24),
        ).toString('hex')}`,
      );
    }
    if (received === 6) {
      console.log(`[msgData] received 6 messages, closing`);
      ws.close();
    }
  } else if (opcode === 0x02) {
    console.log(`[time] ${dv.getBigUint64(1, true)}`);
  } else {
    console.log(`[binary op] 0x${opcode.toString(16)} len=${buf.length}`);
  }
});

let subId = 0;
let subscribed = false;
function maybeSubscribe() {
  if (subscribed) return;
  if (subscribeTimer) {
    clearTimeout(subscribeTimer);
    subscribeTimer = null;
  }
  const ch = [...channels.values()].find((c) => c.topic === wantTopic);
  if (!ch) {
    console.log(`[subscribe] topic ${wantTopic} not advertised (yet)`);
    return;
  }
  subscribed = true;
  console.log(`[subscribe] channel ${ch.id} (${wantTopic}) as subscription ${subId}`);
  ws.send(JSON.stringify({ op: 'subscribe', subscriptions: [{ id: subId, channelId: ch.id }] }));
  subId++;
}

setTimeout(() => {
  console.log(`[exit] total messages=${received}`);
  process.exit(0);
}, 15000);
