import type { WebContents } from 'electron';

export async function runWorkspaceSmoke(contents: WebContents, url: string, phase: 'save' | 'restore', spatial = false): Promise<string> {
  return contents.executeJavaScript(`
    (async () => {
      const phase = ${JSON.stringify(phase)};
      const spatial = ${JSON.stringify(spatial)};
      const url = ${JSON.stringify(url)};
      const workspace = () => document.querySelector('section[aria-label="可视化工作区"]');
      const pane = (type) => workspace()?.querySelector('[data-panel-type="' + type + '"]');
      const wait = async (check, label) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const result = await check();
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error('Workspace: ' + label);
      };
      const click = (root, label) => {
        const button = [...root.querySelectorAll('button')].find((item) =>
          item.getAttribute('aria-label') === label || item.textContent === label);
        if (!button || button.disabled) throw new Error('Missing button: ' + label);
        button.click();
      };
      const change = (select, value) => {
        if (!select || ![...select.options].some((item) => item.value === value)) {
          throw new Error('Missing selection: ' + value);
        }
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const addType = (type) => change(workspace().querySelector('#workspace-panel-type'), type);
      const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
      const control = (type, name) => pane(type)?.querySelector('[data-workspace-control="' + name + '"]');
      const recordedTopic = (type, name) => control(type, 'topic')?.value === name;
      const bound = (type) => pane(type)?.textContent.includes('已收到数据') ||
        (type === 'Plot' && !!pane(type)?.querySelector('[data-plot-series]'));
      const drewCloud = () => {
        const raw = pane('Viewer3D')?.querySelector('[data-viewer-stats]')?.dataset.viewerStats;
        const stats = raw ? JSON.parse(raw) : undefined;
        return stats?.points > 0 && stats.layers.some((layer) => layer.source === 'live' && !!layer.frame);
      };
      const subscribed = async () => (await window.labscope.getStatus()).subscribed;
      const key = 'labscope.workspace.v1';

      click(document, '可视化工作区');
      await wait(workspace, 'open');
      if (phase === 'save') {
        if (workspace().querySelector('[data-panel-id]')) throw new Error('Expected a fresh workspace profile');
        click(workspace(), '添加面板');
        await wait(() => pane('Viewer3D'), '3D panel');
        addType('Plot');
        await turn();
        click(pane('Viewer3D'), '右侧分屏');
        await wait(() => pane('Plot'), 'horizontal split');
        addType('CameraViewer');
        await turn();
        click(pane('Plot'), '下方分屏');
        await wait(() => pane('CameraViewer'), 'vertical split');
        change(control('CameraViewer', 'source'), 'playback');
        await wait(() => control('CameraViewer', 'source')?.value === 'playback', 'playback setting');

        const divider = workspace().querySelector('[role="separator"][aria-orientation="vertical"]');
        if (!divider || !workspace().querySelector('[role="separator"][aria-orientation="horizontal"]')) {
          throw new Error('Expected both split directions');
        }
        divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await wait(() => divider.getAttribute('aria-valuenow') === '55', 'resize');

        const drag = new DataTransfer();
        pane('Viewer3D').querySelector('[draggable="true"]').dispatchEvent(new DragEvent('dragstart', {
          bubbles: true, dataTransfer: drag,
        }));
        pane('Plot').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drag }));
        await wait(() => workspace().querySelector('[data-panel-type]')?.dataset.panelType === 'Plot', 'drag swap');
      }

      for (const type of ['Viewer3D', 'CameraViewer', 'Plot']) {
        if (!pane(type)) throw new Error('Expected ' + type);
      }
      await window.labscope.connect(url);
      await wait(async () => {
        const state = await window.labscope.getStatus();
        return state.state === 'connected' && state.channels.some(({ topic }) => topic === '/imu/data') &&
          state.channels.some(({ topic }) => topic === '/livox/lidar');
      }, 'bridge discovery');

      if (phase === 'save') {
        await wait(() => [...control('Plot', 'topic').options].some((option) => option.value === '/imu/data'), 'topic catalog');
        change(control('Viewer3D', 'topic'), '/livox/lidar');
        change(control('Plot', 'topic'), '/imu/data');
      }
      await wait(() => recordedTopic('Viewer3D', '/livox/lidar') && recordedTopic('Plot', '/imu/data'), 'independent topics');
      await wait(() => drewCloud() && bound('Plot'), 'live point geometry and IMU payload');

      if (phase === 'save') {
        click(pane('Viewer3D'), '关闭面板');
        await wait(async () => {
          const topics = await subscribed();
          return !pane('Viewer3D') && topics.length === 1 && topics[0] === '/imu/data';
        }, 'subscription released after closing pane');
        addType('Viewer3D');
        await turn();
        click(workspace(), '添加面板');
        await wait(() => control('Viewer3D', 'topic'), 'reopened panel');
        change(control('Viewer3D', 'topic'), '/livox/lidar');
        await wait(drewCloud, 'resubscribed and redrew after reopening');
      }

      if (spatial) {
        if (phase === 'save') change(pane('Viewer3D').querySelector('[data-fixed-frame]'), 'map');
        await wait(() => {
          const state = pane('Viewer3D')?.querySelector('[data-viewer-stats]')?.dataset.viewerStats;
          const stats = state ? JSON.parse(state) : undefined;
          return stats?.fixedFrame === 'map' && stats.points === 20000 &&
            stats.layers[0]?.frame === 'livox_frame' && !stats.layers[0]?.error &&
            stats.scene[0]?.frames.some(({ frame }) => frame === 'base_link');
        }, 'captured cloud transformed at its source timestamp from live TF');
      }

      const raw = localStorage.getItem(key);
      if (!raw) throw new Error('Workspace layout was not persisted');
      const types = [...workspace().querySelectorAll('[data-panel-type]')].map((node) => node.dataset.panelType);
      if (types.length !== 3) throw new Error('Expected three open panels');
      await window.labscope.disconnect();
      return raw;
    })()
  `);
}
