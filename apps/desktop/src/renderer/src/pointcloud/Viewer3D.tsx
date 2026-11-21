import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { messageBus, type SourceId } from '../workspace/message-bus';
import type { PanelConfig } from '../workspace/panel-registry';
import { useWorkspaceStore } from '../workspace/workspace-store';
import { DEFAULT_LAYER_STYLE, MAX_CLOUD_LAYERS, type LayerStyle, type OverlayConfig, type PointCloudConfig } from './config';
import { COLOR_MODES, POINT_CLOUD_SCHEMA, type ColorMode, type SamplingMode } from './processor';
import { PointCloudViewerEngine, type LayerBinding, type ViewerStats } from './viewer-engine';
import { defaultScene, type SceneSettings } from '../spatial/scene-settings';
import { defaultCamera, viewPresets, type CameraState, type Projection, type ViewPreset } from '../spatial/camera-state';
import { SceneControls } from '../spatial/SceneControls';

const emptyConfig: PointCloudConfig = { primary: DEFAULT_LAYER_STYLE, overlays: [] };
const sources: Record<SourceId, string> = { simulation: '模拟', live: '实时', playback: '历史回放' };
const colorLabels: Record<ColorMode, string> = {
  xyz: '固定颜色', intensity: '强度', rgb: 'RGB / RGBA', height: '高度 Z', distance: '到原点距离',
};
const presetLabels: Record<ViewPreset, string> = { top: '顶视', bottom: '底视', front: '前视', back: '后视', left: '左视', right: '右视' };
const field = 'focus-ring min-w-0 rounded border border-border bg-bg px-2 py-1 text-[11px] text-ink';
const button = 'focus-ring rounded border border-border px-2 py-1 text-[11px] text-ink hover:border-accent disabled:opacity-40';
const options = [1_000, 10_000, 50_000, 100_000, 500_000];

function useCloudTopics(source: SourceId) {
  const subscribe = useCallback((notify: () => void) => messageBus.subscribeChannels(source, notify), [source]);
  const read = useCallback(() => messageBus.getChannels(source), [source]);
  return useSyncExternalStore(subscribe, read).filter(({ schemaName }) => schemaName === POINT_CLOUD_SCHEMA);
}

function layerId({ source, topic }: Pick<LayerBinding, 'source' | 'topic'>): string {
  return JSON.stringify([source, topic]);
}

function LayerFields({ style, update }: { style: LayerStyle; update(style: LayerStyle): void }): React.JSX.Element {
  const maxPoints = options.includes(style.maxPoints) ? options : [style.maxPoints, ...options];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">名称
        <input className={field + ' w-24'} maxLength={80} value={style.displayName ?? ''}
          onChange={(e) => update({ ...style, displayName: e.target.value || undefined })} />
      </label>
      <label className="flex items-center gap-1">
        <input data-cloud-visible type="checkbox" checked={style.visible}
          onChange={(event) => update({ ...style, visible: event.target.checked })} />可见
      </label>
      {style.colorMode === 'xyz' && <input type="color" aria-label="固定颜色" value={style.fixedColor ?? '#52c0f1'}
        onChange={(e) => update({ ...style, fixedColor: e.target.value })} />}
      {(style.colorMode === 'intensity' || style.colorMode === 'height') && (
        <ColorRange key={style.colorMode} range={style.colorMode === 'height' ? style.heightRange : style.intensityRange}
          update={(range) => update({ ...style, [style.colorMode === 'height' ? 'heightRange' : 'intensityRange']: range })} />
      )}
      <label className="flex items-center gap-1">颜色
        <select data-cloud-color className={field} value={style.colorMode}
          onChange={(event) => update({ ...style, colorMode: event.target.value as ColorMode })}>
          {COLOR_MODES.map((mode) => <option key={mode} value={mode}>{colorLabels[mode]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">点大小
        <input data-cloud-size className="w-16 accent-accent" type="range" min={1} max={12} value={style.pointSize}
          onChange={(event) => update({ ...style, pointSize: Number(event.target.value) })} />{style.pointSize}
      </label>
      <label className="flex items-center gap-1">点数上限
        <select data-cloud-max className={field} value={style.maxPoints}
          onChange={(event) => update({ ...style, maxPoints: Number(event.target.value) })}>
          {maxPoints.map((count) => <option key={count} value={count}>{count.toLocaleString()}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">采样
        <select data-cloud-sampling className={field} value={style.sampling}
          onChange={(event) => update({ ...style, sampling: event.target.value as SamplingMode })}>
          <option value="uniform">均匀</option><option value="first">按起始顺序</option>
        </select>
      </label>
    </div>
  );
}

function ColorRange({ range, update }: { range?: [number, number]; update(value?: [number, number]): void }) {
  const [lower, setLower] = useState(String(range?.[0] ?? ''));
  const [upper, setUpper] = useState(String(range?.[1] ?? ''));
  const min = Number(lower), max = Number(upper);
  return (
    <div className="flex items-center gap-1">
      <input type="number" className={field + ' w-16'} aria-label="颜色范围最小值" placeholder="最小"
        value={lower} onChange={(event) => setLower(event.target.value)} />
      <input type="number" className={field + ' w-16'} aria-label="颜色范围最大值" placeholder="最大"
        value={upper} onChange={(event) => setUpper(event.target.value)} />
      <button className={button} disabled={!lower || !upper || !Number.isFinite(min) || !Number.isFinite(max) || min >= max}
        onClick={() => update([min, max])}>应用范围</button>
      <button className={button} disabled={!range} onClick={() => { setLower(''); setUpper(''); update(); }}>自动范围</button>
    </div>
  );
}

function AddLayer({ source, layers, add }: {
  source: SourceId; layers: readonly LayerBinding[]; add(entry: OverlayConfig): void;
}): React.JSX.Element {
  const [newSource, setSource] = useState(source);
  const [preferredTopic, setTopic] = useState('');
  const topics = useCloudTopics(newSource).filter(({ topic }) => !layers.some((entry) =>
    entry.source === newSource && entry.topic === topic));
  const topic = topics.some((entry) => entry.topic === preferredTopic) ? preferredTopic : topics[0]?.topic ?? '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="叠加数据源" data-cloud-add-source className={field} value={newSource}
        onChange={(event) => setSource(event.target.value as SourceId)}>
        {(Object.keys(sources) as SourceId[]).map((id) => <option value={id} key={id}>{sources[id]}</option>)}
      </select>
      <select aria-label="叠加话题" data-cloud-add-topic className={field} value={topic}
        onChange={(event) => setTopic(event.target.value)}>
        {!topic && <option value="">无可用点云话题</option>}
        {topics.map((entry) => <option key={entry.topic} value={entry.topic}>{entry.topic}</option>)}
      </select>
      <button type="button" className={button} disabled={!topic || layers.length >= MAX_CLOUD_LAYERS}
        onClick={() => add({ ...DEFAULT_LAYER_STYLE, source: newSource, topic })}>叠加话题</button>
    </div>
  );
}

function OverlayTopic({ entry, layers, update }: {
  entry: OverlayConfig; layers: readonly LayerBinding[]; update(entry: OverlayConfig): void;
}): React.JSX.Element {
  const topics = useCloudTopics(entry.source).filter(({ topic }) => topic === entry.topic ||
    !layers.some((layer) => layer.source === entry.source && layer.topic === topic));
  return (
    <select aria-label="图层话题" value={entry.topic} className={field}
      onChange={(event) => update({ ...entry, topic: event.target.value })}>
      {!topics.some(({ topic }) => topic === entry.topic) && <option value={entry.topic}>{entry.topic}</option>}
      {topics.map(({ topic }) => <option key={topic} value={topic}>{topic}</option>)}
    </select>
  );
}

const formatMs = (value: number | null | undefined) => value == null ? '—' : value.toFixed(2) + ' ms';
const formatMemory = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

export default function Viewer3D({ config }: { config: PanelConfig }): React.JSX.Element {
  const configure = useWorkspaceStore((state) => state.configure);
  const settings = config.pointCloud ?? emptyConfig;
  const scene = settings.scene ?? defaultScene;
  const overlayRows = settings.overlays;
  const bindings = useMemo(() => {
    const entries: LayerBinding[] = config.topic ? [
      { ...settings.primary, id: 'primary', topic: config.topic, source: config.source },
    ] : [];
    for (const overlay of overlayRows) {
      if (!entries.some((entry) => entry.source === overlay.source && entry.topic === overlay.topic)) {
        entries.push({ ...overlay, id: layerId(overlay) });
      }
    }
    return entries;
  }, [config.source, config.topic, settings.primary, overlayRows]);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<PointCloudViewerEngine | null>(null);
  const [stats, setStats] = useState<ViewerStats>();
  const [error, setError] = useState<string>();
  const [generation, retry] = useState(0);
  const latest = useRef({ settings, configure, id: config.id });
  latest.current = { settings, configure, id: config.id };
  const camera = scene.camera ?? defaultCamera;

  const saveCamera = useCallback((next: CameraState) => {
    const { settings, configure, id } = latest.current;
    const scene = settings.scene ?? defaultScene;
    if (JSON.stringify(scene.camera ?? defaultCamera) !== JSON.stringify(next)) {
      configure(id, { pointCloud: { ...settings, scene: { ...scene, camera: next } } });
    }
  }, []);

  useEffect(() => {
    try {
      viewer.current = new PointCloudViewerEngine(host.current!, messageBus, setStats, setError, saveCamera);
      const saved = latest.current.settings.scene?.camera;
      if (saved) viewer.current.restoreCamera(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [generation, saveCamera]);

  useEffect(() => {
    try {
      viewer.current?.sync(bindings);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [bindings, generation]);

  useEffect(() => {
    const { camera: _camera, ...settings } = scene;
    viewer.current?.configureScene(settings, config.source);
  }, [config.source, generation, scene]);

  function save(next: PointCloudConfig): void {
    configure(config.id, { pointCloud: next });
  }

  function editOverlay(index: number, patch?: OverlayConfig): void {
    save({ ...settings, overlays: patch ? overlayRows.map((entry, i) => i === index ? patch : entry)
      : overlayRows.filter((_, i) => i !== index) });
  }

  const reference = stats?.layers.find(({ visible }) => visible);
  const frames = [...new Set(['map', 'odom', 'base_link', ...(scene.fixedFrame ? [scene.fixedFrame] : []),
    ...(stats?.scene.flatMap(({ frames }) => frames.map(({ frame }) => frame)) ?? [])])];
  const updateScene = (patch: Partial<SceneSettings>) => save({ ...settings, scene: { ...scene, ...patch } });
  const tfError = stats?.scene.find(({ error }) => error)?.error;
  return (
    <div className="flex min-h-[250px] flex-1 flex-col gap-1 p-2 text-[11px] text-muted">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Fixed Frame
          <select data-fixed-frame className={field} value={scene.fixedFrame ?? ''}
            onChange={(e) => updateScene({ fixedFrame: e.target.value || null })}>
            <option value="">点云原坐标系</option>
            {frames.map((id) => <option key={id}>{id}</option>)}
          </select>
        </label>
        <button type="button" className={button} onClick={() => viewer.current?.resetView()}>重置视角</button>
        <button type="button" className={button} disabled={!reference && !stats?.scene.some((entry) => entry.poses || entry.markers)}
          onClick={() => viewer.current?.focus()}>聚焦点云</button>
        <select data-camera-preset aria-label="标准视角" className={field} value="" onChange={(e) => viewer.current?.preset(e.target.value as ViewPreset)}>
          <option value="" disabled>标准视角</option>
          {(Object.keys(viewPresets) as ViewPreset[]).map((id) => <option value={id} key={id}>{presetLabels[id]}</option>)}
        </select>
        <select data-camera-projection aria-label="投影" className={field} value={camera.projection}
          onChange={(e) => viewer.current?.setProjection(e.target.value as Projection)}>
          <option value="perspective">透视</option><option value="orthographic">正交</option>
        </select>
        <span>坐标系 <strong className="mono text-ink">{stats?.fixedFrame || '—'}</strong></span>
        <span>{stats?.points ? '已收到数据 · ' : ''}{stats?.points.toLocaleString() ?? '0'} 点</span>
        <span>{stats ? stats.fps.toFixed(1) + ' FPS' : '等待 WebGL2'}</span>
      </div>
      <div className="relative min-h-[175px] flex-1 overflow-hidden rounded border border-border bg-bg">
        <div ref={host} className="absolute inset-0" />
        {error && <div role="alert" className="absolute inset-0 grid place-content-center gap-2 bg-bg/90 p-4 text-danger">
          <span>{error}</span>
          <button type="button" className={button} onClick={() => {
            setError(undefined);
            setStats(undefined);
            retry((value) => value + 1);
          }}>重试 WebGL2</button>
        </div>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-3 mono" data-viewer-stats={stats ? JSON.stringify(stats) : undefined}>
        <span>{error ? '渲染暂停' : stats ? 'WebGL2 运行中' : '初始化中'}</span>
        <span>解码 {formatMs(stats?.decodeMs)}</span><span>处理 {formatMs(stats?.processMs)}</span>
        <span>上传提交 {formatMs(stats?.uploadSubmitMs)}</span><span>GPU 上传 {formatMs(stats?.uploadGpuMs)}</span>
        <span>帧 {formatMs(stats?.frameMs)}</span><span>队列 {stats?.queue ?? 0} / 峰值 {stats?.queuePeak ?? 0}</span>
        {!!stats?.tfPending && <span>待配对 TF {stats.tfPending}</span>}
        <span>丢弃显示帧 {stats?.dropped ?? 0}</span>
        <span>缓冲 CPU / GPU {formatMemory(stats?.cpuBytes ?? 0)} / {formatMemory(stats?.gpuBytes ?? 0)} MiB</span>
        {stats?.scene.length ? <span className={tfError ? 'text-danger' : 'text-ok'}>{tfError ?? 'TF 已就绪'}</span> : null}
      </div>
      {stats?.layers.map((layer) => <div key={layer.id} className="flex flex-wrap gap-x-2">
        <span className="mono text-ink">{bindings.find((entry) => entry.id === layer.id)?.displayName || layer.topic}</span>
        <span>{layer.frame || '未知坐标系'}</span>
        <span>{layer.count.toLocaleString()} 显示 / {layer.validCount.toLocaleString()} 有效 / {layer.inputCount.toLocaleString()} 原始</span>
        {layer.invalid > 0 && <span>无效 {layer.invalid}</span>}
        {layer.frameMismatch && <span className="text-danger">坐标系不同，已暂停叠加</span>}
        {layer.error && <span className="text-danger">{layer.logTimeNs ? '已收到数据 · ' : ''}{layer.error}</span>}
      </div>)}
      <details className="max-h-[180px] shrink-0 overflow-auto rounded border border-border p-2" data-cloud-config>
        <summary className="cursor-pointer">点云图层配置</summary>
        <div className="grid gap-2 pt-2">
          <div data-cloud-layer="primary" className="grid gap-1">
            <span className="mono text-ink">{config.topic ?? '主图层 · 请先选择话题'}</span>
            <LayerFields style={settings.primary} update={(primary) => save({ ...settings, primary })} />
          </div>
          {overlayRows.map((entry, index) => <div key={layerId(entry)} data-cloud-layer={entry.topic}
            className="grid gap-1 border-t border-border pt-1">
            <div className="flex items-center gap-2">
              <span>{sources[entry.source]}</span><OverlayTopic entry={entry} layers={bindings}
                update={(patch) => editOverlay(index, patch)} />
              <button type="button" className={button} onClick={() => editOverlay(index)}>移除图层</button>
            </div>
            <LayerFields style={entry} update={(style) => editOverlay(index, { ...entry, ...style })} />
          </div>)}
          {overlayRows.length < MAX_CLOUD_LAYERS - 1 && <AddLayer key={config.source} source={config.source} layers={bindings}
            add={(entry) => save({ ...settings, overlays: [...overlayRows, entry] })} />}
        </div>
      </details>
      <SceneControls settings={scene} scene={stats?.scene ?? []} update={updateScene} />
    </div>
  );
}
