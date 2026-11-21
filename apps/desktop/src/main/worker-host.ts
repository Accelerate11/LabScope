import { Worker } from 'node:worker_threads';

import type { RecordingWorkerRequest, WorkerEvent, WorkerRequest } from '../shared/api';
import type { RecordingChannelEvent, RecordingMessageEvent, SessionStatus, TelemetryPayload } from '../shared/types';

export interface WorkerHostCallbacks {
  onStatus(status: SessionStatus): void;
  onTelemetry(payload: TelemetryPayload): void;
  onLog(level: 'info' | 'warn' | 'error', message: string): void;
  onRecordingChannel?(channel: RecordingChannelEvent): void;
  onRecordingMessage?(message: RecordingMessageEvent): void;
}

/**
 * Owns the data worker thread and the latest snapshot of its state.
 *
 * The main process never touches ROS protocol code: it forwards validated
 * requests to the worker and hands the worker's small JSON events to the
 * renderer. Keeping the latest snapshot here also lets a newly opened window
 * render immediately instead of waiting for the next push event.
 */
export class DataWorkerHost {
  private worker: Worker | null = null;
  private panelTopics: string[] = [];
  private status: SessionStatus = { state: 'idle', channels: [], subscribed: [], connectAttempt: 0, reconnects: 0 };
  private telemetry: TelemetryPayload = { topics: [], totalMessages: 0, totalBytes: 0, uptimeMs: 0, timestamp: 0 };
  private disposed = false;

  constructor(
    private readonly workerPath: string,
    private readonly callbacks: WorkerHostCallbacks,
  ) {}

  getStatus(): SessionStatus {
    return this.status;
  }

  getTelemetry(): TelemetryPayload {
    return this.telemetry;
  }

  private ensureWorker(): Worker {
    if (this.disposed) throw new Error('data worker is shutting down');
    if (this.worker !== null) return this.worker;
    const worker = new Worker(this.workerPath);
    worker.on('message', (event: WorkerEvent) => this.handleEvent(event));
    worker.on('error', (error) => {
      this.callbacks.onLog('error', `data worker crashed: ${error.message}`);
      this.status = { ...this.status, state: 'error', error: error.message };
      this.callbacks.onStatus(this.status);
    });
    worker.on('exit', (code) => {
      if (this.disposed) return;
      this.worker = null;
      if (code !== 0) {
        this.callbacks.onLog('error', `data worker exited with code ${code}`);
        this.status = { ...this.status, state: 'error', error: `data worker exited (${code})` };
        this.callbacks.onStatus(this.status);
      }
    });
    this.worker = worker;
    if (this.panelTopics.length > 0) {
      worker.postMessage({ type: 'panel-topics', topics: this.panelTopics } satisfies WorkerRequest);
    }
    return worker;
  }

  private handleEvent(event: WorkerEvent): void {
    switch (event.type) {
      case 'status':
        this.status = event.status;
        this.callbacks.onStatus(event.status);
        return;
      case 'telemetry':
        this.telemetry = event.payload;
        this.callbacks.onTelemetry(event.payload);
        return;
      case 'log':
        this.callbacks.onLog(event.entry.level, event.entry.message);
        return;
      case 'recording-channel':
        this.callbacks.onRecordingChannel?.(event.channel);
        return;
      case 'recording-message':
        this.callbacks.onRecordingMessage?.(event.message);
        return;
      default:
        return;
    }
  }

  private send(request: WorkerRequest): SessionStatus {
    this.ensureWorker().postMessage(request);
    return this.status;
  }

  connect(url: string): SessionStatus {
    this.status = { ...this.status, state: 'connecting', url, error: undefined, channels: [], subscribed: [] };
    this.callbacks.onStatus(this.status);
    return this.send({ type: 'connect', url });
  }

  disconnect(): SessionStatus {
    return this.send({ type: 'disconnect' });
  }

  subscribe(topics: string[]): SessionStatus {
    return this.send({ type: 'subscribe', topics });
  }

  setPanelTopics(topics: string[]): void {
    this.panelTopics = topics;
    this.worker?.postMessage({ type: 'panel-topics', topics } satisfies WorkerRequest);
  }

  startRecording(topics: string[]): void {
    this.ensureWorker().postMessage({ type: 'recording-start', topics } satisfies RecordingWorkerRequest);
  }
  stopRecording(): void {
    this.worker?.postMessage({ type: 'recording-stop' } satisfies RecordingWorkerRequest);
  }

  requestStatus(): SessionStatus {
    return this.send({ type: 'status' });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const worker = this.worker;
    this.worker = null;
    if (worker !== null) {
      await worker.terminate().catch((error: unknown) => {
        this.callbacks.onLog('error', `data worker termination failed: ${String(error)}`);
      });
    }
  }
}
