import { useEffect, useState } from 'react';
import {
  SimulationScenarioManager, faultIds, lidarPointCounts, scenarioIds, scenarioLabels, simulationSpeeds,
  type FaultId, type LidarPointCount, type ScenarioId, type SimulationDataSource, type SimulationSpeed,
} from '@labscope/simulation-engine';
import { messageBus } from './message-bus';
import { useWorkspaceStore } from './workspace-store';
import { timelineClock } from '../timeline/timeline-clock';

const field = 'focus-ring rounded border border-border bg-bg px-2 py-1 text-xs text-ink disabled:opacity-50';
const button = 'focus-ring rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-40';
const faultLabels: Record<FaultId, string> = {
  'message-drop': '丢包', 'message-delay': '延迟', 'timestamp-jitter': '时间抖动',
  'tf-missing': 'TF 缺失', 'tf-out-of-order': 'TF 乱序', 'nan-point': 'NaN 点',
  'invalid-pointcloud-schema': '点云字段错误', 'sensor-disconnect': '相机断开', 'burst-messages': '突发消息',
};

export function SimulationControls(): React.JSX.Element {
  const [manager] = useState(() => new SimulationScenarioManager(messageBus));
  const [id, setId] = useState<ScenarioId>('static-room');
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [count, setCount] = useState<LidarPointCount>(10_000);
  const [lidarOverlays, setLidarOverlays] = useState(false);
  const [seed, setSeed] = useState('42');
  const [faults, setFaults] = useState<FaultId[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<SimulationDataSource['diagnostics']>();
  const [error, setError] = useState<string>();
  const [generationMs, setGenerationMs] = useState<number>();

  useEffect(() => () => manager.reset(), [manager]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let lastUpdate = last;
    let generationTotal = 0;
    let generationSteps = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      const source = manager.source!;
      try {
        // Skip long host stalls instead of building up expensive sensor frames.
        const generatedBefore = source.diagnostics.generated;
        const started = performance.now();
        source.advance(Math.min(100, now - last));
        if (timelineClock.value.source !== 'simulation') {
          timelineClock.configure('simulation', 1_700_000_000_000_000_000n, 1_700_000_000_000_000_000n + BigInt(source.diagnostics.simTimeMs) * 1_000_000n);
        }
        timelineClock.setCurrent(1_700_000_000_000_000_000n + BigInt(source.diagnostics.simTimeMs) * 1_000_000n);
        if (source.diagnostics.generated !== generatedBefore) {
          generationTotal += performance.now() - started;
          generationSteps++;
        }
      } catch (cause) {
        manager.stop();
        setRunning(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      last = now;
      if (now - lastUpdate >= 250) {
        setStats(source.diagnostics);
        setGenerationMs(generationSteps ? generationTotal / generationSteps : undefined);
        generationTotal = 0;
        generationSteps = 0;
        lastUpdate = now;
      }
    }, 20);
    return () => clearInterval(timer);
  }, [manager, running]);

  function start(fullViewer: boolean): void {
    setError(undefined);
    try {
      if (seed.trim() === '') throw new Error('请输入随机种子');
      const source = manager.start(id, { speed, pointCount: count, seed: Number(seed), faults, lidarOverlays, markers: true });
      timelineClock.configure('simulation', 1_700_000_000_000_000_000n, 1_700_000_000_000_000_000n);
      timelineClock.play();
      if (fullViewer && !useWorkspaceStore.getState().openScene('simulation', '/points')) {
        manager.reset();
        throw new Error('工作区已满，请关闭一个面板');
      }
      setStats(source.diagnostics);
      setGenerationMs(undefined);
      setRunning(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <details data-simulation-controls className="shrink-0 rounded border border-border px-2 py-1 text-ink">
      <summary className="cursor-pointer text-xs">模拟数据 {running ? '· 运行中' : ''}</summary>
      <div className="flex flex-wrap items-end gap-2 py-2">
        <label className="grid gap-1 text-xs text-muted">场景
          <select data-simulation-scenario className={field} value={id} disabled={running} onChange={(event) => {
            const next = event.target.value as ScenarioId;
            setId(next);
            setFaults(next === 'noisy-sensor' ? ['timestamp-jitter', 'message-drop'] : []);
          }}>
            {scenarioIds.map((entry) => <option key={entry} value={entry}>{scenarioLabels[entry]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">点数
          <select data-simulation-point-count className={field} value={count} disabled={running}
            onChange={(event) => setCount(Number(event.target.value) as LidarPointCount)}>
            {lidarPointCounts.map((entry) => <option key={entry} value={entry}>{entry / 1000}k</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 py-1 text-[11px] text-muted">
          <input data-simulation-overlays type="checkbox" checked={lidarOverlays} disabled={running}
            onChange={(event) => setLidarOverlays(event.target.checked)} />
          三路点云
        </label>
        <label className="grid gap-1 text-xs text-muted">时钟
          <select className={field} value={speed} disabled={running}
            onChange={(event) => setSpeed(Number(event.target.value) as SimulationSpeed)}>
            {simulationSpeeds.map((entry) => <option key={entry} value={entry}>{entry}×</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">种子
          <input className={field + ' w-24'} type="number" min={0} max={4294967295} step={1}
            disabled={running} value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <button type="button" className={button} disabled={running} onClick={() => start(false)}>启动模拟</button>
        <button type="button" className={button} disabled={running} onClick={() => start(true)}>启动完整 3D 场景</button>
        <button type="button" className={button} disabled={!running} onClick={() => {
          manager.stop();
          timelineClock.pause();
          setStats(manager.source?.diagnostics);
          setRunning(false);
        }}>停止</button>
        <button type="button" className={button} disabled={!stats} onClick={() => {
          manager.reset();
          timelineClock.cancel();
          setRunning(false);
          setStats(undefined);
          setGenerationMs(undefined);
          setError(undefined);
        }}>重置</button>
      </div>
      <details>
        <summary className="cursor-pointer text-[11px] text-muted">故障注入</summary>
        <div className="flex flex-wrap gap-2 py-2">
          {faultIds.map((fault) => (
            <label key={fault} className="flex items-center gap-1 text-[11px] text-muted">
              <input type="checkbox" disabled={running} checked={faults.includes(fault)} onChange={(event) => {
                const checked = event.target.checked;
                setFaults((current) => checked ? [...current, fault] : current.filter((entry) => entry !== fault));
              }} />{faultLabels[fault]}
            </label>
          ))}
        </div>
      </details>
      {stats && <p data-simulation-generation-ms={generationMs} data-simulation-elapsed={stats.simTimeMs}
        className="py-1 text-[11px] text-muted">
        模拟时间 {(stats.simTimeMs / 1000).toFixed(2)} s · 已送达 {stats.delivered} · 延迟队列 {stats.delayed}
      </p>}
      {error && <p role="alert" className="py-1 text-[11px] text-danger">{error}</p>}
    </details>
  );
}
