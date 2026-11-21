/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference path="../renderer/src/env.d.ts" />

import type { App, BrowserWindow } from 'electron';
import type { ViewerStats } from '../renderer/src/pointcloud/viewer-engine';

type Command = 'setup' | 'overlay' | 'prepare' | 'full' | 'faults' | 'sample' | 'close';

// Serialized into the actual packaged renderer. No imports or test bridge in the application page.
async function exercise(mode: Command, count: number, durationMs: number) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (check: () => unknown, label: string) => {
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      if (check()) return;
      await delay(40);
    }
    throw new Error('PointCloud smoke: ' + label);
  };
  const pane = () => document.querySelector<HTMLElement>('[data-panel-type="Viewer3D"]')!;
  const controls = () => document.querySelector<HTMLDetailsElement>('[data-simulation-controls]')!;
  const config = () => pane().querySelector<HTMLDetailsElement>('[data-cloud-config]')!;
  const primary = () => config().querySelector<HTMLElement>('[data-cloud-layer="primary"]')!;
  const canvas = () => pane().querySelector<HTMLCanvasElement>('canvas')!;
  const stats = (): ViewerStats | undefined => {
    const raw = pane()?.querySelector<HTMLElement>('[data-viewer-stats]')?.dataset.viewerStats;
    return raw ? JSON.parse(raw) as ViewerStats : undefined;
  };
  const click = (label: string, root: ParentNode = document) => {
    const button = [...root.querySelectorAll('button')].find((entry) => entry.textContent === label);
    if (!button || button.disabled) throw new Error('Unavailable button ' + label);
    button.click();
  };
  const select = (selector: string, value: string, root: ParentNode) => {
    const node = root.querySelector<HTMLSelectElement>(selector);
    if (!node || ![...node.options].some((entry) => entry.value === value)) throw new Error('Unavailable choice ' + value);
    node.value = value;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const ready = (points: number) => stats()?.points === points;

  if (mode === 'setup') {
    await wait(() => document.querySelector('nav'), 'navigation');
    click('实时', document.querySelector('nav')!);
    await wait(() => [...document.querySelectorAll('button')].some((entry) => entry.textContent === '可视化工作区'), 'live page');
    click('可视化工作区');
    await wait(controls, 'simulation controls');
    controls().open = true;
    controls().querySelector<HTMLInputElement>('[data-simulation-overlays]')!.click();
    click('启动模拟', controls());
    click('添加面板');
    await wait(() => pane()?.querySelector('[data-workspace-control="source"]'), 'viewer controls');
    select('[data-workspace-control="source"]', 'simulation', pane());
    await wait(() => pane().querySelector('[data-workspace-control="topic"] option[value="/points"]'), 'cloud catalog');
    select('[data-workspace-control="topic"]', '/points', pane());
    await wait(() => ready(10_000), 'first 10k WebGL draw');
    config().open = true;
    select('[data-cloud-color]', 'xyz', primary());
    await wait(() => stats()?.layers[0]?.effectiveColor === 'xyz', 'solid point color');
    click('聚焦点云', pane());
    const gl = canvas().getContext('webgl2')!;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const rasterized = await new Promise<number>((resolve) => requestAnimationFrame(() => {
      // Run after the viewer's already scheduled draw and before the canvas is composited.
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === 82 && pixels[index + 1] === 192 && pixels[index + 2] === 241) count++;
      }
      resolve(count);
    }));
    if (rasterized < 100) throw new Error('Missing rasterized point pixels: ' + rasterized);
    return { vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION), rasterized };
  }

  if (mode === 'overlay') {
    const initial = stats()!.layers[0]!;
    for (const topic of ['/points/structure', '/points/objects']) {
      select('[data-cloud-add-topic]', topic, config());
      await delay(10);
      click('叠加话题', config());
      await wait(() => config().querySelector('[data-cloud-layer="' + topic + '"]'), topic);
    }
    await wait(() => ready(30_000) && stats()?.layers.every((layer) => layer.frame === 'lidar_link'), 'three actual draw layers');
    const objects = config().querySelector<HTMLElement>('[data-cloud-layer="/points/objects"]')!;
    select('[data-cloud-color]', 'rgb', objects);
    select('[data-cloud-max]', '1000', objects);
    await wait(() => ready(21_000) && stats()?.layers.find((layer) => layer.topic === '/points/objects')?.effectiveColor === 'rgb',
      'independent color and point limits');
    objects.querySelector<HTMLInputElement>('[data-cloud-visible]')!.click();
    await wait(() => ready(20_000), 'independent visibility');
    for (const topic of ['/points/structure', '/points/objects']) {
      const row = config().querySelector<HTMLElement>('[data-cloud-layer="' + topic + '"]')!;
      click('移除图层', row);
      await wait(() => !config().querySelector('[data-cloud-layer="' + topic + '"]'), 'removed ' + topic);
    }
    await wait(() => ready(10_000), 'overlay geometry removed');
    const final = stats()!.layers[0]!;
    if (final.allocations !== initial.allocations || final.uploads <= initial.uploads) throw new Error('GPU buffer reuse failed');
    if ((await window.labscope.getStatus()).state !== 'idle') throw new Error('Live connection was started');
    return { layers: 3, allocations: final.allocations, uploads: final.uploads };
  }

  if (mode === 'prepare' || mode === 'full') {
    click('停止', controls());
    click('重置', controls());
    await wait(() => ready(0), 'reset clears draw range');
    select('[data-simulation-point-count]', String(count), controls());
    select('[data-cloud-max]', String(count), primary());
    await delay(30);
    select('[data-cloud-color]', 'height', primary());
    await delay(30);
    if (mode === 'full') {
      const scene = ['static-room', 'moving-robot', 'obstacle-scene', 'noisy-sensor'][durationMs] ?? 'moving-robot';
      select('[data-simulation-scenario]', scene, controls());
      await delay(40);
      click('启动完整 3D 场景', controls());
    } else click('启动模拟', controls());
    config().open = false;
    controls().open = false;
    click('重置视角', pane());
    await wait(() => ready(count), 'draw ' + count);
    if (mode === 'full') {
      const complete = () => stats()?.scene.find(({ source }) => source === 'simulation');
      await wait(() => {
        const data = complete();
        return stats()?.fixedFrame === 'map' && data && data.visibleFrames >= 7 &&
          data.poses === 1 && data.odometry === 1 && data.pathPoints >= 2 && data.markers === 7;
      }, 'full spatial scene');
      if (durationMs === 0) {
        for (const frame of ['odom', 'base_link', 'map']) {
          select('[data-fixed-frame]', frame, pane());
          await wait(() => stats()?.fixedFrame === frame && ready(count), 'fixed frame ' + frame);
        }
        const projection = () => pane().querySelector<HTMLSelectElement>('[data-camera-projection]')?.value;
        select('[data-camera-projection]', 'orthographic', pane());
        await wait(() => projection() === 'orthographic', 'orthographic projection');
        for (const preset of ['top', 'bottom', 'front', 'back', 'left', 'right']) {
          select('[data-camera-preset]', preset, pane());
          await delay(240);
          const camera = JSON.parse(localStorage.getItem('labscope.workspace.v1') ?? '{}').root?.panel?.pointCloud?.scene?.camera;
          const axis = ['front', 'back'].includes(preset) ? 0 : ['left', 'right'].includes(preset) ? 1 : 2;
          const sign = ['back', 'right', 'bottom'].includes(preset) ? -1 : 1;
          if (!camera || sign * (camera.position[axis] - camera.target[axis]) <= 0) throw new Error('Preset not saved: ' + preset);
        }
        select('[data-camera-projection]', 'perspective', pane());
        await wait(() => projection() === 'perspective', 'perspective projection');
        click('重置视角', pane());
      }
      await delay(800);
      return { width: canvas().width, height: canvas().height, spatial: complete(), fixedFrame: stats()?.fixedFrame };
    }
    await delay(800);
    return { width: canvas().width, height: canvas().height };
  }

  if (mode === 'sample') {
    const start = performance.now();
    let last = stats()?.measuredAt;
    const samples: ViewerStats[] = [];
    const producer: number[] = [];
    let lastSimTime: string | undefined;
    while (performance.now() - start < durationMs) {
      await delay(100);
      const current = stats();
      if (current && current.measuredAt !== last) {
        if (current.points !== count) throw new Error('Draw count fell below configured number');
        samples.push(current);
        last = current.measuredAt;
      }
      const simulation = controls().querySelector<HTMLElement>('[data-simulation-elapsed]')?.dataset;
      if (simulation?.simulationGenerationMs && simulation.simulationElapsed !== lastSimTime) {
        producer.push(Number(simulation.simulationGenerationMs));
        lastSimTime = simulation.simulationElapsed;
      }
    }
    if (samples.length < 3 || producer.length < 3) throw new Error('Telemetry sampling stopped');
    return { samples, producer, elapsedMs: performance.now() - start };
  }

  if (mode === 'faults') {
    click('停止', controls());
    click('重置', controls());
    await wait(() => ready(0), 'clear the previous scenario');
    select('[data-simulation-scenario]', 'moving-robot', controls());
    await delay(40);
    for (const name of ['TF 缺失', 'TF 乱序', 'NaN 点', '点云字段错误', '突发消息']) {
      const field = [...controls().querySelectorAll('label')].find((label) => label.textContent.trim() === name)
        ?.querySelector<HTMLInputElement>('input');
      if (!field) throw new Error('Missing fault control ' + name);
      if (!field.checked) field.click();
    }
    const previousDrops = stats()?.dropped ?? 0;
    click('启动完整 3D 场景', controls());
    let invalidSchema = false, invalidPoints = false, burstMerged = false, recovered = false;
    await wait(() => {
      const current = stats();
      const layer = current?.layers[0];
      invalidSchema ||= !!layer?.error?.includes('invalid field');
      invalidPoints ||= layer?.invalid === 1 && current?.points === 9999;
      burstMerged ||= (current?.dropped ?? 0) > previousDrops;
      recovered ||= invalidSchema && current?.points === 10000 && !!current.scene[0]?.visibleFrames;
      return invalidSchema && invalidPoints && burstMerged && recovered;
    }, 'fault display and recovery');
    return { invalidSchema, invalidPoints, burstMerged, recovered };
  }

  click('停止', controls());
  click('重置', controls());
  await wait(() => ready(0) && !stats()?.layers[0]?.stamp, 'cleared points and original stamp');
  const previous = canvas();
  const gl = previous.getContext('webgl2')!;
  click('关闭', pane());
  await wait(() => !pane() && !previous.isConnected && gl.isContextLost(), 'closed and released WebGL context');
  return { cleared: true, released: true };
}

async function cameraInput(window: BrowserWindow): Promise<void> {
  const contents = window.webContents;
  const rect = await contents.executeJavaScript(`
    (() => {
      const rect = document.querySelector('[data-panel-type="Viewer3D"] canvas').getBoundingClientRect();
      return { x: Math.floor(rect.left + rect.width / 2), y: Math.floor(rect.top + rect.height / 2) };
    })()
  `);
  const snapshot = () => contents.executeJavaScript(`
    JSON.parse(localStorage.getItem('labscope.workspace.v1') || '{}').root?.panel?.pointCloud?.scene?.camera
  `) as Promise<{ position: number[]; target: number[]; projection: string } | undefined>;
  let before = await snapshot();
  if (!before) throw new Error('Missing saved camera before pointer tests');
  const { x, y } = rect as { x: number; y: number };
  const requireChange = async (field: 'position' | 'target' | 'projection') => {
    const prior = JSON.stringify(before?.[field]);
    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      const current = await snapshot();
      if (current && JSON.stringify(current[field]) !== prior) {
        before = current;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Camera input did not update ' + field);
  };
  window.focus();
  contents.focus();
  for (const [button, field] of [['left', 'position'], ['right', 'target']] as const) {
    contents.sendInputEvent({ type: 'mouseDown', button, clickCount: 1, x, y });
    contents.sendInputEvent({ type: 'mouseMove', button, x: x + 48, y: y + 15 });
    contents.sendInputEvent({ type: 'mouseUp', button, clickCount: 1, x: x + 48, y: y + 15 });
    await requireChange(field);
  }
  contents.sendInputEvent({ type: 'mouseWheel', x, y, deltaY: 120, deltaX: 0 });
  await requireChange('position');
  contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 2, x, y });
  contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 2, x, y });
  await requireChange('target');
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'P' });
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'P' });
  await requireChange('projection');
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'R' });
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'R' });
  await requireChange('projection');
  console.log('SPATIAL_CAMERA {"orbit":true,"pan":true,"zoom":true,"doubleClickFocus":true,"keys":true}');
}

export async function runPointCloudSmoke(window: BrowserWindow, app: App, enduranceSeconds: number, full = false): Promise<void> {
  if (window.webContents.isLoadingMainFrame()) {
    await new Promise<void>((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, _code, reason) => reject(new Error(reason)));
    });
  }
  const invoke = (mode: Command, count = 0, durationMs = 0) => window.webContents.executeJavaScript(
    '(' + exercise.toString() + ')(' + JSON.stringify(mode) + ',' + count + ',' + durationMs + ')',
  );
  const device = await invoke('setup');
  console.log('POINTCLOUD_DEVICE ' + JSON.stringify({ ...device, featureStatus: app.getGPUFeatureStatus() }));
  console.log('POINTCLOUD_OVERLAYS ' + JSON.stringify(await invoke('overlay')));
  const captureMemory = () => app.getAppMetrics().filter(({ type }) => type === 'Tab' || type === 'GPU')
    .map(({ type, pid, memory }) => ({ type, pid, ...memory }));
  const runs: [number, number][] = [[10_000, 4], [50_000, 4], [100_000, 12], [500_000, 20]];
  if (enduranceSeconds > 0 && !full) runs.push([100_000, enduranceSeconds]);
  async function sample(count: number, duration: number, dimensions: unknown, fullScene: boolean): Promise<void> {
    const memory = [{ t: 0, processes: captureMemory() }];
    const started = Date.now();
    const timer = setInterval(() => {
      const t = Date.now() - started;
      memory.push({ t, processes: captureMemory() });
      if (duration >= 300 && (memory.length - 1) % 12 === 0) {
        console.log('POINTCLOUD_HEARTBEAT ' + JSON.stringify({ count, duration, elapsedSeconds: Math.round(t / 1000) }));
      }
    }, 5000);
    console.log('POINTCLOUD_RUN ' + JSON.stringify({ count, duration, dimensions, fullScene }));
    try {
      const report = await invoke('sample', count, duration * 1000);
      memory.push({ t: Date.now() - started, processes: captureMemory() });
      console.log('POINTCLOUD_SAMPLE ' + JSON.stringify({ count, duration, dimensions, fullScene, memory, ...report }));
    } finally {
      clearInterval(timer);
    }
  }
  for (const [count, duration] of runs) await sample(count, duration, await invoke('prepare', count), false);
  if (full) {
    for (const scenario of [0, 1, 2, 3]) {
      console.log('SPATIAL_SCENE ' + JSON.stringify({ scenario, data: await invoke('full', 10_000, scenario) }));
      if (scenario === 0) await cameraInput(window);
    }
    console.log('SPATIAL_FAULTS ' + JSON.stringify(await invoke('faults')));
    if (enduranceSeconds) await sample(100_000, enduranceSeconds, await invoke('full', 100_000, 1), true);
  }
  console.log('POINTCLOUD_RESULT ' + JSON.stringify(await invoke('close')));
}
