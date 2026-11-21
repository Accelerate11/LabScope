import type { ExperimentManifest } from '../../../shared/recording-types';
export interface LocalSummary { experimentId: string; topics: number; segments: number; events: number; compression: string; durationMs: number | null; }
export function summarizeExperiment(experiment: ExperimentManifest): LocalSummary {
  const start = experiment.startLogTimeNs ? BigInt(experiment.startLogTimeNs) : null;
  const end = experiment.endLogTimeNs ? BigInt(experiment.endLogTimeNs) : null;
  return { experimentId: experiment.experimentId, topics: 0, segments: experiment.segments.length,
    events: experiment.events.length, compression: experiment.compression,
    durationMs: start !== null && end !== null ? Number(end - start) / 1e6 : null };
}
export function buildLocalContext(experiment: ExperimentManifest): string {
  const summary = summarizeExperiment(experiment);
  return [
    'This is deterministic local metadata from LabScope.', 'Experiment: ' + experiment.name,
    'Project: ' + experiment.project, 'Segments: ' + summary.segments, 'Events: ' + summary.events,
    'Compression: ' + summary.compression, 'Start: ' + (experiment.startLogTimeNs ?? 'unknown'),
    'End: ' + (experiment.endLogTimeNs ?? 'unknown'),
    'Do not infer sensor values that are absent from this metadata.',
  ].join('\n');
}
