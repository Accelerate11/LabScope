const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const f = require('node:fs');
const p = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const { setTimeout: delay } = require('node:timers/promises');
const { TextDecoder } = require('node:util');

const { tmpdir } = require('node:os');

const desktop = p.resolve(__dirname, '..');
const bundle = p.join(desktop, 'out');
const entry = 'main/index.js';
const source = (file) => f.readFileSync(p.join(bundle, file), 'utf8');
const scratch = f.mkdtempSync(p.join(tmpdir(), 'labscope-runtime-'));
const normalize = (datas) => JSON.parse(JSON.stringify(datas));
const expectedCalls = ['ai:chat', 'ai:provider-remove', 'ai:provider-test', 'ai:provider-upsert', 'ai:providers',
  'analysis:log', 'analysis:run', 'analysis:tools',
  'app:info', 'config:get', 'config:set', 'recording:cancel', 'recording:event', 'recording:list',
  'recording:pause', 'recording:resume', 'recording:start', 'recording:stop', 'report:generate', 'session:connect',
  'session:disconnect', 'session:panel-topics', 'session:status', 'session:subscribe'];
const outcomes = [];
async function check(name, fn) {
  try {
    const evidence = await fn();
    outcomes.push({ name, status: 'passed', evidence });
  } catch (error) {
    outcomes.push({ name, status: 'failed', evidence: error.message });
  }
}
async function harness({ isPackaged = true, devUrl, lock = true, userDataLeaf = 'lab-user' } = {}) {
  const trace = [];
  const handlers = new Map();
  const userData = p.join(scratch, userDataLeaf);
  let window;
  let worker;
  let resolveTerminate;
  const app = Object.assign(new EventEmitter(), {
    isPackaged,
    setName(name) { trace.push('setName:' + name); },
    requestSingleInstanceLock() { trace.push('lock'); return lock; },
    whenReady() { trace.push('whenReady'); return Promise.resolve(); },
    setAppUserModelId(id) { trace.push('appId:' + id); },
    getVersion() { return '0.1.0-m1'; },
    getPath(name) { assert.equal(name, 'userData'); trace.push('userData'); return userData; },
    quit() { trace.push('quit'); },
    exit(code) { trace.push('exit:' + code); },
  });
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.options = options;
      this.sent = [];
      this.webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler: (handler) => { this.openHandler = handler; },
        send: (channel, payload) => { this.sent.push({ channel, payload }); },
      });
    }
    static getAllWindows() { return window ? [window] : []; }
    isDestroyed() { return false; }
    isMinimized() { return true; }
    restore() { trace.push('restore'); }
    focus() { trace.push('focus'); }
    loadFile(file) { this.loaded = { type: 'file', value: file }; return Promise.resolve(); }
    loadURL(url) { this.loaded = { type: 'url', value: url }; return Promise.resolve(); }
  }
  class Worker extends EventEmitter {
    constructor(file) {
      super();
      worker = this;
      this.file = file;
      this.posts = [];
    }
    postMessage(data) { this.posts.push(data); }
    terminate() {
      trace.push('terminate-start');
      return new Promise((resolve) => {
        resolveTerminate = () => { trace.push('terminate-end'); resolve(0); };
      });
    }
  }
  const logs = [];
  const mocks = {
    electron: {
      app, BrowserWindow, Menu: { setApplicationMenu: () => trace.push('menu') },
      shell: { openExternal: (url) => { trace.push('external:' + url); return Promise.resolve(); } },
      ipcMain: { handle(name, handler) { assert.ok(!handlers.has(name)); handlers.set(name, handler); } },
    },
    'node:worker_threads': { Worker },
  };
  const context = vm.createContext({
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')) },
    process: { argv: [], env: devUrl === undefined ? {} : { ELECTRON_RENDERER_URL: devUrl }, versions: process.versions, arch: process.arch, platform: process.platform },
    setTimeout, URL, TextDecoder,
  });
  const contextModules = new Map();
  function moduleFor(file) {
    if (contextModules.has(file)) return contextModules.get(file);
    let module;
    if (file === 'electron' || file.startsWith('node:')) {
      const bindings = mocks[file] ?? require(file);
      const keys = Object.keys(bindings);
      module = new vm.SyntheticModule(keys, function () {
        for (const key of keys) this.setExport(key, bindings[key]);
      }, { context, identifier: file });
    } else {
      module = new vm.SourceTextModule(source(file), {
        context,
        identifier: file,
        initializeImportMeta: (meta) => { meta.url = pathToFileURL(p.join(bundle, file)).href; },
      });
    }
    contextModules.set(file, module);
    return module;
  }
  const module = moduleFor(entry);
  await module.link((spec, requester) => moduleFor(spec.startsWith('.') ?
    p.posix.normalize(p.posix.join(p.posix.dirname(requester.identifier), spec)) : spec));
  await module.evaluate();
  await delay(0);
  return {
    trace, handlers, app, logs, userData, configFile: p.join(userData, 'config.json'),
    get worker() { return worker; }, window,
    ipc(channel, ...args) { return handlers.get(channel)({}, ...args); },
    resolveTerminate() { resolveTerminate?.(); },
  };
}
async function main() {
  const prod = await harness();
  await check('Packaged initialization and relative main/preload/renderer paths', () => {
    assert.deepEqual(prod.trace.slice(0, 6), ['setName:LabScope', 'lock', 'whenReady', 'appId:com.labscope.desktop', 'menu', 'userData']);
    assert.deepEqual([...prod.handlers.keys()].sort(), expectedCalls);
    const prefs = normalize(prod.window.options.webPreferences);
    assert.deepEqual(prefs, { preload: p.join(bundle, 'preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false });
    assert.deepEqual(prod.window.loaded, { type: 'file', value: p.join(bundle, 'renderer/index.html') });
    const blockedNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
    prod.window.webContents.emit('will-navigate', blockedNavigation, 'https://example.invalid/');
    assert.ok(blockedNavigation.prevented);
    return 'Window uses file assets with a sandboxed preload, and default packaged navigation is blocked.';
  });
  await check('Dev URL path and single-instance branches', async () => {
    const devMode = await harness({ isPackaged: false, devUrl: 'http://localhost:5173' });
    assert.deepEqual(devMode.window.loaded, { type: 'url', value: 'http://localhost:5173/' });
    const sameOrigin = { prevented: false, preventDefault() { this.prevented = true; } };
    devMode.window.webContents.emit('will-navigate', sameOrigin, 'http://localhost:5173/routes');
    assert.equal(sameOrigin.prevented, false);
    const otherPort = { prevented: false, preventDefault() { this.prevented = true; } };
    devMode.window.webContents.emit('will-navigate', otherPort, 'http://localhost:51730/');
    assert.equal(otherPort.prevented, true);
    prod.app.emit('second-instance');
    assert.deepEqual(prod.trace.slice(-2), ['restore', 'focus']);
    const locked = await harness({ lock: false });
    assert.deepEqual(locked.trace, ['setName:LabScope', 'lock', 'quit']);
    assert.equal(locked.window, undefined);
    return 'Dev requests the Vite URL. The packaged second instance restores and focuses the first window.';
  });
  await check('Packaged file entry remains local when launch environment carries a dev URL', async () => {
    const leaked = await harness({ isPackaged: true, devUrl: 'http://localhost:5173' });
    assert.equal(leaked.window.loaded.type, 'file', 'Packaged window selected loadURL when ELECTRON_RENDERER_URL was present.');
  });
  await check('Preload contextBridge invocation, event stripping and listener cleanup', async () => {
    let api;
    const renderer = new EventEmitter();
    const invokes = [];
    renderer.invoke = (channel, ...args) => { invokes.push({ channel, args }); return Promise.resolve(channel); };
    vm.runInNewContext(source('preload/index.cjs'), {
      require(name) {
        assert.equal(name, 'electron');
        return {
          ipcRenderer: renderer,
          contextBridge: { exposeInMainWorld: (name, exposed) => { assert.equal(name, 'labscope'); api = exposed; } },
        };
      },
    });
    for (const [method, args] of Object.entries({
      getAppInfo: [], getConfig: [], setConfig: [{ lastUrl: 'ws://localhost:8765' }],
      connect: ['ws://localhost:8765'], disconnect: [], subscribe: [['/imu/data']], getStatus: [],
      setPanelTopics: [['/imu/data']], recordingStart: [{ name: 'test', project: 'test', compression: 'none' }, ['/imu/data']],
      recordingPause: [], recordingResume: [], recordingStop: [], recordingCancel: [], recordingList: [],
      recordingEvent: [{ type: 'note', title: 'test', description: 'test', timeNs: '1' }],
      aiProviders: [], aiProviderUpsert: [{ name: 'test', kind: 'openai-compatible', baseUrl: 'https://example.invalid', model: 'test', apiKey: 'test', enabled: true }],
      aiProviderRemove: ['id'], aiProviderTest: ['id'], aiChat: ['id', 'prompt'],
      analysisTools: [], analysisRun: ['experiment'], analysisLog: ['INFO fixture', 'fixture.log'], reportGenerate: ['experiment', 'local-mock', 'summarize'],
    })) await api[method](...args);
    assert.deepEqual(invokes.map((item) => item.channel).sort(), expectedCalls);
    for (const [method, name] of Object.entries({
      onSessionStatus: 'event:session-status', onTelemetry: 'event:telemetry', onLog: 'event:log',
    })) {
      const seen = [];
      const stop = api[method]((...args) => seen.push(args));
      const payload = { data: name };
      renderer.emit(name, { sender: 'must not be exposed' }, payload);
      stop();
      renderer.emit(name, {}, payload);
      assert.deepEqual(seen, [[payload]]);
    }
    return 'Eight requests and three push events use exactly the intended channel names.';
  });
  await check('IPC validation, default config, persistence, and corrupt JSON recovery', async () => {
    assert.equal(prod.ipc('config:get').lastUrl, 'ws://127.0.0.1:8765');
    for (const url of ['https://example.invalid', 'ws://user:password@localhost:8765', 1]) {
      assert.throws(() => prod.ipc('session:connect', url));
    }
    assert.throws(() => prod.ipc('session:subscribe', ['invalid']));
    assert.throws(() => prod.ipc('session:panel-topics', ['invalid']));
    assert.throws(() => prod.ipc('session:subscribe', Array(513).fill('/topic')));
    assert.throws(() => prod.ipc('config:set', { lastUrl: 7 }));
    assert.throws(() => prod.ipc('config:set', { lastUrl: 'https://example.invalid' }));
    const saved = prod.ipc('config:set', { lastUrl: 'ws://localhost:8766' }).lastUrl;
    assert.equal(saved, 'ws://localhost:8766/');
    assert.deepEqual(JSON.parse(f.readFileSync(prod.configFile)), { lastUrl: saved });
    const fresh = await harness();
    assert.equal(fresh.ipc('config:get').lastUrl, saved);
    f.writeFileSync(fresh.configFile, '{corrupt');
    assert.equal((await harness()).ipc('config:get').lastUrl, 'ws://127.0.0.1:8765');
    const providers = await prod.ipc('ai:providers');
    assert.ok(providers.some((provider) => provider.id === 'local-mock'));
    const tools = prod.ipc('analysis:tools');
    assert.ok(tools.some((tool) => tool.id === 'get_topic_statistics'));
    return 'URL and topic guards held. The file is read by a new instance, and malformed JSON falls back to the default.';
  });
  await check('Config write failure is reported to the caller', async () => {
    const bad = await harness({ userDataLeaf: 'not-a-directory' });
    f.writeFileSync(bad.userData, 'fixture');
    const input = 'ws://localhost:8777';
    let error;
    try { bad.ipc('config:set', { lastUrl: input }); } catch (caught) { error = caught; }
    assert.ok(bad.logs.some((message) => message.startsWith('[config] failed to persist:')));
    assert.ok(!f.existsSync(bad.configFile));
    assert.match(error?.message ?? '', /无法保存连接地址/);
    assert.equal(bad.ipc('config:get').lastUrl, 'ws://127.0.0.1:8765');
    bad.ipc('session:connect', input);
    assert.equal(bad.worker.posts[0].type, 'connect');
    assert.ok(bad.window.sent.some(({ channel }) => channel === 'event:log'));
    return 'Explicit save fails while retaining the persisted/default value. Live connection remains available.';
  });
  await check('Worker event forwarding, logging, and last-window quit', () => {
    prod.ipc('session:connect', 'ws://localhost:8765');
    assert.equal(prod.worker.file, p.join(bundle, 'main/data-worker.js'));
    prod.ipc('session:subscribe', ['/imu/data']);
    prod.ipc('session:disconnect');
    assert.deepEqual(normalize(prod.worker.posts), [
      { type: 'connect', url: 'ws://localhost:8765/' },
      { type: 'subscribe', topics: ['/imu/data'] }, { type: 'disconnect' },
    ]);
    prod.worker.emit('message', { type: 'log', entry: { level: 'warn', message: 'fixture log', at: 1 } });
    prod.worker.emit('message', { type: 'telemetry', payload: { topics: [] } });
    assert.ok(prod.logs.some((message) => message === '[worker:warn] fixture log'));
    assert.ok(prod.window.sent.some((message) => message.channel === 'event:log'));
    assert.ok(prod.window.sent.some((message) => message.channel === 'event:telemetry'));
    prod.app.emit('window-all-closed');
    assert.equal(prod.trace.at(-1), 'quit');
    return 'Requests post to the Worker. Telemetry and worker logs reach the selected renderer.';
  });
  await check('Window quit waits for pending Worker termination', async () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    prod.app.emit('before-quit', event);
    try {
      assert.ok(prod.trace.includes('terminate-start') && !prod.trace.includes('terminate-end'));
      assert.ok(event.prevented, 'before-quit starts Worker termination without gating app quit on completion.');
      prod.app.emit('before-quit', event);
      assert.equal(prod.trace.filter((action) => action === 'terminate-start').length, 1);
      assert.equal(prod.trace.at(-1), 'terminate-start');
      assert.throws(() => prod.ipc('session:subscribe', ['/imu/data']), /shutting down/);
    } finally { prod.resolveTerminate(); }
    await delay(0);
    assert.deepEqual(prod.trace.slice(-2), ['terminate-end', 'quit']);
    const completed = { prevented: false, preventDefault() { this.prevented = true; } };
    prod.app.emit('before-quit', completed);
    assert.equal(completed.prevented, false);
    return 'Repeated quit waits for the same Worker, then permits default Electron termination.';
  });
  console.log(JSON.stringify(outcomes, null, 2));
  process.exitCode = Number(outcomes.some((outcome) => outcome.status === 'failed'));
}
main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => f.rmSync(scratch, { recursive: true, force: true }));
