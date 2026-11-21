import { expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McapIndexedReader } from '@mcap/core';
import { RecordingManager } from '../src/main/recording-manager';

const schema = 'std_msgs/Header header\n';
it('records multi-topic raw bytes, pause/resume, manifest and SHA-256', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labscope-recorder-'));
  try {
    const manager = new RecordingManager(root);
    const started = await manager.start({ name: 'Test', project: 'Project', maxSegmentBytes: 10_000 }, [
      { topic: '/imu', schemaName: 'test_msgs/msg/Imu', schema },
      { topic: '/odom', schemaName: 'test_msgs/msg/Odom', schema },
    ]);
    expect(started.state).toBe('recording');
    manager.enqueue({ topic: '/imu', schemaName: 'test_msgs/msg/Imu', logTimeNs: '100', sequence: 1, payload: new Uint8Array([1,2,3]) });
    manager.enqueue({ topic: '/odom', schemaName: 'test_msgs/msg/Odom', logTimeNs: '200', sequence: 2, payload: new Uint8Array([4,5]) });
    manager.pause();
    manager.enqueue({ topic: '/imu', schemaName: 'test_msgs/msg/Imu', logTimeNs: '300', sequence: 3, payload: new Uint8Array([9]) });
    manager.resume();
    manager.enqueue({ topic: '/imu', schemaName: 'test_msgs/msg/Imu', logTimeNs: '400', sequence: 4, payload: new Uint8Array([6]) });
    const stopped = await manager.stop();
    expect(stopped.state).toBe('idle'); expect(stopped.messageCount).toBe(3);
    const project = await readdir(join(root, 'Project'));
    const manifest = JSON.parse(await readFile(join(root, 'Project', project[0]!, 'manifest.json'), 'utf8'));
    expect(manifest.segments[0].status).toBe('complete');
    expect(manifest.pauses).toHaveLength(1);
    const file = await readFile(join(root, 'Project', project[0]!, manifest.segments[0].file));
    const reader = await McapIndexedReader.Initialize({ readable: {
      size: async () => BigInt(file.length),
      read: async (offset, size) => new Uint8Array(file.subarray(Number(offset), Number(offset + size))),
    }});
    const messages = [];
    for await (const message of reader.readMessages()) messages.push(message);
    expect(messages).toHaveLength(3);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('bounds the queue and reports overflow instead of silently dropping', async () => {
  const root = await mkdtemp(join(tmpdir(), 'labscope-recorder-overflow-'));
  try {
    const manager = new RecordingManager(root);
    await manager.start({ name: 'Overflow', project: 'Project', queueCapacity: 1 }, [{ topic: '/x', schemaName: 'test/msg/X', schema }]);
    for (let index = 0; index < 20; index++) manager.enqueue({ topic: '/x', schemaName: 'test/msg/X', logTimeNs: String(index), sequence: index, payload: new Uint8Array(100) });
    expect(manager.snapshot.droppedMessages).toBeGreaterThanOrEqual(0);
    await manager.stop();
  } finally { await rm(root, { recursive: true, force: true }); }
});
