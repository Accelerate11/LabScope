export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN';
export interface LogRecord {
  timestamp: string | null; timestampNs: string | null; severity: LogSeverity; source: string;
  node: string | null; message: string; file: string | null; lineNumber: number; rawText: string; metadata: Record<string, string>;
}
export interface LogCluster { key: string; severity: LogSeverity; count: number; firstTimestamp: string | null; lastTimestamp: string | null; examples: string[]; records: number[]; }
export interface LogAnalysis { records: LogRecord[]; counts: Record<LogSeverity, number>; clusters: LogCluster[]; errorWindows: { start: string | null; end: string | null; count: number }[]; }
export interface AnalysisEvidence { sourceFiles: string[]; topics: string[]; startNs: string | null; endNs: string | null; messageCount?: number; details?: string; }
export interface TopicAnalysis { topic: string; schemaName: string; messageCount: number; firstNs: string | null; lastNs: string | null; frequencyHz: number | null; meanIntervalMs: number | null; maxGapMs: number | null; timestampJitterMs: number | null; }
export interface SensorAnalysis { topic: string; samples: number; maxMagnitude: number | null; meanMagnitude: number | null; stddevMagnitude: number | null; maxAtNs: string | null; }
export interface ExperimentAnalysis {
  experimentId: string; experimentName: string; generatedAt: string; topics: TopicAnalysis[]; imu: SensorAnalysis[];
  pointCloud: { topic: string; samples: number; meanPoints: number | null; minPoints: number | null; maxPoints: number | null; invalidPoints: number }[];
  events: { id: string; timeNs: string; type: string; title: string; topic?: string }[]; evidence: AnalysisEvidence[]; warnings: string[];
}

const severityFor = (value: string): LogSeverity => {
  const normalized = value.toUpperCase();
  if (normalized === 'WARNING') return 'WARN';
  return ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(normalized) ? normalized as LogSeverity : 'UNKNOWN';
};
const timestamp = '(?<timestamp>\\d{4}[-/]\\d{2}[-/]\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d{1,9})?(?:Z|[+-]\\d{2}:?\\d{2})?)';
const patterns = [
  new RegExp(`^${timestamp}\\s+\\[?(?<severity>DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)\\]?\\s+(?<rest>.*)$`, 'i'),
  /^(?<severity>DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)[:\\s]+(?<rest>.*)$/i,
  new RegExp(`^${timestamp}\\s+(?<rest>.*)$`, 'i'),
];
export function parseLogText(text: string, source = 'memory'): LogAnalysis {
  const records: LogRecord[] = []; const counts: Record<LogSeverity, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, UNKNOWN: 0 };
  for (const [index, rawText] of text.replace(/\r\n/g, '\n').split('\n').entries()) {
    if (!rawText.trim()) continue;
    let match: RegExpMatchArray | null = null; for (const pattern of patterns) { match = rawText.match(pattern); if (match) break; }
    const groups = match?.groups ?? {}; const severity = severityFor(groups.severity ?? (/(ERROR|FATAL|WARN(?:ING)?)/i.exec(rawText)?.[1] ?? 'UNKNOWN'));
    const message = (groups.rest ?? rawText).replace(/^(?:DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)[:\s]+/i, '').trim(); const node = /(?:node|logger|name)[=: ]+([\w./-]+)/i.exec(message)?.[1] ?? null;
    const file = /(?:at |file=)([^: ]+)(?::(\\d+))?/i.exec(message); const timestampValue = groups.timestamp ?? null;
    records.push({ timestamp: timestampValue, timestampNs: null, severity, source, node, message, file: file?.[1] ?? null, lineNumber: index + 1, rawText, metadata: {} }); counts[severity] += 1;
  }
  const grouped = new Map<string, LogCluster>();
  records.forEach((record, index) => { if (record.severity !== 'ERROR' && record.severity !== 'FATAL') return; const key = record.message.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim(); const cluster = grouped.get(key) ?? { key, severity: record.severity, count: 0, firstTimestamp: record.timestamp, lastTimestamp: record.timestamp, examples: [], records: [] }; cluster.count += 1; cluster.lastTimestamp = record.timestamp; if (cluster.examples.length < 3) cluster.examples.push(record.message); cluster.records.push(index + 1); grouped.set(key, cluster); });
  const errorRecords = records.filter((record) => record.severity === 'ERROR' || record.severity === 'FATAL');
  return { records, counts, clusters: [...grouped.values()].sort((a, b) => b.count - a.count), errorWindows: errorRecords.length ? [{ start: errorRecords[0]!.timestamp, end: errorRecords.at(-1)!.timestamp, count: errorRecords.length }] : [] };
}

export interface AnalysisTool { id: string; name: string; description: string; permission: 'read'; execute: (input: unknown) => Promise<unknown> | unknown; }
export class ToolRegistry {
  private readonly tools = new Map<string, AnalysisTool>();
  register(tool: AnalysisTool): void { if (this.tools.has(tool.id)) throw new Error(`analysis tool already registered: ${tool.id}`); this.tools.set(tool.id, tool); }
  list(): Pick<AnalysisTool, 'id' | 'name' | 'description' | 'permission'>[] { return [...this.tools.values()].map(({ id, name, description, permission }) => ({ id, name, description, permission })); }
  async execute(id: string, input: unknown): Promise<unknown> { const tool = this.tools.get(id); if (!tool) throw new Error(`unknown analysis tool: ${id}`); return tool.execute(input); }
}

export function markdownReport(analysis: ExperimentAnalysis, interpretation = ''): string {
  const lines = [`# Experiment Analysis · ${analysis.experimentName}`, '', `- Experiment ID: ${analysis.experimentId}`, `- Generated: ${analysis.generatedAt}`, '', '## Observed Facts', '', `- Topics analyzed: ${analysis.topics.length}`, `- Recorded events: ${analysis.events.length}`, ...analysis.warnings.map((warning) => `- Warning: ${warning}`), '', '## Computed Metrics', '', '| Topic | Messages | Frequency (Hz) | Mean interval (ms) | Max gap (ms) |', '| --- | ---: | ---: | ---: | ---: |', ...analysis.topics.map((topic) => `| ${topic.topic} | ${topic.messageCount} | ${topic.frequencyHz?.toFixed(3) ?? 'n/a'} | ${topic.meanIntervalMs?.toFixed(3) ?? 'n/a'} | ${topic.maxGapMs?.toFixed(3) ?? 'n/a'} |`), '', '## Sensor Analysis', '', ...analysis.imu.map((item) => `- ${item.topic}: ${item.samples} samples, max magnitude ${item.maxMagnitude?.toFixed(5) ?? 'n/a'}, mean ${item.meanMagnitude?.toFixed(5) ?? 'n/a'}`), '', '## Model Interpretation', '', interpretation || 'No model interpretation was requested. The metrics above were computed locally.', '', '## Evidence', '', ...analysis.evidence.map((item) => `- ${item.details ?? 'MCAP data'} · files ${item.sourceFiles.join(', ') || 'n/a'} · topics ${item.topics.join(', ') || 'n/a'} · ${item.startNs ?? 'n/a'} to ${item.endNs ?? 'n/a'}`)];
  return lines.join('\n') + '\n';
}

export function htmlReport(markdown: string): string {
  const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><meta charset="utf-8"><title>LabScope Experiment Report</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;line-height:1.5}pre{white-space:pre-wrap}</style><pre>${escaped}</pre>`;
}
