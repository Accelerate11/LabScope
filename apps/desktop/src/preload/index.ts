import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../shared/ipc';
import type { LabScopeApi } from '../shared/api';
import type { DesktopConfig, LogEntry, SessionStatus, TelemetryPayload } from '../shared/types';
import type { ExperimentManifest, RecordingOptions, RecordingStatus } from '../shared/recording-types';
import type { AiProviderConfig, AiProviderInput, AiResponse } from '../shared/ai-types';

/**
 * The only bridge between the sandboxed renderer and Electron.
 *
 * One function per whitelisted channel; no generic `invoke(channel, ...)` escape
 * hatch, no Node objects, no filesystem access. If a future panel needs more,
 * it must be added here explicitly and reviewed as a security change.
 */
const api: LabScopeApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  setConfig: (patch: Partial<DesktopConfig>) => ipcRenderer.invoke(IPC.configSet, patch),

  connect: (url: string) => ipcRenderer.invoke(IPC.sessionConnect, url),
  disconnect: () => ipcRenderer.invoke(IPC.sessionDisconnect),
  subscribe: (topics: string[]) => ipcRenderer.invoke(IPC.sessionSubscribe, topics),
  setPanelTopics: (topics: string[]) => ipcRenderer.invoke(IPC.sessionPanelTopics, topics),
  getStatus: () => ipcRenderer.invoke(IPC.sessionStatus),

  onSessionStatus: (listener: (status: SessionStatus) => void) => {
    const handler = (_event: unknown, status: SessionStatus): void => listener(status);
    ipcRenderer.on(IPC.eventSessionStatus, handler);
    return () => ipcRenderer.removeListener(IPC.eventSessionStatus, handler);
  },
  onTelemetry: (listener: (payload: TelemetryPayload) => void) => {
    const handler = (_event: unknown, payload: TelemetryPayload): void => listener(payload);
    ipcRenderer.on(IPC.eventTelemetry, handler);
    return () => ipcRenderer.removeListener(IPC.eventTelemetry, handler);
  },
  onLog: (listener: (entry: LogEntry) => void) => {
    const handler = (_event: unknown, entry: LogEntry): void => listener(entry);
    ipcRenderer.on(IPC.eventLog, handler);
    return () => ipcRenderer.removeListener(IPC.eventLog, handler);
  },
  recordingStart: (options: RecordingOptions, topics: string[]) => ipcRenderer.invoke(IPC.recordingStart, options, topics),
  recordingPause: () => ipcRenderer.invoke(IPC.recordingPause),
  recordingResume: () => ipcRenderer.invoke(IPC.recordingResume),
  recordingStop: () => ipcRenderer.invoke(IPC.recordingStop),
  recordingCancel: () => ipcRenderer.invoke(IPC.recordingCancel),
  recordingList: () => ipcRenderer.invoke(IPC.recordingList),
  recordingEvent: (event: Omit<ExperimentManifest['events'][number], 'id'>) => ipcRenderer.invoke(IPC.recordingEvent, event),
  onRecordingStatus: (listener: (status: RecordingStatus) => void) => {
    const handler = (_event: unknown, status: RecordingStatus): void => listener(status);
    ipcRenderer.on(IPC.recordingStatus, handler);
    return () => ipcRenderer.removeListener(IPC.recordingStatus, handler);
  },
  aiProviders: () => ipcRenderer.invoke(IPC.aiProviders),
  aiProviderUpsert: (input: AiProviderInput) => ipcRenderer.invoke(IPC.aiProviderUpsert, input),
  aiProviderRemove: (id: string) => ipcRenderer.invoke(IPC.aiProviderRemove, id),
  aiProviderTest: (id: string) => ipcRenderer.invoke(IPC.aiProviderTest, id),
  aiChat: (id: string, prompt: string, maxTokens?: number) => ipcRenderer.invoke(IPC.aiChat, id, prompt, maxTokens),
};

contextBridge.exposeInMainWorld('labscope', api);
