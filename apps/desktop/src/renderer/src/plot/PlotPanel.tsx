import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { messageBus, type MessageEnvelope, type SourceId } from '../workspace/message-bus';
import { timelineClock } from '../timeline/timeline-clock';
import { defaultPlotConfig, plotColors, type PlotConfig, type PlotSeriesConfig } from './plot-types';
import { numericFieldPaths, readNumericField, TimeSeriesBuffer } from './time-series';
const field = 'focus-ring rounded border border-border bg-bg px-2 py-1 text-[11px] text-ink';
const button = 'focus-ring rounded border border-border px-2 py-1 text-[11px] text-ink hover:border-accent';
function useClock() {
  const subscribe = useCallback((listener: () => void) => timelineClock.subscribe(listener), []);
  return useSyncExternalStore(subscribe, () => timelineClock.value);
}
function useChannels(source: SourceId) {
  const subscribe = useCallback((listener: () => void) => messageBus.subscribeChannels(source, listener), [source]);
  const read = useCallback(() => messageBus.getChannels(source), [source]);
  return useSyncExternalStore(subscribe, read);
}
function useMessage(source: SourceId, topic: string): MessageEnvelope | undefined {
  const subscribe = useCallback((listener: () => void) => topic ? messageBus.subscribe(source, topic, listener) : () => {}, [source, topic]);
  const read = useCallback(() => topic ? messageBus.getLatest(source, topic) : undefined, [source, topic]);
  return useSyncExternalStore(subscribe, read);
}
function chooseColor(index: number): string { return plotColors[index % plotColors.length]!; }

export default function PlotPanel({ config, update }: { config: { id: string; source: SourceId; topic: string | null; plot?: PlotConfig }; update: (plot: PlotConfig) => void }): React.JSX.Element {
  const clock = useClock();
  const channels = useChannels(config.source);
  const topics = channels.filter(({ topic }) => topic === config.topic || true);
  const [settings, setSettings] = useState<PlotConfig>(config.plot ?? defaultPlotConfig);
  const [selectedTopic, setSelectedTopic] = useState(config.topic ?? topics[0]?.topic ?? '');
  const [fieldPath, setFieldPath] = useState(config.plot?.series[0]?.field ?? '');
  const [options, setOptions] = useState<string[]>([]);
  const [buffers] = useState(() => new Map<string, TimeSeriesBuffer>());
  const [cursor, setCursor] = useState<bigint>();
  const [stats, setStats] = useState<Record<string, ReturnType<TimeSeriesBuffer['stats']>>>({});
  const currentMessage = useMessage(config.source, selectedTopic);
  useEffect(() => {
    const detach = timelineClock.subscribe(() => setCursor(timelineClock.value.currentNs));
    return detach;
  }, []);
  useEffect(() => {
    if (!selectedTopic) return;
    const message = currentMessage;
    if (message?.payload.kind === 'decoded') setOptions(numericFieldPaths(message.payload.value));
  }, [selectedTopic, config.source, currentMessage?.sequence]);
  useEffect(() => {
    const topic = selectedTopic;
    if (!topic || !fieldPath) return;
    const sample = () => {
      const message = messageBus.getLatest(config.source, topic);
      if (!message || message.payload.kind !== 'decoded' || message.logTimeNs === null) return;
      const value = readNumericField(message.payload.value, fieldPath);
      if (value === undefined) return;
      const id = topic + ':' + fieldPath;
      const buffer = buffers.get(id) ?? new TimeSeriesBuffer(settings.series.find((s) => s.id === id)?.capacity ?? 100_000);
      buffers.set(id, buffer); buffer.append({ timeNs: BigInt(message.logTimeNs), value, sequence: message.sequence });
      setStats({ [id]: buffer.stats() });
    };
    const detach = messageBus.subscribe(config.source, topic, sample);
    sample();
    const timer = window.setInterval(sample, 50);
    return () => { detach(); window.clearInterval(timer); };
  }, [selectedTopic, fieldPath, config.source, settings.series]);
  const active = settings.series;
  const addSeries = () => {
    if (!selectedTopic || !fieldPath) return;
    const id = selectedTopic + ':' + fieldPath;
    if (active.some((s) => s.id === id)) return;
    const next: PlotSeriesConfig = { id, source: config.source, topic: selectedTopic, field: fieldPath, displayName: fieldPath, color: chooseColor(active.length), unit: '', visible: true, capacity: 100_000 };
    const updated = { ...settings, series: [...active, next] }; setSettings(updated); update(updated);
  };
  const removeSeries = (id: string) => { const updated = { ...settings, series: active.filter((s) => s.id !== id) }; setSettings(updated); update(updated); };
  const exportCsv = () => {
    const rows = ['series,time_ns,value'];
    for (const series of active) for (const sample of buffers.get(series.id)?.values() ?? []) rows.push([series.displayName, sample.timeNs, sample.value].join(','));
    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = 'labscope-plot.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const chart = useMemo(() => active.map((series) => {
    const samples = buffers.get(series.id)?.downsample(clock.startNs, clock.endNs, settings.maxPoints) ?? [];
    if (!samples.length) return null;
    const min = Math.min(...samples.map((s) => s.value)), max = Math.max(...samples.map((s) => s.value));
    return { series, samples, min, max };
  }).filter(Boolean), [active, stats, clock.currentNs, clock.startNs, clock.endNs, settings.maxPoints]);
  const visibleSeries = chart as { series: PlotSeriesConfig; samples: { timeNs: bigint; value: number }[]; min: number; max: number }[];
  return (
    <div data-plot-series={visibleSeries.length} data-plot-active={active.length} data-plot-stats={JSON.stringify(stats)} data-plot-topic={selectedTopic} data-plot-field={fieldPath} className="flex min-h-[220px] flex-1 flex-col gap-2 p-2 text-[11px] text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={selectedTopic} onChange={(e) => { setSelectedTopic(e.target.value); setFieldPath(''); }}>
          {!selectedTopic && <option value="">选择话题</option>}{topics.map(({ topic }) => <option key={topic}>{topic}</option>)}
        </select>
        <select className={field} value={fieldPath} onChange={(e) => setFieldPath(e.target.value)}>
          {!fieldPath && <option value="">选择字段</option>}{options.map((path) => <option key={path}>{path}</option>)}
        </select>
        <button className={button} type="button" disabled={!fieldPath} onClick={addSeries}>添加曲线</button>
        <button className={button} type="button" onClick={exportCsv}>导出 CSV</button>
        <span className="mono">t={clock.currentNs.toString()}</span>
      </div>
      <div className="relative min-h-[130px] flex-1 overflow-hidden rounded border border-border bg-bg">
        <svg viewBox="0 0 1000 300" className="h-full w-full" preserveAspectRatio="none">
          {visibleSeries.map(({ series, samples, min, max }) => {
            const start = clock.startNs, end = clock.endNs, span = Number(end - start) || 1;
            const points = samples.map((sample) => ((Number(sample.timeNs - start) / span) * 1000).toFixed(1) + ',' +
              (300 - ((sample.value - min) / (max - min || 1)) * 280 - 10).toFixed(1)).join(' ');
            return <polyline key={series.id} points={points} fill="none" stroke={series.color} strokeWidth="2" />;
          })}
          {clock.currentNs >= clock.startNs && <line x1={((Number(clock.currentNs - clock.startNs) / (Number(clock.endNs-clock.startNs)||1))*1000)} x2={((Number(clock.currentNs - clock.startNs) / (Number(clock.endNs-clock.startNs)||1))*1000)} y1="0" y2="300" stroke="#fff" strokeDasharray="4 4" />}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {active.map((series) => <span key={series.id} style={{ color: series.color }}>{series.displayName}
          <button className={button} type="button" onClick={() => removeSeries(series.id)}>×</button>
        </span>)}
        {active.map((series) => <span key={series.id + '-stats'}>{series.displayName} {stats[series.id]?.count ?? 0} samples</span>)}
      </div>
    </div>
  );
}
