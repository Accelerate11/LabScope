import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateConnectionUrl } from '@labscope/ros-protocol';

import { IPC } from '../shared/ipc';
import type { AppInfo, DesktopConfig, SessionStatus, TelemetryPayload } from '../shared/types';
import { ConfigStore } from './config-store';
import { DataWorkerHost } from './worker-host';
import { runSimulationSmoke } from './simulation-smoke';
import { runPointCloudSmoke } from './pointcloud-smoke';
import { runMcapSmoke } from './mcap-smoke';
import { runWorkspaceSmoke } from './workspace-smoke';
import { listExperiments, RecordingManager } from './recording-manager';
import type { ExperimentManifest, RecordingOptions, RecordingStatus } from './recording-manager';
import { AiGateway } from './ai-gateway';
import { ExperimentAnalysisService } from './analysis-service';
import { htmlReport, markdownReport } from '@labscope/analysis-engine';
import { ConversationStore } from './conversation-store';
import type { Conversation, ConversationMessage } from '../shared/conversation-types';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const isSimulationSmoke = process.argv.includes('--smoke-simulation');
const pointCloudSmoke = process.argv.find((arg) => /^--smoke-pointcloud=\d{1,4}$/.test(arg));
const mcapSmoke = process.argv.find((arg) => arg.startsWith('--smoke-mcap='));
const isSmoke = isSimulationSmoke || pointCloudSmoke !== undefined || mcapSmoke !== undefined || process.argv.includes('--smoke');

let mainWindow: BrowserWindow | null = null;
let recorder: RecordingManager;
const ai = new AiGateway();
const conversations = new ConversationStore();

const host = new DataWorkerHost(join(currentDir, 'data-worker.js'), {
  onStatus: (status) => broadcast(IPC.eventSessionStatus, status),
  onTelemetry: (payload) => broadcast(IPC.eventTelemetry, payload),
  onLog: (level, message) => {
    console.log(`[worker:${level}] ${message}`);
    broadcast(IPC.eventLog, { level, message, at: Date.now() });
  },
  onRecordingChannel: (channel) => recorder.addChannels([channel]),
  onRecordingMessage: (message) => recorder.enqueue(message),
});

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function sanitizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('subscribe expects an array of topic names');
  if (value.length > 512) throw new Error('too many topics in one subscribe request');
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error('topic names must be strings');
    if (!item.startsWith('/') || item.length > 256) throw new Error(`invalid topic name: ${item}`);
    return item;
  });
}

function sanitizeConfigPatch(value: unknown): Partial<DesktopConfig> {
  if (typeof value !== 'object' || value === null) throw new Error('config patch must be an object');
  const patch: Partial<DesktopConfig> = {};
  const lastUrl = (value as Record<string, unknown>)['lastUrl'];
  if (lastUrl !== undefined) {
    if (typeof lastUrl !== 'string') throw new Error('lastUrl must be a string');
    patch.lastUrl = lastUrl;
  }
  return patch;
}

function registerIpc(config: ConfigStore, experimentRoot: string): void {
  const analysis = new ExperimentAnalysisService(experimentRoot);
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle(IPC.configGet, (): DesktopConfig => config.read());

  ipcMain.handle(IPC.configSet, (_event, patch: unknown): DesktopConfig => {
    const safePatch = sanitizeConfigPatch(patch);
    if (safePatch.lastUrl !== undefined) {
      // Validate before persisting so a bad value never becomes the next default.
      safePatch.lastUrl = validateConnectionUrl(safePatch.lastUrl).toString();
    }
    return config.write(safePatch);
  });

  ipcMain.handle(IPC.sessionStatus, (): SessionStatus => host.getStatus());

  ipcMain.handle(IPC.sessionConnect, (_event, rawUrl: unknown): SessionStatus => {
    if (typeof rawUrl !== 'string') throw new Error('connect expects a URL string');
    const url = validateConnectionUrl(rawUrl).toString();
    if (!isSmoke) {
      try {
        config.write({ lastUrl: url });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        broadcast(IPC.eventLog, { level: 'warn', message, at: Date.now() });
      }
    }
    return host.connect(url);
  });

  ipcMain.handle(IPC.sessionDisconnect, (): SessionStatus => host.disconnect());

  ipcMain.handle(IPC.sessionSubscribe, (_event, topics: unknown): SessionStatus =>
    host.subscribe(sanitizeTopics(topics)),
  );
  ipcMain.handle(IPC.sessionPanelTopics, (_event, topics: unknown): void =>
    host.setPanelTopics(sanitizeTopics(topics)),
  );
  ipcMain.handle(IPC.recordingStart, async (_event, options: unknown, topics: unknown): Promise<RecordingStatus> => {
    if (typeof options !== 'object' || options === null) throw new Error('录制配置无效');
    const selected = sanitizeTopics(topics);
    const safe = options as RecordingOptions;
    const status = await recorder.start({ ...safe, name: String(safe.name || 'Experiment'), project: String(safe.project || 'Default') });
    host.startRecording(selected);
    broadcast(IPC.recordingStatus, status);
    return status;
  });
  ipcMain.handle(IPC.recordingPause, (): RecordingStatus => { const status = recorder.pause(); broadcast(IPC.recordingStatus, status); return status; });
  ipcMain.handle(IPC.recordingResume, (): RecordingStatus => { const status = recorder.resume(); broadcast(IPC.recordingStatus, status); return status; });
  ipcMain.handle(IPC.recordingStop, async (): Promise<RecordingStatus> => { host.stopRecording(); const status = await recorder.stop(); broadcast(IPC.recordingStatus, status); return status; });
  ipcMain.handle(IPC.recordingCancel, async (): Promise<RecordingStatus> => { host.stopRecording(); const status = await recorder.cancel(); broadcast(IPC.recordingStatus, status); return status; });
  ipcMain.handle(IPC.recordingList, async (): Promise<ExperimentManifest[]> => listExperiments(experimentRoot));
  ipcMain.handle(IPC.recordingEvent, (_event, value: unknown): void => {
    if (!value || typeof value !== 'object') throw new Error('实验事件无效');
    recorder.addEvent(value as Omit<ExperimentManifest['events'][number], 'id'>);
  });
  ipcMain.handle(IPC.aiProviders, (): Promise<unknown> => ai.list());
  ipcMain.handle(IPC.aiProviderUpsert, (_event, input: unknown): Promise<unknown> => ai.upsert(input as never));
  ipcMain.handle(IPC.aiProviderRemove, (_event, id: unknown): Promise<unknown> => {
    if (typeof id !== 'string') throw new Error('Provider ID 无效'); return ai.remove(id);
  });
  ipcMain.handle(IPC.aiProviderTest, (_event, id: unknown): Promise<unknown> => {
    if (typeof id !== 'string') throw new Error('Provider ID 无效'); return ai.test(id);
  });
  ipcMain.handle(IPC.aiChat, (_event, id: unknown, prompt: unknown, maxTokens: unknown): Promise<unknown> => {
    if (typeof id !== 'string' || typeof prompt !== 'string') throw new Error('AI 请求无效');
    return ai.chat(id, prompt, typeof maxTokens === 'number' ? maxTokens : 1024);
  });
  ipcMain.handle(IPC.analysisTools, (): unknown => analysis.listTools());
  ipcMain.handle(IPC.analysisRun, (_event, experimentId: unknown): Promise<unknown> => {
    if (typeof experimentId !== 'string' || !experimentId) throw new Error('实验 ID 无效');
    return analysis.analyze(experimentId);
  });
  ipcMain.handle(IPC.analysisLog, (_event, text: unknown, source: unknown): unknown => {
    if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('日志内容无效或超过 2 MiB');
    return analysis.tools.execute('analyze_log', { text, source: typeof source === 'string' ? source : 'renderer' });
  });
  ipcMain.handle(IPC.reportGenerate, async (_event, experimentId: unknown, providerId: unknown, prompt: unknown): Promise<unknown> => {
    if (typeof experimentId !== 'string' || !experimentId) throw new Error('实验 ID 无效');
    const result = await analysis.analyze(experimentId);
    let interpretation = '';
    if (typeof providerId === 'string' && providerId) {
      const question = typeof prompt === 'string' && prompt ? prompt : '请基于以下本地计算结果给出简短解释，严格区分 Observed Facts、Computed Metrics、Model Interpretation 和 Hypotheses。\n';
      const response = await ai.chat(providerId, question + '\n' + JSON.stringify(result), 1200);
      interpretation = response.text;
    }
    const markdown = markdownReport(result, interpretation);
    return { markdown, html: htmlReport(markdown), analysis: result };
  });
  ipcMain.handle(IPC.conversationList, (): Promise<Conversation[]> => conversations.list());
  ipcMain.handle(IPC.conversationCreate, (_event, input: unknown): Promise<Conversation> => {
    if (!input || typeof input !== 'object') throw new Error('会话配置无效');
    const value = input as Record<string, unknown>;
    return conversations.create({ title: String(value.title ?? ''), experimentId: typeof value.experimentId === 'string' ? value.experimentId : null, providerId: String(value.providerId ?? 'local-mock'), modelId: String(value.modelId ?? 'deterministic-v1') });
  });
  ipcMain.handle(IPC.conversationSave, (_event, id: unknown, patch: unknown): Promise<Conversation> => { if (typeof id !== 'string' || !patch || typeof patch !== 'object') throw new Error('会话更新无效'); return conversations.save(id, patch as Partial<Conversation>); });
  ipcMain.handle(IPC.conversationDelete, (_event, id: unknown): Promise<void> => { if (typeof id !== 'string') throw new Error('会话 ID 无效'); return conversations.remove(id); });
  ipcMain.handle(IPC.conversationAppend, (_event, id: unknown, message: unknown): Promise<Conversation> => { if (typeof id !== 'string' || !message || typeof message !== 'object') throw new Error('会话消息无效'); return conversations.append(id, message as Omit<ConversationMessage, 'id' | 'createdAt'>); });
  ipcMain.handle(IPC.reportExportPdf, async (_event, html: unknown, filename: unknown): Promise<string> => {
    if (typeof html !== 'string' || html.length > 5_000_000 || typeof filename !== 'string') throw new Error('报告内容无效');
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'report.pdf'; const dir = join(app.getPath('userData'), 'reports'); await mkdir(dir, { recursive: true }); const output = join(dir, safe.endsWith('.pdf') ? safe : safe + '.pdf');
    const reportWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try { await reportWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); const pdf = await reportWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }); await writeFile(output, pdf); return output; }
    finally { if (!reportWindow.isDestroyed()) reportWindow.close(); }
  });
}

function hardenWebContents(window: BrowserWindow, devOrigin: string | undefined): void {
  // No in-app navigation and no child windows: the renderer is a fixed local app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (devOrigin === undefined || URL.parse(url)?.origin !== devOrigin) event.preventDefault();
  });
}

function createWindow(): BrowserWindow {
  const devUrl = isDev && process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL'])
    : undefined;
  if (devUrl !== undefined && devUrl.protocol !== 'http:' && devUrl.protocol !== 'https:') {
    throw new Error('ELECTRON_RENDERER_URL must use HTTP or HTTPS');
  }
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: !isSmoke || pointCloudSmoke !== undefined,
    ...(pointCloudSmoke ? { alwaysOnTop: true } : {}),
    backgroundColor: '#0b0e14',
    title: 'LabScope',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      ...(pointCloudSmoke ? { backgroundThrottling: false } : {}),
    },
  });

  hardenWebContents(window, devUrl?.origin);

  if (devUrl !== undefined) {
    void window.loadURL(devUrl.href);
  } else {
    void window.loadFile(join(currentDir, '../renderer/index.html'));
  }

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

/** Poll a predicate with a deadline; used by the smoke test only. */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Hidden-window check against the M0 ROS 2 test stack. Requests and telemetry
 * pass through the same preload API that the desktop UI uses.
 */
async function runSmoke(window: BrowserWindow, config: ConfigStore): Promise<void> {
  const checks: SmokeCheck[] = [];
  const record = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
    console.log(`[smoke] ${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
  };

  const urlArgIndex = process.argv.indexOf('--url');
  const url =
    urlArgIndex !== -1 && process.argv[urlArgIndex + 1] !== undefined
      ? (process.argv[urlArgIndex + 1] as string)
      : config.read().lastUrl;

  try {
    await waitFor(async () => {
      if (window.webContents.isLoading()) return false;
      return window.webContents.executeJavaScript('document.querySelector("#root main") !== null');
    }, 10_000, 'desktop UI');

    // 1) Renderer + preload bridge: this call can only work if contextBridge
    //    exposed getAppInfo and main answered the IPC handler.
    const title = (await window.webContents.executeJavaScript('document.title')) as string;
    record('renderer loaded', title.includes('LabScope'), `document.title=${JSON.stringify(title)}`);

    const bridgedVersion = (await window.webContents.executeJavaScript(
      'window.labscope.getAppInfo().then((info) => `${info.electron}|${info.chrome}`)',
    )) as string;
    record('preload bridge + IPC', /^\d+\.\d+/.test(bridgedVersion), `electron|chrome=${bridgedVersion}`);

    await window.webContents.executeJavaScript(`window.labscope.connect(${JSON.stringify(url)})`);
    await waitFor(() => ['connected', 'error'].includes(host.getStatus().state), 20_000, 'connection');
    const status = host.getStatus();
    if (status.state === 'error') throw new Error(status.error ?? 'Bridge connection failed');
    record('bridge connected', Boolean(status.subprotocol), `subprotocol=${status.subprotocol ?? '-'}`);

    const sensorTypes = ['sensor_msgs/msg/Imu', 'sensor_msgs/msg/PointCloud2'];
    const hasSensorSchema = (type: string): boolean => host.getStatus().channels.some(
      (channel) => channel.schemaName === type && channel.schemaBytes > 0,
    );
    await waitFor(() => sensorTypes.every(hasSensorSchema), 10_000, 'IMU and PointCloud2 schemas');
    const topics = host.getStatus().channels
      .filter((channel) => sensorTypes.includes(channel.schemaName) && channel.schemaBytes > 0)
      .map((channel) => channel.topic);
    record('sensor topics and schemas discovered', true, topics.join(', '));

    const telemetry: TelemetryPayload = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const topics = ${JSON.stringify(topics)};
        const timer = setTimeout(() => finish(reject, new Error('Timed out waiting for decoded telemetry')), 20000);
        const unsubscribe = window.labscope.onTelemetry((payload) => {
          const decoded = payload.topics.filter((topic) => topic.sample !== undefined);
          if (topics.every((name) => decoded.some((topic) => topic.topic === name))) {
            finish(resolve, payload);
          }
        });
        function finish(callback, value) {
          clearTimeout(timer);
          unsubscribe();
          callback(value);
        }
        window.labscope.subscribe(topics).catch((error) => finish(reject, error));
      })
    `);
    record('decoded telemetry received by renderer', true, `messages=${telemetry.totalMessages} topics=${telemetry.topics.length}`);
    const decodeErrors = telemetry.topics.reduce((sum, topic) => sum + topic.decodeErrors, 0);
    record('no decode errors', decodeErrors === 0, `decodeErrors=${decodeErrors}`);

    const imu = telemetry.topics.find((topic) => topic.schemaName === 'sensor_msgs/msg/Imu');
    const sample = imu?.sample as { header?: { frame_id?: string }; orientation?: { w?: number } } | undefined;
    record(
      'IMU sample has header + orientation',
      typeof sample?.header?.frame_id === 'string' && typeof sample?.orientation?.w === 'number',
      `frame_id=${sample?.header?.frame_id ?? '-'}`,
    );

    await window.webContents.executeJavaScript('window.labscope.disconnect()');
    await waitFor(() => host.getStatus().state === 'disconnected', 5_000, 'disconnection');
    record('bridge disconnected', true, 'session disconnected through IPC');

    const workspace = await window.webContents.executeJavaScript(`
      (async () => {
        const key = 'labscope.live.stats-position';
        const saved = localStorage.getItem(key);
        const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
        const navigate = async (label) => {
          const button = [...document.querySelectorAll('nav button')].find((item) => item.textContent === label);
          if (!button) throw new Error('Missing navigation: ' + label);
          button.click();
          await turn();
        };
        const selector = '[data-testid="stats-position"]';
        try {
          localStorage.removeItem(key);
          await navigate('实时');
          const choice = document.querySelector(selector);
          if (choice?.value !== 'top') return false;
          choice.value = 'side';
          choice.dispatchEvent(new Event('change', { bubbles: true }));
          await turn();
          if (!document.querySelector('aside[aria-label="会话统计"]')) return false;
          await navigate('首页');
          await navigate('实时');
          return document.querySelector(selector)?.value === 'side';
        } finally {
          if (saved === null) localStorage.removeItem(key);
          else localStorage.setItem(key, saved);
        }
      })()
    `);
    record('workspace layout preference', workspace === true, 'switches to side and restores after navigating back');

    const workspacePhase = process.argv.find((arg) => arg.startsWith('--smoke-workspace='))?.split('=')[1];
    if (workspacePhase === 'save' || workspacePhase === 'restore') {
      const layout = await runWorkspaceSmoke(window.webContents, url, workspacePhase, process.argv.includes('--smoke-spatial-workspace'));
      console.log('WORKSPACE_LAYOUT ' + layout);
      record('visualization workspace ' + workspacePhase, true, 'three panels and independent live topics');
    }
  } catch (error) {
    record('smoke run', false, error instanceof Error ? error.message : String(error));
  }

  const passed = checks.length > 0 && checks.every((check) => check.ok);
  console.log(`SMOKE_RESULT ${JSON.stringify({ passed, checks, url })}`);
  if (passed) {
    window.close();
    return;
  }
  await host.dispose();
  app.exit(1);
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  app.setAppUserModelId('com.labscope.desktop');
  Menu.setApplicationMenu(null);
  const config = new ConfigStore();
  const legacyRoot = 'D:/LabScope/data/experiments';
  const experimentRoot = process.platform === 'win32' && !hasProfileOverride && existsSync(legacyRoot)
    ? legacyRoot
    : join(app.getPath('userData'), 'experiments');
  recorder = new RecordingManager(experimentRoot);
  registerIpc(config, experimentRoot);

  mainWindow = createWindow();

  app.on('activate', () => {
    if (!isSmoke && BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  let quitRequested = false;
  let workerStopped = false;
  app.on('before-quit', (event) => {
    if (workerStopped) return;
    event.preventDefault();
    if (quitRequested) return;
    quitRequested = true;
    void host.dispose().finally(() => {
      workerStopped = true;
      app.quit();
    });
  });

  if (pointCloudSmoke) {
    await runPointCloudSmoke(mainWindow, app, Number(pointCloudSmoke.split('=')[1]), process.argv.includes('--full-3d'));
    mainWindow.close();
  } else if (mcapSmoke) {
    await runMcapSmoke(mainWindow, mcapSmoke.slice('--smoke-mcap='.length));
    mainWindow.close();
  } else if (isSimulationSmoke) {
    await runSimulationSmoke(mainWindow);
    console.log('SIMULATION_SMOKE_RESULT {"passed":true,"liveSession":"idle"}');
    mainWindow.close();
  } else if (isSmoke) {
    await runSmoke(mainWindow, config);
  }
}

// Name the app before the instance lock or config store resolves userData.
app.setName('LabScope');
const hasProfileOverride = process.argv.some((arg) => arg.startsWith('--user-data-dir='));
if (isSmoke || hasProfileOverride) {
  const profile = app.commandLine.getSwitchValue('user-data-dir');
  if (profile) app.setPath('userData', profile);
}
const singleInstance = !isSmoke && app.requestSingleInstanceLock();
if (!singleInstance && !isSmoke) {
  app.quit();
} else {
  if (!isDev) {
    app.on('second-instance', () => {
      if (mainWindow !== null) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
  void bootstrap().catch((error: unknown) => {
    console.error('[main] fatal:', error);
    app.exit(1);
  });
}

export {};
