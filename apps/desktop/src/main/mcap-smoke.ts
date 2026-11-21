import type { BrowserWindow } from 'electron';
import { resolve } from 'node:path';

export async function runMcapSmoke(window: BrowserWindow, file: string): Promise<void> {
  const contents = window.webContents;
  await contents.executeJavaScript(`
    (async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const playback = [...document.querySelectorAll('nav button')].find((node) => node.textContent === '回放');
        if (playback) {
          playback.click();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      throw new Error('Missing playback navigation');
    })()
  `);
  await contents.executeJavaScript(`
    (async () => {
      const deadline = Date.now() + 5000;
      while (!document.querySelector('[data-mcap-file]') && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      if (!document.querySelector('[data-mcap-file]')) throw new Error('Missing MCAP file control');
    })()
  `);
  const client = contents.debugger;
  client.attach('1.3');
  try {
    const { root } = await client.sendCommand('DOM.getDocument');
    const { nodeId } = await client.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-mcap-file]' });
    await client.sendCommand('DOM.setFileInputFiles', { nodeId, files: [resolve(file)] });
  } finally {
    client.detach();
  }
  await contents.executeJavaScript(`
    (async () => {
      const controls = () => document.querySelector('[aria-label="本地 MCAP 回放"]');
      const find = (label) => [...(controls()?.querySelectorAll('button') ?? [])].find((node) => node.textContent.trim() === label);
      const stats = () => {
        const data = document.querySelector('[data-viewer-stats]')?.dataset.viewerStats;
        return data ? JSON.parse(data) : null;
      };
      const wait = async (check, label) => {
        const end = Date.now() + 12000;
        while (Date.now() < end) {
          const error = controls()?.querySelector('[role="alert"]')?.textContent;
          if (error) throw new Error(error);
          const result = check();
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        throw new Error(label);
      };
      (await wait(() => find('播放'), 'Open MCAP file')).click();
      await wait(() => {
        const current = stats();
        return current?.points === 10000 && current.fixedFrame === 'map' &&
          current.scene[0]?.source === 'playback' && current.scene[0].markers === 7 && current.scene[0].pathPoints > 2;
      }, 'MCAP render from the file input');
      find('回到开头').click();
      await wait(() => stats()?.points === 0 && !stats()?.layers[0]?.stamp, 'MCAP rewind cleared the scene');
      (await wait(() => find('播放')?.disabled === false && find('播放'), 'Replay ready')).click();
      await wait(() => stats()?.points === 10000, 'MCAP resumed after rewind');
      if ((await window.labscope.getStatus()).state !== 'idle') throw new Error('Playback started live transport');
      find('关闭文件').click();
      await wait(() => stats()?.points === 0, 'Closing file cleared the cloud');
    })()
  `);
  console.log('MCAP_SMOKE_RESULT {"passed":true,"fileInput":true,"rewind":true,"liveSession":"idle"}');
}
