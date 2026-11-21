import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [executable, file] = process.argv.slice(2);
if (!executable || !file) throw new Error('Expected LabScope.exe and an indexed ROS 2 MCAP fixture');
const profile = await mkdtemp(join(tmpdir(), 'labscope-mcap-ui-'));
const child = spawn(executable, ['--smoke-mcap=' + resolve(file), '--user-data-dir=' + profile, '--enable-logging=stderr'],
  { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
let stdout = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
const timer = setTimeout(() => child.kill(), 60_000);
try {
  const [code, signal] = await once(child, 'close');
  assert.equal(signal, null);
  assert.equal(code, 0);
  assert.ok(stdout.includes('MCAP_SMOKE_RESULT {"passed":true'));
} finally {
  clearTimeout(timer);
  await rm(profile, { recursive: true, force: true, maxRetries: 4 });
}
