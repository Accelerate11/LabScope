import { create } from 'zustand';

import type {
  AppInfo,
  DesktopConfig,
  LogEntry,
  SessionStatus,
  TelemetryPayload,
} from '../../shared/types';
import { messageBus } from './workspace/message-bus';

export type PageId = 'home' | 'live' | 'data' | 'playback' | 'ai' | 'settings';

const EMPTY_STATUS: SessionStatus = {
  state: 'idle',
  channels: [],
  subscribed: [],
  connectAttempt: 0,
  reconnects: 0,
};

const EMPTY_TELEMETRY: TelemetryPayload = {
  topics: [],
  totalMessages: 0,
  totalBytes: 0,
  uptimeMs: 0,
  timestamp: 0,
};

interface AppStore {
  ready: boolean;
  appInfo: AppInfo | null;
  config: DesktopConfig | null;
  status: SessionStatus;
  telemetry: TelemetryPayload;
  logs: LogEntry[];
  page: PageId;
  selectedTopic: string | null;
  urlInput: string;
  error: string | null;

  init(): Promise<void>;
  setPage(page: PageId): void;
  setUrlInput(url: string): void;
  selectTopic(topic: string): void;
  clearError(): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(topic: string): Promise<void>;
  subscribeAll(): Promise<void>;
  saveDefaultUrl(url: string): Promise<void>;
}

const MAX_LOGS = 200;

/** Guarded so React StrictMode's double mount cannot register listeners twice. */
let listenersBound = false;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function syncPanelSession(status: SessionStatus): void {
  if (status.state !== 'connected') {
    messageBus.reset('live');
    messageBus.setChannels('live', EMPTY_STATUS.channels);
    return;
  }
  messageBus.setChannels('live', status.channels);
}

export const useAppStore = create<AppStore>()((set, get) => ({
  ready: false,
  appInfo: null,
  config: null,
  status: EMPTY_STATUS,
  telemetry: EMPTY_TELEMETRY,
  logs: [],
  page: 'home',
  selectedTopic: null,
  urlInput: 'ws://127.0.0.1:8765',
  error: null,

  async init() {
    const api = window.labscope;
    if (api === undefined) {
      set({ ready: true, error: '当前页面不在 Electron 中运行，桌面 API 不可用。' });
      return;
    }

    try {
      const [appInfo, config, status] = await Promise.all([
        api.getAppInfo(),
        api.getConfig(),
        api.getStatus(),
      ]);
      syncPanelSession(status);
      set({ appInfo, config, status, urlInput: config.lastUrl, ready: true });

      if (!listenersBound) {
        listenersBound = true;
        api.onSessionStatus((next) => {
          syncPanelSession(next);
          set({ status: next });
        });
        api.onTelemetry((payload) => {
          const state = get();
          if (state.status.state === 'connected') messageBus.publishLive(payload);
          const selected =
            state.selectedTopic ??
            payload.topics.find((topic) => topic.sample !== undefined)?.topic ??
            null;
          set({ telemetry: payload, selectedTopic: selected });
        });
        api.onLog((entry) =>
          set((state) => ({ logs: [...state.logs.slice(-MAX_LOGS + 1), entry] })),
        );
      }
    } catch (error) {
      set({ ready: true, error: messageOf(error) });
    }
  },

  setPage(page) {
    set({ page });
  },

  setUrlInput(urlInput) {
    set({ urlInput });
  },

  clearError() {
    set({ error: null });
  },

  selectTopic(topic) {
    set({ selectedTopic: topic });
  },

  async connect() {
    const url = get().urlInput.trim();
    if (url.length === 0) {
      set({ error: '请输入机器人地址，例如 ws://127.0.0.1:8765' });
      return;
    }
    set({ error: null, telemetry: EMPTY_TELEMETRY, selectedTopic: null });
    messageBus.reset('live');
    try {
      const status = await window.labscope.connect(url);
      set({ status });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },

  async disconnect() {
    try {
      const status = await window.labscope.disconnect();
      messageBus.reset('live');
      set({ status, telemetry: EMPTY_TELEMETRY, selectedTopic: null });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },

  async subscribe(topic) {
    try {
      const status = await window.labscope.subscribe([topic]);
      set({ status, selectedTopic: get().selectedTopic ?? topic });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },

  async subscribeAll() {
    const { status } = get();
    const topics = status.channels
      .map((channel) => channel.topic)
      .filter(
        (topic) =>
          !topic.includes('sysinfo') && topic !== '/rosout' && topic !== '/parameter_events',
      );
    if (topics.length === 0) return;
    try {
      const next = await window.labscope.subscribe(topics);
      set({ status: next });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },

  async saveDefaultUrl(url) {
    try {
      const config = await window.labscope.setConfig({ lastUrl: url });
      set({ config, urlInput: config.lastUrl });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },
}));
