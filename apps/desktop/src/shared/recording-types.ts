export type Compression = 'none' | 'zstd' | 'lz4';
export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopping' | 'error';
export interface RecordingOptions { name: string; project: string; operator?: string; notes?: string; tags?: string[]; outputDir?: string; compression?: Compression; maxSegmentBytes?: number; maxSegmentMs?: number; queueCapacity?: number; }
export interface RawRecordingChannel { topic: string; schemaName: string; schema: string; channelId?: number; }
export interface RawRecordingMessage { topic: string; schemaName: string; schema?: string; logTimeNs: string; sequence: number; payload: Uint8Array; }
export interface RecordingStatus { state: RecordingState; experimentId: string | null; experimentDir: string | null; segment: number; startedAt: number | null; pausedMs: number; messageCount: number; byteCount: number; queueDepth: number; queueCapacity: number; queueHighWater: number; droppedMessages: number; pendingBytes: number; compression: Compression; error: string | null; }
export interface ExperimentManifest {
  schemaVersion: 1; experimentId: string; name: string; project: string; operator?: string; notes?: string; tags: string[];
  createdAt: string; startLogTimeNs: string | null; endLogTimeNs: string | null; compression: Compression;
  segments: { file: string; index: number; messageCount: number; byteCount: number; sha256?: string; status: 'complete'|'partial'|'corrupt' }[];
  events: { id: string; timeNs: string; type: string; title: string; description?: string; topic?: string }[];
  pauses: { startedAt: string; endedAt?: string }[]; integrity: { manifestSha256?: string };
}
