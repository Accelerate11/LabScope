// Dump advertised channel schemas from a live bridge to disk for inspection.
// Usage: node dump_schemas.mjs ws://host:8765 outDir
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'ws://127.0.0.1:8765';
const outDir = process.argv[3] ?? 'docs/m0/artifacts/schemas';
mkdirSync(outDir, { recursive: true });

const ws = new WebSocket(url, ['foxglove.sdk.v1']);
ws.binaryType = 'arraybuffer';

ws.addEventListener('message', (ev) => {
  if (typeof ev.data !== 'string') return;
  const msg = JSON.parse(ev.data);
  if (msg.op === 'advertise') {
    for (const ch of msg.channels) {
      const safe = ch.topic.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || `channel_${ch.id}`;
      const file = join(outDir, `${safe}.${ch.schemaName.replace(/\//g, '_')}.${ch.schemaEncoding}.txt`);
      writeFileSync(file, ch.schema, 'utf8');
      console.log(`wrote ${file} (${ch.schema.length} bytes) topic=${ch.topic}`);
    }
  }
});

setTimeout(() => process.exit(0), 3000);
