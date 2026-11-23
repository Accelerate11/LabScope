import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function checkRenderer(bridgeUrl) {
  const wait = async (get) => {
    for (let i = 0; i < 60; i += 1) {
      const result = await get();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for rendered or persisted state');
  };
  const button = (name) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === name);

  const api = await wait(() => window.labscope);
  (await wait(() => button('实时'))).click();
  await wait(() => document.querySelector('input')?.outerHTML && document.body.innerText.includes('连接'));
  if (!document.createElement('canvas').getContext('webgl2')) throw new Error('WebGL2 unavailable');
  await api.connect(bridgeUrl);
  await wait(async () => (await api.getStatus()).state === 'connected');

  const topic = '/imu/data';
  const recording = await api.recordingStart({ name: 'Release simulation', project: 'ReleaseQA', compression: 'none' }, [topic]);
  const telemetry = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('No recording telemetry')); }, 6000);
    const off = api.onTelemetry((data) => {
      if (data.topics.some((entry) => entry.topic === topic && entry.sample)) {
        clearTimeout(timer);
        off();
        resolve(true);
      }
    });
  });
  await api.subscribe([topic]);
  await telemetry;
  await api.recordingStop();
  await api.disconnect();
  const saved = await wait(async () => (await api.recordingList()).find((item) => item.experimentId === recording.experimentId));
  if (!saved.segments.some((segment) => segment.messageCount > 0 && segment.sha256)) {
    throw new Error('The recording lacked a finalized, checksummed MCAP segment');
  }

  (await wait(() => button('AI 分析'))).click();
  await wait(() => document.querySelector('input[placeholder="API Base URL"]') &&
    [...document.querySelectorAll('option')].some((option) => option.textContent.includes('Local Mock Provider')));
  await wait(() => button('请求模型解释') && !button('请求模型解释').disabled);
  button('请求模型解释').click();
  await wait(() => document.body.innerText.includes('Local Mock Analysis'));
  button('运行本地确定性分析').click();
  await wait(() => document.body.innerText.includes('Deterministic experiment analysis completed.') ||
    [...document.querySelectorAll('pre')].some((pre) => pre.textContent.includes('"experimentId"')));
  return { recording: saved.experimentId, webgl2: true, localMock: true };
}

export async function testReleaseRenderer(executable, bridgeUrl) {
  const profile = await mkdtemp(join(tmpdir(), 'labscope-release-smoke-'));
  const child = spawn(executable, [
    '--user-data-dir=' + profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
  ], { stdio: 'ignore', windowsHide: true });
  const exit = once(child, 'close');
  let socket;
  try {
    let page;
    for (let i = 0; i < 120 && !page; i += 1) {
      assert.equal(child.exitCode, null, 'Packaged Electron must stay open during the test');
      try {
        const port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
        page = (await response.json()).find((target) => target.type === 'page' && target.url.startsWith('file:'));
      } catch {
        // The debugging endpoint is written once the desktop process starts.
      }
      if (!page) await delay(100);
    }
    assert.ok(page, 'Expected packaged renderer');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await once(socket, 'open');
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged renderer acceptance timed out')), 60_000);
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.error || message.result.exceptionDetails) {
          reject(new Error(message.error?.message ?? message.result.exceptionDetails.exception.description));
        } else {
          resolve(message.result.result.value);
        }
      });
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression: `(${checkRenderer})(${JSON.stringify(bridgeUrl)})`,
        awaitPromise: true, returnByValue: true,
      } }));
    });
    assert.deepEqual([result.webgl2, result.localMock], [true, true]);
    console.log('PASS packaged ROS connection UI, WebGL2, indexed recording and AI Workspace with Local Mock');
  } finally {
    socket?.close();
    child.kill();
    await exit;
    await rm(profile, { recursive: true, force: true, maxRetries: 4 });
  }
}
