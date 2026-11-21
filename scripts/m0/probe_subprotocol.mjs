// Probe which WebSocket subprotocol(s) the real bridge accepts.
// Usage: node probe_subprotocol.mjs ws://host:8765

const url = process.argv[2] ?? 'ws://127.0.0.1:8765';
const candidates = [
  ['foxglove.websocket.v1'],
  ['foxglove.websocket.v2'],
  ['foxglove.websocket.v1', 'foxglove.websocket.v2'],
  ['foxglove.websocket.v2', 'foxglove.websocket.v1'],
  [],
];

function attempt(protocols) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {}
      resolve(result);
    };
    let ws;
    try {
      ws = new WebSocket(url, protocols);
    } catch (e) {
      resolve({ protocols, outcome: 'threw', detail: String(e) });
      return;
    }
    ws.binaryType = 'arraybuffer';
    const timer = setTimeout(() => finish({ protocols, outcome: 'timeout' }), 6000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      console.log(
        `OPEN protocols=${JSON.stringify(protocols)} negotiated=${JSON.stringify(ws.protocol)}`,
      );
    });
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        const m = JSON.parse(ev.data);
        if (m.op === 'serverInfo') {
          console.log('  serverInfo:', JSON.stringify(m));
          finish({ protocols, outcome: 'serverInfo', negotiated: ws.protocol });
        }
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      finish({ protocols, outcome: 'error' });
    });
    ws.addEventListener('close', (e) => {
      clearTimeout(timer);
      finish({ protocols, outcome: 'closed', code: e.code, reason: e.reason });
    });
  });
}

for (const p of candidates) {
  const r = await attempt(p);
  if (r.outcome !== 'serverInfo') {
    console.log(
      `FAIL protocols=${JSON.stringify(p)} outcome=${r.outcome} code=${r.code ?? '-'} reason=${JSON.stringify(r.reason ?? '')}`,
    );
  } else {
    console.log(`OK   protocols=${JSON.stringify(p)} negotiated=${r.negotiated}`);
  }
  await new Promise((r2) => setTimeout(r2, 300));
}
process.exit(0);
