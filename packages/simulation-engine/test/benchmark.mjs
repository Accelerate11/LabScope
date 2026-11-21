import { SimulationDataSource } from '../dist/index.js';

async function settledMemory() {
  // Let V8 finish deferred cleanup of ArrayBuffer backing stores between collections.
  global.gc();
  await new Promise((resolve) => setImmediate(resolve));
  global.gc();
  await new Promise((resolve) => setImmediate(resolve));
  return process.memoryUsage();
}

async function measure(pointCount, iterations, topics, stepMs, faults) {
  const latest = new Map();
  const source = new SimulationDataSource({
    setChannels() {}, reset() { latest.clear(); },
    hasSubscribers(_source, topic) { return topics.includes(topic); },
    publish(frame) { latest.set(frame.topic, frame); },
  }, { scenario: 'obstacle-scene', pointCount, seed: 42, faults });
  source.start();
  for (let index = 0; index < 5; index++) source.advance(stepMs);
  source.reset();
  source.start();
  const before = await settledMemory();
  let peakRss = before.rss, peakBuffers = before.arrayBuffers;
  const samples = [];
  for (let index = 0; index < iterations; index++) {
    const start = performance.now();
    source.advance(stepMs);
    samples.push(performance.now() - start);
    const usage = process.memoryUsage();
    peakRss = Math.max(peakRss, usage.rss);
    peakBuffers = Math.max(peakBuffers, usage.arrayBuffers);
  }
  const diagnostics = source.diagnostics;
  const totalMs = samples.reduce((sum, value) => sum + value, 0);
  samples.sort((a, b) => a - b);
  source.reset();
  latest.clear();
  const after = await settledMemory();
  return {
    topics, pointCount, iterations, stepMs, faults, ...diagnostics,
    generationMs: { total: totalMs, median: samples[Math.floor(samples.length / 2)],
      p95: samples[Math.ceil(samples.length * 0.95) - 1], max: samples.at(-1) },
    peakRssDeltaBytes: peakRss - before.rss,
    peakArrayBuffersDeltaBytes: peakBuffers - before.arrayBuffers,
    postResetArrayBuffersDeltaBytes: after.arrayBuffers - before.arrayBuffers,
    afterReset: { delayed: source.diagnostics.delayed, delayedBytes: source.diagnostics.delayedBytes,
      retainedTopics: latest.size },
  };
}

console.log(JSON.stringify({
  runtime: process.version,
  benchmark: [
    await measure(100_000, 300, ['/points'], 100, []),
    await measure(500_000, 100, ['/points'], 100, []),
    await measure(500_000, 100, ['/points'], 100, ['message-delay', 'burst-messages']),
    await measure(10_000, 100, ['/camera/color/image_raw', '/camera/depth/image_raw'], 200, []),
  ],
}, null, 2));
