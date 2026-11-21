import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const executable = process.argv[2];
if (!executable) throw new Error('Expected Electron runtime');
const root = await mkdtemp(join(tmpdir(), 'labscope-m23-ui-'));
try {
  const child = spawn(executable, [root, '--user-data-dir=' + join(root, 'profile'), '--enable-logging=stderr'], { stdio: ['ignore','pipe','inherit'], windowsHide: true });
  let out = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (c) => { out += c; process.stdout.write(c); });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const [code] = await once(child, 'close'); assert.equal(code, 0);
    const line = out.split(/\r?\n/).find((x) => x.startsWith('M23_UI_RESULT '));
    assert.ok(line);
  } finally { clearTimeout(timer); }
} finally { await rm(root, { recursive:true, force:true, maxRetries:4 }); }
