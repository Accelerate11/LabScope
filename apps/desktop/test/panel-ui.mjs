import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const type = process.argv[2] === '--pointcloud' ? 'pointcloud' : process.argv[2] === '--mcap' ? 'mcap' : process.argv[2] === '--m23' ? 'm23' : 'panel';
const executable = process.argv[type === 'panel' ? 2 : 3];
if (!executable) throw new Error('Expected the executable path of the Electron 45 development runtime.');
const fixture = './' + type + '-fixture/';

function electronFixture() {
  const { app, BrowserWindow } = require('electron');
  const { join } = require('node:path');
  app.setPath('userData', join(__dirname, 'profile'));
  void app.whenReady().then(async () => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await window.loadFile(join(__dirname, 'renderer', 'index.html'));
    const deadline = Date.now() + 24_000;
    while (Date.now() < deadline) {
      const raw = await window.webContents.executeJavaScript('document.body.dataset.result');
      if (raw) {
        const result = JSON.parse(raw);
        console.log('PANEL_UI_RESULT ' + raw);
        app.exit(result.passed ? 0 : 1);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Panel renderer timed out');
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

const root = await mkdtemp(join(tmpdir(), 'labscope-panel-ui-'));
try {
  await mkdir(join(root, 'profile'));
  await build({
    configFile: false,
    root: fileURLToPath(new URL(fixture, import.meta.url)),
    base: './',
    plugins: [react()],
    build: { outDir: join(root, 'renderer') },
  });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'labscope-panel-fixture', main: 'main.cjs' }));
  await writeFile(join(root, 'main.cjs'), '(' + electronFixture.toString() + ')();');
  const child = spawn(executable, [root, '--enable-logging=stderr'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const [code] = await once(child, 'close');
    assert.equal(code, 0);
    const line = output.split(/\r?\n/).find((row) => row.startsWith('PANEL_UI_RESULT '));
    assert.ok(line, 'Expected real Electron panel fixture result');
    assert.equal(JSON.parse(line.slice('PANEL_UI_RESULT '.length)).passed, true);
  } finally {
    clearTimeout(timer);
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 4 });
}
