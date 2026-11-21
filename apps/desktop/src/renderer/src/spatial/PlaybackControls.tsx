import { useEffect, useRef, useState } from 'react';
import { messageBus } from '../workspace/message-bus';
import { useWorkspaceStore } from '../workspace/workspace-store';
import type { McapPlaybackDataSource, PlaybackState } from './mcap-playback';

const button = 'focus-ring rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-40';
const seconds = (ms: number) => (ms / 1000).toFixed(2);

export function PlaybackControls(): React.JSX.Element {
  const source = useRef<McapPlaybackDataSource | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<PlaybackState>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<number>();
  useEffect(() => () => {
    ++generation.current;
    source.current?.close();
    source.current = null;
  }, []);

  async function load(file: File): Promise<void> {
    const token = ++generation.current;
    source.current?.close();
    source.current = null;
    setName(file.name);
    setState(undefined);
    setLoading(true);
    setDraft(undefined);
    setError(undefined);
    try {
      const { McapPlaybackDataSource } = await import('./mcap-playback');
      const playback = await McapPlaybackDataSource.open(file, messageBus, (value) => {
        if (token === generation.current) setState(value);
      });
      if (token !== generation.current) return;
      source.current = playback;
      playback.mount();
      const points = playback.topics.find(({ schemaName }) => schemaName === 'sensor_msgs/msg/PointCloud2');
      const opened = useWorkspaceStore.getState().openScene('playback', points?.topic ?? null);
      if (!opened) setError('工作区已满。请关闭一个面板，或把已有 Viewer3D 绑定为回放源。');
    } catch (error) {
      if (token === generation.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }

  function commitSeek(value: number): void {
    setDraft(undefined);
    void source.current?.seek(value);
  }

  return (
    <section aria-label="本地 MCAP 回放" className="shrink-0 rounded border border-border p-2 text-xs text-ink">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted">本地 MCAP
          <input data-mcap-file className="ml-2 max-w-52 text-ink" type="file" accept=".mcap"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void load(file);
              event.target.value = '';
            }} />
        </label>
        {state && <>
          <button type="button" className={button} disabled={state.seeking}
            onClick={() => state.running ? source.current?.stop() : source.current?.start()}>
            {state.running ? '暂停' : '播放'}
          </button>
          <button type="button" className={button} disabled={state.seeking} onClick={() => commitSeek(0)}>回到开头</button>
          <input aria-label="回放时间" type="range" min={0} max={Math.max(1, state.durationMs)} step={1}
            value={draft ?? state.timeMs} disabled={state.seeking || state.durationMs < 1}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
            onKeyUp={(event) => { if (draft !== undefined) commitSeek(draft); }} />
          <span className="mono">{seconds(draft ?? state.timeMs)} / {seconds(state.durationMs)} s</span>
          <select className={button} aria-label="回放倍率" value={state.rate}
            onChange={(event) => source.current?.setPlaybackRate(Number(event.target.value))}>
            {[0.25, 0.5, 1, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
          <button type="button" className={button} onClick={() => {
            ++generation.current;
            source.current?.close();
            source.current = null;
            setState(undefined);
            setName('');
            setError(undefined);
            setDraft(undefined);
          }}>关闭文件</button>
        </>}
        {loading && <span>正在读取 {name}</span>}
        {state?.seeking && <span>正在重建回放场景…</span>}
      </div>
      {(error || state?.error) && <p role="alert" className="mt-1 text-danger">{error ?? state?.error}</p>}
    </section>
  );
}
