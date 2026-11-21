import type {
  AppInfo,
  DesktopConfig,
  LogEntry,
  SessionStatus,
  TelemetryPayload,
} from './types';
import type { RecordingChannelEvent, RecordingMessageEvent } from './types';
import type { RecordingOptions, RecordingStatus, ExperimentManifest } from './recording-types';
import type { AiProviderConfig, AiProviderInput, AiResponse } from './ai-types';

/**
 * The complete surface the renderer can reach. Everything else in Electron
 * (filesystem, shell, ipcRenderer, Node built-ins) stays unreachable because
 * contextIsolation is on and the preload only forwards these calls.
 */
export interface LabScopeApi {
  getAppInfo(): Promise<AppInfo>;
  getConfig(): Promise<DesktopConfig>;
  setConfig(patch: Partial<DesktopConfig>): Promise<DesktopConfig>;

  connect(url: string): Promise<SessionStatus>;
  disconnect(): Promise<SessionStatus>;
  subscribe(topics: string[]): Promise<SessionStatus>;
  setPanelTopics(topics: string[]): Promise<void>;
  getStatus(): Promise<SessionStatus>;

  onSessionStatus(listener: (status: SessionStatus) => void): () => void;
  onTelemetry(listener: (payload: TelemetryPayload) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
  recordingStart(options: RecordingOptions, topics: string[]): Promise<RecordingStatus>;
  recordingPause(): Promise<RecordingStatus>;
  recordingResume(): Promise<RecordingStatus>;
  recordingStop(): Promise<RecordingStatus>;
  recordingCancel(): Promise<RecordingStatus>;
  recordingList(): Promise<ExperimentManifest[]>;
  recordingEvent(event: Omit<ExperimentManifest['events'][number], 'id'>): Promise<void>;
  onRecordingStatus(listener: (status: RecordingStatus) => void): () => void;
  aiProviders(): Promise<AiProviderConfig[]>;
  aiProviderUpsert(input: AiProviderInput): Promise<AiProviderConfig[]>;
  aiProviderRemove(id: string): Promise<AiProviderConfig[]>;
  aiProviderTest(id: string): Promise<{ ok: boolean; message: string }>;
  aiChat(id: string, prompt: string, maxTokens?: number): Promise<AiResponse>;
}

/** Worker thread message contract (`main` <-> `data-worker`). */
export type WorkerRequest =
  | { type: 'connect'; url: string }
  | { type: 'disconnect' }
  | { type: 'subscribe'; topics: string[] }
  | { type: 'panel-topics'; topics: string[] }
  | { type: 'status' };

export type RecordingWorkerRequest =
  | { type: 'recording-start'; topics: string[] }
  | { type: 'recording-stop' };

export type WorkerEvent =
  | { type: 'status'; status: SessionStatus }
  | { type: 'telemetry'; payload: TelemetryPayload }
  | { type: 'log'; entry: LogEntry }
  | { type: 'recording-channel'; channel: RecordingChannelEvent }
  | { type: 'recording-message'; message: RecordingMessageEvent };
