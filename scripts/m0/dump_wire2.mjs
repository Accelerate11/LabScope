// Wire dump against the SDK-based foxglove_bridge (>= 3.x).
// Usage: node dump_wire2.mjs ws://host:8765 <subprotocol> [topic]
// Errors in the config are printed, not thrown.

const url = process.argv[2] ?? 'ws://127.0.0.1:8765';
const proto = process.argv[3] ?? 'foxglove.sdk.v1';
const wantTopic = process.argv[4] ?? '/imu/data';

const channels = new Map();
let subscribed = false;
let received = 0;

const t0 = Date.now();
const ws = new WebSocket(url, [proto]);
ws.binaryType = 'arraybuffer';

ws.addEventListener('open', () => {
  console.log(`[open] proto=${ws.protocol} in ${Date.now() - t0}ms`);
});

ws.addEventListener('error', () => {
  console.log('[error] websocket error (handshake or transport)');
});

ws.addEventListener('close', (e) => {
  console.log(`[close] code=${e.code} reason=${JSON.stringify(e.reason)}`);
  process.exit(0);
});

ws.addEventListener('message', (ev) => {
  if (typeof ev.data === 'string') {
    const msg = JSON.parse(ev.data);
    switch (msg.op) {
      case 'serverInfo':
        console.log('[serverInfo]', JSON.stringify(msg, null, 2));
        break;
      case 'advertise':
        for (const ch of msg.channels) channels.set(ch.id, ch);
        console.log(`[advertise] ${msg.channels.length} channel(s)`);
        for (const ch of msg.channels) {
          const schemaLen = ch.schema ? ch.schema.length : 0;
          const inline = ch.schema ? 'inline' : `schemaId=${ch.schemaId ?? ch.schema_id ?? '?'}`;
          console.log(
            `  id=${ch.id} topic=${ch.topic} enc=${ch.encoding} schemaEnc=${ch.schemaEncoding} name=${ch.schemaName} schemaLen=${schemaLen} ${inline}`,
          );
        }
        maybeSubscribe();
        break;
      case 'status':
        console.log(`[status] level=${msg.level} id=${msg.id ?? '-'} msg=${msg.message}`);
        break;
      case 'advertiseServices':
        console.log(`[advertiseServices] ${msg.services?.length ?? 0}`);
        break;
      case 'schema':
      case 'schemas':
      case 'schemaTable':
        console.log('[schema-table op]', msg.op, JSON.stringify(msg).slice(0, 400));
        break;
      default:
        console.log('[text]', msg.op, JSON.stringify(msg).slice(0, 300));
    }
    return;
  }
  const buf = new Uint8Array(ev.data);
  const dv = new DataView(ev.data);
  const opcode = buf[0];
  if (opcode === 0x01) {
    const subId = dv.getUint32(1, true);
    const logTime = dv.getBigUint64(5, true);
    const payload = new Uint8Array(ev.data, 13);
    received++;
    if (received <= 2) {
      console.log(
        `[msgData] sub=${subId} logTime=${logTime} len=${payload.length} hex=${Buffer.from(payload.slice(0, 32)).toString('hex')}`,
      );
    }
    if (received === 4) ws.close();
  } else if (opcode === 0x02) {
    console.log('[time]', dv.getBigUint64(1, true).toString());
  } else {
    console.log(`[binary] op=0x${opcode.toString(16)} len=${buf.length} hex=${Buffer.from(buf.slice(0, 40)).toString('hex')}`);
  }
});

function maybeSubscribe() {
  if (subscribed) return;
  const ch = [...channels.values()].find((c) => c.topic === wantTopic);
  if (!ch) return;
  subscribed = true;
  console.log(`[subscribe] channel ${ch.id} topic=${wantTopic}`);
  ws.send(JSON.stringify({ op: 'subscribe', subscriptions: [{ id: 1, channelId: ch.id }] }));
}

setTimeout(() => {
  console.log(`[exit] messages=${received}`);
  process.exit(0);
}, 12000);
