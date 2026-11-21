import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executable = process.argv[2];
const endurance = Number(process.argv[3] ?? 300);
const full = process.argv[4] === 'full';
if (!executable || !Number.isInteger(endurance) || endurance < 0 || endurance > 3600) {
  throw new Error('Expected the packaged LabScope executable path and 0–3600 endurance seconds');
}
const profile = await mkdtemp(join(tmpdir(), 'labscope-pointcloud-smoke-'));
try {
  const child = spawn(executable, ['--smoke-pointcloud=' + endurance, '--user-data-dir=' + profile, '--enable-logging=stderr',
    ...(full ? ['--full-3d'] : [])], {
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  const timeout = setTimeout(() => child.kill(), (endurance + 150) * 1000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null);
    assert.equal(code, 0);
    const lines = stdout.split(/\r?\n/);
    const result = lines.find((line) => line.startsWith('POINTCLOUD_RESULT '));
    assert.deepEqual(JSON.parse(result?.slice('POINTCLOUD_RESULT '.length) ?? 'null'), { cleared: true, released: true });
    const samples = lines.filter((line) => line.startsWith('POINTCLOUD_SAMPLE '))
      .map((line) => JSON.parse(line.slice('POINTCLOUD_SAMPLE '.length)));
    assert.deepEqual(samples.map(({ count }) => count), endurance ? [10000, 50000, 100000, 500000, 100000]
      : [10000, 50000, 100000, 500000]);
    if (full) {
      assert.equal(lines.filter((line) => line.startsWith('SPATIAL_SCENE ')).length, 4);
      if (endurance) {
        const last = samples.at(-1);
        assert.equal(last.fullScene, true);
        assert.ok(last.elapsedMs >= endurance * 1000);
        assert.ok(last.samples.every(({ scene, fixedFrame }) => fixedFrame === 'map' && scene.some(({ markers, visibleFrames }) =>
          markers === 7 && visibleFrames >= 7)));
        const allocations = last.samples.map(({ layers }) => layers[0].allocations);
        assert.equal(Math.max(...allocations), Math.min(...allocations));
      }
    }
    for (const sample of samples) {
      assert.ok(sample.samples.every(({ points, queuePeak }) => points === sample.count && queuePeak <= 3));
      assert.ok(sample.samples.some(({ samples, uploadSubmitMs }) => samples > 0 && uploadSubmitMs !== null));
      assert.ok(sample.samples.some(({ fps, frames }) => fps > 0 && frames > 0));
      if (sample.count === 100_000) {
        const frames = sample.samples.reduce((sum, row) => sum + row.frames, 0);
        const elapsed = sample.samples.reduce((sum, row) => sum + row.frames * row.frameMs, 0);
        assert.ok(frames * 1000 / elapsed >= 30, '100k draw target is 30 FPS');
      }
    }
  } finally {
    clearTimeout(timeout);
  }
} finally {
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
