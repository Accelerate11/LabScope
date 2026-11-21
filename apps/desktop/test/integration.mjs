import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { WebSocketServer } from 'ws';

const fixtures = new URL('../../../packages/ros-schema/test/fixtures/', import.meta.url);
const sensors = [
  { id: 1, topic: '/imu/data', name: 'sensor_msgs/msg/Imu', schema: 'imu', payload: 'imu_data' },
  { id: 2, topic: '/livox/lidar', name: 'sensor_msgs/msg/PointCloud2', schema: 'pointcloud2', payload: 'livox_lidar' },
];

const channels = await Promise.all(sensors.map(async (sensor) => ({
  id: sensor.id,
  topic: sensor.topic,
  schemaName: sensor.name,
  schemaEncoding: 'ros2msg',
  encoding: 'cdr',
  schema: await readFile(new URL(sensor.schema + '.ros2msg.txt', fixtures), 'utf8'),
})));
const samples = new Map(await Promise.all(sensors.map(async (sensor) => [
  sensor.id,
  await readFile(new URL(sensor.payload + '.payload.bin', fixtures)),
])));
const tfSchema = await readFile(new URL('../../../docs/m0/artifacts/schemas/tf.tf2_msgs_msg_TFMessage.ros2msg.txt', import.meta.url), 'utf8');
for (const [id, topic] of [[3, '/tf'], [4, '/tf_static']]) {
  channels.push({ id, topic, schemaName: 'tf2_msgs/msg/TFMessage', schemaEncoding: 'ros2msg', encoding: 'cdr', schema: tfSchema });
}

function transform(parent, child, stamp, xyz) {
  const bytes = Buffer.alloc(256);
  bytes[1] = 1;
  bytes.writeUInt32LE(1, 4);
  bytes.writeInt32LE(Number(stamp / 1_000_000_000n), 8);
  bytes.writeUInt32LE(Number(stamp % 1_000_000_000n), 12);
  let offset = 16;
  for (const value of [parent, child]) {
    offset = 4 + Math.ceil((offset - 4) / 4) * 4;
    const text = Buffer.from(value + '\0');
    bytes.writeUInt32LE(text.length, offset);
    offset += 4;
    text.copy(bytes, offset);
    offset += text.length;
  }
  offset = 4 + Math.ceil((offset - 4) / 8) * 8;
  for (const value of [...xyz, 0, 0, 0, 1]) {
    bytes.writeDoubleLE(value, offset);
    offset += 8;
  }
  return bytes.subarray(0, offset);
}
const cloud = samples.get(2);
const stamp = BigInt(cloud.readInt32LE(4)) * 1_000_000_000n + BigInt(cloud.readUInt32LE(8));
samples.set(3, [transform('map', 'base_link', stamp + 40_000_000n, [3, 0, 0]),
  transform('map', 'base_link', stamp - 40_000_000n, [1, 0, 0])]);
samples.set(4, transform('base_link', 'livox_frame', stamp, [0, 0, 0.85]));

const bridge = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(bridge, 'listening');
const wireRequests = [];
bridge.on('connection', (socket) => {
  socket.send(JSON.stringify({ op: 'serverInfo', name: 'LabScope loopback fixture', capabilities: [] }));
  socket.send(JSON.stringify({ op: 'advertise', channels }));
  socket.on('message', (message) => {
    const request = JSON.parse(message.toString());
    wireRequests.push(request);
    if (request.op !== 'subscribe') return;
    for (const { id, channelId } of request.subscriptions) {
      const payload = samples.get(channelId);
      if (payload === undefined) continue;
      for (const packet of Array.isArray(payload) ? payload : [payload]) {
        const frame = Buffer.alloc(13 + packet.length);
        frame[0] = 1;
        frame.writeUInt32LE(id, 1);
        frame.writeBigUInt64LE(1n, 5);
        packet.copy(frame, 13);
        socket.send(frame);
      }
    }
  });
});
const url = 'ws://127.0.0.1:' + bridge.address().port;

function waitForMessage(worker, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Timed out waiting for Worker response')), 8_000);
    const onMessage = (event) => { if (predicate(event)) finish(null, event); };
    function finish(error, event) {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', finish);
      if (error) reject(error);
      else resolve(event);
    }
    worker.on('message', onMessage);
    worker.once('error', finish);
  });
}

async function testWorker() {
  const worker = new Worker(new URL('../out/main/data-worker.js', import.meta.url));
  try {
    const discovery = waitForMessage(worker, (event) => event.type === 'status' && event.status.channels.length === channels.length);
    worker.postMessage({ type: 'connect', url });
    assert.equal((await discovery).status.subprotocol, 'foxglove.sdk.v1');

    const data = waitForMessage(worker, (event) => event.type === 'telemetry' &&
      event.payload.topics.filter((entry) => entry.sample !== undefined).length === 2);
    worker.postMessage({ type: 'subscribe', topics: sensors.map(({ topic }) => topic) });
    const { topics } = (await data).payload;
    const [imu, cloud] = sensors.map((sensor) => topics.find(({ topic }) => topic === sensor.topic));
    assert.equal(imu.sample.header.frame_id, 'imu_link');
    assert.equal(cloud.sample.width * cloud.sample.height, 20_000);
    assert.equal(imu.decodeErrors + cloud.decodeErrors, 0);

    const disconnected = waitForMessage(worker, (event) => event.type === 'status' && event.status.state === 'disconnected');
    worker.postMessage({ type: 'disconnect' });
    assert.deepEqual((await disconnected).status.subscribed, []);
    console.log('PASS Worker connected, decoded two captured sensors and disconnected');
  } finally {
    await worker.terminate();
  }
}

async function testPanelSubscriptions() {
  const worker = new Worker(new URL('../out/main/data-worker.js', import.meta.url));
  try {
    const since = wireRequests.length;
    const discovered = waitForMessage(worker, (event) => event.type === 'status' && event.status.channels.length === channels.length);
    worker.postMessage({ type: 'panel-topics', topics: ['/imu/data', '/livox/lidar'] });
    worker.postMessage({ type: 'connect', url });
    assert.deepEqual((await discovered).status.subscribed, ['/imu/data', '/livox/lidar']);
    const live = waitForMessage(worker, (event) => event.type === 'telemetry' &&
      event.payload.topics.every((entry) => entry.sampleSequence !== undefined) && event.payload.topics.length === 2);
    await live;
    worker.postMessage({ type: 'subscribe', topics: ['/imu/data'] });
    const retained = waitForMessage(worker, (event) => event.type === 'status' &&
      event.status.subscribed.length === 1 && event.status.subscribed[0] === '/imu/data');
    worker.postMessage({ type: 'panel-topics', topics: [] });
    await retained;
    const deadline = Date.now() + 4_000;
    while (!wireRequests.slice(since).some(({ op }) => op === 'unsubscribe') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const changes = wireRequests.slice(since);
    const requests = changes.filter(({ op }) => op === 'subscribe').flatMap(({ subscriptions }) => subscriptions);
    assert.deepEqual(requests.map(({ channelId }) => channelId), [1, 2]);
    assert.deepEqual(changes.filter(({ op }) => op === 'unsubscribe').flatMap(({ subscriptionIds }) => subscriptionIds),
      [requests.find(({ channelId }) => channelId === 2).id]);
    console.log('PASS Worker shares manual and panel ownership, and releases the panel-only topic on the wire');
  } finally {
    await worker.terminate();
  }
}

async function testSpatialWorker() {
  const worker = new Worker(new URL('../out/main/data-worker.js', import.meta.url));
  try {
    const event = waitForMessage(worker, (event) => event.type === 'telemetry' &&
      event.payload.topics.some((topic) => topic.topic === '/tf' && topic.spatialFrames?.length === 2) &&
      event.payload.topics.some((topic) => topic.topic === '/tf_static' && topic.spatialFrames?.length === 1));
    worker.postMessage({ type: 'panel-topics', topics: ['/tf', '/tf_static'] });
    worker.postMessage({ type: 'connect', url });
    const { topics } = (await event).payload;
    const [later, earlier] = topics.find(({ topic }) => topic === '/tf').spatialFrames;
    assert.equal(later.value.transforms[0].transform.translation.x, 3);
    assert.equal(earlier.value.transforms[0].transform.translation.x, 1);
    assert.notEqual(later.sequence, earlier.sequence);
    assert.equal(topics.find(({ topic }) => topic === '/tf_static').spatialFrames[0].value.transforms[0].child_frame_id, 'livox_frame');
    console.log('PASS Worker forwards both out-of-order TF samples and the static transform in a telemetry interval');
  } finally {
    await worker.terminate();
  }
}

async function testElectron(executable, profile, phase) {
  let stdout = '';
  const child = spawn(executable, ['--smoke', '--url', url, '--enable-logging=stderr',
    '--user-data-dir=' + profile, '--smoke-workspace=' + phase, '--smoke-spatial-workspace'], {
    env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:1/' },
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  const timeout = setTimeout(() => child.kill(), 45_000);
  try {
    const [exitCode, signal] = await once(child, 'close');
    assert.equal(signal, null);
    assert.equal(exitCode, 0);
    const result = stdout.split(/\r?\n/).find((line) => line.startsWith('SMOKE_RESULT '));
    assert.ok(result, 'Electron must produce SMOKE_RESULT');
    assert.equal(JSON.parse(result.slice('SMOKE_RESULT '.length)).passed, true);
    const layout = stdout.split(/\r?\n/).find((line) => line.startsWith('WORKSPACE_LAYOUT '));
    assert.ok(layout, 'Electron must produce WORKSPACE_LAYOUT');
    return JSON.parse(layout.slice('WORKSPACE_LAYOUT '.length));
  } finally {
    clearTimeout(timeout);
  }
}

async function testWorkspaceRestart(executable) {
  const profile = await mkdtemp(join(tmpdir(), 'labscope-workspace-smoke-'));
  try {
    const saved = await testElectron(executable, profile, 'save');
    const restored = await testElectron(executable, profile, 'restore');
    assert.deepEqual(restored, saved);
    console.log('PASS workspace layout and subscriptions restored in a fresh Electron process');
  } finally {
    await rm(profile, { recursive: true, force: true, maxRetries: 4 });
  }
}

try {
  await testWorker();
  await testPanelSubscriptions();
  await testSpatialWorker();
  if (process.argv[2]) await testWorkspaceRestart(process.argv[2]);
} finally {
  for (const socket of bridge.clients) socket.terminate();
  await new Promise((resolve, reject) => bridge.close((error) => error ? reject(error) : resolve()));
}
