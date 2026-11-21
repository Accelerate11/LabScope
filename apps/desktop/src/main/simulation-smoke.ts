import type { BrowserWindow } from 'electron';

export async function runSimulationSmoke(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    (async () => {
      const wait = async (check, label) => {
        const until = Date.now() + 10000;
        while (Date.now() < until) {
          if (await check()) return;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        throw new Error('Simulation smoke: ' + label);
      };
      const click = (label, scope = document) => {
        const button = [...scope.querySelectorAll('button')].find((item) => item.textContent === label);
        if (!button || button.disabled) throw new Error('Missing button: ' + label);
        button.click();
      };
      const change = (select, value) => {
        if (!select || ![...select.options].some((entry) => entry.value === value)) throw new Error('Missing option: ' + value);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const controls = () => document.querySelector('[data-simulation-controls]');
      const pane = (type) => document.querySelector('[data-panel-type="' + type + '"]');
      const select = (type, name) => pane(type)?.querySelector('[data-workspace-control="' + name + '"]');
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

      await wait(() => document.querySelector('main nav, nav'), 'initial view');
      click('实时', document.querySelector('nav'));
      await wait(() => [...document.querySelectorAll('button')].some((item) => item.textContent === '可视化工作区'), 'live view');
      click('可视化工作区');
      await wait(controls, 'controls');
      controls().open = true;
      click('启动模拟', controls());
      click('添加面板');
      await wait(() => pane('Viewer3D'), 'point cloud pane');
      change(select('Viewer3D', 'source'), 'simulation');
      await wait(() => [...select('Viewer3D', 'topic').options].some((item) => item.value === '/points'), 'point topic');
      change(select('Viewer3D', 'topic'), '/points');
      await wait(() => pane('Viewer3D').textContent.includes('已收到数据'), 'point envelope');

      change(document.querySelector('#workspace-panel-type'), 'CameraViewer');
      await tick();
      click('添加面板');
      await wait(() => pane('CameraViewer'), 'camera pane');
      change(select('CameraViewer', 'source'), 'simulation');
      await wait(() => [...select('CameraViewer', 'topic').options].some((item) => item.value === '/camera/color/image_raw'), 'camera topic');
      change(select('CameraViewer', 'topic'), '/camera/color/image_raw');
      await wait(() => pane('CameraViewer').querySelector('canvas')?.width > 0 &&
        !pane('CameraViewer').textContent.includes('等待图像数据'), 'image envelope');

      const status = await window.labscope.getStatus();
      if (status.state !== 'idle' || status.channels.length || status.subscribed.length) throw new Error('Simulation touched live session');
      const cloudStats = () => {
        const raw = pane('Viewer3D')?.querySelector('[data-viewer-stats]')?.dataset.viewerStats;
        return raw ? JSON.parse(raw) : undefined;
      };
      const stamp = () => cloudStats()?.layers[0]?.stamp;
      await wait(() => cloudStats()?.points === 10000 && stamp(), 'point draw after splitting');
      click('停止', controls());
      const twoFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await twoFrames();
      const stopped = stamp();
      await twoFrames();
      if (!stopped || stamp() !== stopped) throw new Error('Simulation kept emitting after stop');
      click('重置', controls());
      await wait(() => cloudStats()?.points === 0 && !stamp() &&
        pane('CameraViewer').textContent.includes('等待图像数据'), 'reset clears both bindings');
    })()
  `);
}
