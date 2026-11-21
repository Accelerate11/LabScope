import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executable = process.argv[2];
if (!executable) throw new Error('Expected the packaged LabScope executable path');
const profile = await mkdtemp(join(tmpdir(), 'labscope-simulation-smoke-'));
const child = spawn(executable, ['--smoke-simulation', '--user-data-dir=' + profile, '--enable-logging=stderr'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  windowsHide: true,
});
let stdout = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});
const timeout = setTimeout(() => child.kill(), 60_000);
try {
  const [code, signal] = await once(child, 'close');
  assert.equal(signal, null);
  assert.equal(code, 0);
  const line = stdout.split(/\r?\n/).find((row) => row.startsWith('SIMULATION_SMOKE_RESULT '));
  assert.ok(line);
  assert.deepEqual(JSON.parse(line.slice('SIMULATION_SMOKE_RESULT '.length)), { passed: true, liveSession: 'idle' });
} finally {
  clearTimeout(timeout);
  await rm(profile, { recursive: true, force: true, maxRetries: 4 });
}
